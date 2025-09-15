import AVFoundation
import ScreenCaptureKit
import Foundation

// Audio buffer for Whisper.cpp (16kHz mono PCM)
struct AudioChunk {
    let data: Data
    let sampleRate: Int
    let channels: Int
    let timestamp: TimeInterval
}

protocol AudioStreamerDelegate: AnyObject {
    func audioStreamer(_ streamer: AudioStreamer, didCaptureChunk chunk: AudioChunk)
    func audioStreamer(_ streamer: AudioStreamer, didEncounterError error: Error)
}

@available(macOS 13.0, *)
class AudioStreamer: NSObject, SCStreamDelegate, SCStreamOutput {
    weak var delegate: AudioStreamerDelegate?
    
    // Audio capture components
    private var screenCaptureStream: SCStream?
    private var audioEngine: AVAudioEngine?
    private var microphoneInputNode: AVAudioInputNode?
    
    // Audio processing
    private let targetSampleRate: Double = 16000  // Whisper.cpp optimal
    private let targetChannels: UInt32 = 1        // Mono for Whisper
    private let chunkDuration: TimeInterval = 1.2  // 1.2-second chunks for Whisper minimum requirement
    
    // Separate buffer management for meeting mode
    private var microphoneBuffer: [Float] = []
    private var systemBuffer: [Float] = []
    private var lastChunkTime: TimeInterval = 0
    private let bufferLock = NSLock()
    
    // Audio heartbeat detection
    private var lastMicrophoneActivity: TimeInterval = 0
    private var lastSystemActivity: TimeInterval = 0
    private var heartbeatTimer: Timer?
    
    // Adaptive gain for post-call recovery
    private var recentMicLevels: [Float] = []
    private var adaptiveGainMultiplier: Float = 1.0
    private var lastCallDetectionTime: Date?
    
    // Stream configuration
    private var contentFilter: SCContentFilter?
    private var streamConfiguration: SCStreamConfiguration
    
    override init() {
        self.streamConfiguration = SCStreamConfiguration()
        super.init()
        configureStream()
        setupAudioSessionNotifications()
    }
    
    // MARK: - Public Interface
    
    func startStreaming() async throws {
        ResponseHandler.log("Requesting permissions...")
        try await requestPermissions()
        
        // Setup microphone FIRST to ensure it's always available
        ResponseHandler.log("🔄 Setting up microphone capture first...")
        try setupMicrophoneCapture()
        ResponseHandler.log("✅ Microphone capture ready")
        
        // Try system audio second, with graceful fallback if blocked
        ResponseHandler.log("Setting up system audio capture...")
        do {
            try await setupSystemAudioCapture()
            ResponseHandler.log("✅ System audio capture ready")
        } catch {
            ResponseHandler.log("⚠️ System audio blocked (virtual audio device detected): \(error)")
            ResponseHandler.log("🎙️ Continuing with microphone-only mode...")
            ResponseHandler.log("💡 To fix: Quit Microsoft Teams and restart LucidTalk")
        }
        
        ResponseHandler.log("✅ Audio streaming started - microphone ready...")
        
        // Start audio heartbeat monitoring
        startAudioHeartbeatMonitoring()
    }
    
    func stopStreaming() {
        ResponseHandler.log("🛑 stopStreaming() called")
        stopSystemAudioCapture()
        stopMicrophoneCapture()
        clearBuffer()
        
        // Remove audio session notifications
        NotificationCenter.default.removeObserver(self)
        
        // Stop heartbeat monitoring
        stopAudioHeartbeatMonitoring()
        
        ResponseHandler.log("Audio streaming stopped")
    }
    
    // MARK: - Permissions
    
    private func requestPermissions() async throws {
        // Check screen recording permission
        if !CGPreflightScreenCaptureAccess() {
            ResponseHandler.log("Screen recording permission not granted - requesting...")
            let granted = CGRequestScreenCaptureAccess()
            if !granted {
                ResponseHandler.log("Screen recording permission denied by user")
                throw AudioStreamerError.permissionDenied
            } else {
                ResponseHandler.log("Screen recording permission granted")
            }
        } else {
            ResponseHandler.log("Screen recording permission already granted")
        }
        
        // Check microphone permission (macOS uses different API)
        ResponseHandler.log("Checking microphone permission...")
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            ResponseHandler.log("Microphone permission already granted")
        case .denied, .restricted:
            ResponseHandler.log("Microphone permission denied")
            throw AudioStreamerError.permissionDenied
        case .notDetermined:
            ResponseHandler.log("Requesting microphone permission...")
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            if !granted {
                ResponseHandler.log("Microphone permission denied by user")
                throw AudioStreamerError.permissionDenied
            } else {
                ResponseHandler.log("Microphone permission granted")
            }
        @unknown default:
            ResponseHandler.log("Unknown microphone permission status")
        }
    }
    
    // MARK: - System Audio Capture
    
    private func setupSystemAudioCapture() async throws {
        ResponseHandler.log("🔊 Attempting system audio capture with multiple strategies...")
        
        // Strategy 1: Try with more permissive content filter
        do {
            try await setupSystemAudioWithPermissiveFilter()
            ResponseHandler.log("✅ System audio working with permissive filter")
            return
        } catch {
            ResponseHandler.log("⚠️ Permissive filter failed: \(error)")
        }
        
        // Strategy 2: Try excluding all applications (sometimes helps with virtual audio conflicts)
        do {
            try await setupSystemAudioExcludingApps()
            ResponseHandler.log("✅ System audio working with app exclusion")
            return
        } catch {
            ResponseHandler.log("⚠️ App exclusion failed: \(error)")
        }
        
        // Strategy 3: Try with minimal configuration
        do {
            try await setupSystemAudioMinimal()
            ResponseHandler.log("✅ System audio working with minimal config")
            return
        } catch {
            ResponseHandler.log("⚠️ All system audio strategies failed: \(error)")
            throw error
        }
    }
    
    private func setupSystemAudioWithPermissiveFilter() async throws {
        ResponseHandler.log("🔊 Strategy 1: Permissive filter")
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        
        guard let display = content.displays.first else {
            throw AudioStreamerError.noDisplayFound
        }
        
        contentFilter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        
        guard let filter = contentFilter else {
            throw AudioStreamerError.filterCreationFailed
        }
        
        screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)
        
        try screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))
        try await screenCaptureStream?.startCapture()
    }
    
    private func setupSystemAudioExcludingApps() async throws {
        ResponseHandler.log("🔊 Strategy 2: Excluding applications")
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        
        guard let display = content.displays.first else {
            throw AudioStreamerError.noDisplayFound
        }
        
        // Get list of running applications to exclude potential problematic ones
        let apps = content.applications
        let excludeApps = apps.filter { app in
            // Exclude apps that might interfere with audio capture
            app.applicationName.lowercased().contains("teams") ||
            app.applicationName.lowercased().contains("zoom") ||
            app.applicationName.lowercased().contains("discord") ||
            app.applicationName.lowercased().contains("slack")
        }
        
        ResponseHandler.log("🚫 Excluding \(excludeApps.count) potentially problematic apps")
        
        contentFilter = SCContentFilter(display: display, excludingApplications: excludeApps, exceptingWindows: [])
        
        guard let filter = contentFilter else {
            throw AudioStreamerError.filterCreationFailed
        }
        
        screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)
        
        try screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))
        try await screenCaptureStream?.startCapture()
    }
    
    private func setupSystemAudioMinimal() async throws {
        ResponseHandler.log("🔊 Strategy 3: Minimal configuration")
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        
        guard let display = content.displays.first else {
            throw AudioStreamerError.noDisplayFound
        }
        
        // Use minimal stream configuration
        let minimalConfig = SCStreamConfiguration()
        minimalConfig.width = 1
        minimalConfig.height = 1
        minimalConfig.minimumFrameInterval = CMTime(value: 1, timescale: 1) // Very low frame rate
        minimalConfig.showsCursor = false
        minimalConfig.capturesAudio = true
        minimalConfig.sampleRate = 16000 // Lower sample rate
        minimalConfig.channelCount = 1
        minimalConfig.queueDepth = 3 // Smaller queue
        
        contentFilter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        
        guard let filter = contentFilter else {
            throw AudioStreamerError.filterCreationFailed
        }
        
        screenCaptureStream = SCStream(filter: filter, configuration: minimalConfig, delegate: self)
        
        try screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .utility))
        try await screenCaptureStream?.startCapture()
    }
    
    private func stopSystemAudioCapture() {
        Task {
            try? await screenCaptureStream?.stopCapture()
        }
        screenCaptureStream = nil
        contentFilter = nil
    }
    
    private func configureStream() {
        streamConfiguration.width = 2
        streamConfiguration.height = 2
        streamConfiguration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale.max)
        streamConfiguration.showsCursor = false
        streamConfiguration.capturesAudio = true
        streamConfiguration.sampleRate = Int(targetSampleRate)
        streamConfiguration.channelCount = Int(targetChannels)
        
        // Optimize for audio quality
        streamConfiguration.queueDepth = 6
    }
    
    // MARK: - Microphone Capture
    
    private func setupMicrophoneCapture() throws {
        ResponseHandler.log("🎤 Setting up microphone capture...")
        audioEngine = AVAudioEngine()
        guard let engine = audioEngine else { 
            ResponseHandler.log("❌ Failed to create audio engine")
            return 
        }
        
        // Monitor audio engine state changes
        ResponseHandler.log("🔍 Audio engine state: running=\(engine.isRunning)")
        
        microphoneInputNode = engine.inputNode
        guard let inputNode = microphoneInputNode else {
            ResponseHandler.log("❌ Failed to get input node")
            throw AudioStreamerError.microphoneSetupFailed
        }
        
        // Convert to target format for Whisper.cpp
        let inputFormat = inputNode.outputFormat(forBus: 0)
        ResponseHandler.log("📊 Input format: \(inputFormat)")
        guard let targetFormat = AVAudioFormat(standardFormatWithSampleRate: targetSampleRate, channels: targetChannels) else {
            ResponseHandler.log("❌ Failed to create target format")
            throw AudioStreamerError.formatConversionFailed
        }
        ResponseHandler.log("📊 Target format: \(targetFormat)")
        
        // Install tap to capture microphone audio with higher quality buffer
        ResponseHandler.log("🔧 Installing audio tap...")
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, time in
            // Log every 500th tap to avoid spam
            if Int.random(in: 1...500) == 1 {
                ResponseHandler.log("🎤 Microphone tap active with \(buffer.frameLength) frames")
            }
            self?.processMicrophoneBuffer(buffer, format: targetFormat)
        }
        
        ResponseHandler.log("▶️ Starting audio engine...")
        try engine.start()
        ResponseHandler.log("✅ Audio engine started successfully")
    }
    
    private func stopMicrophoneCapture() {
        audioEngine?.stop()
        microphoneInputNode?.removeTap(onBus: 0)
        audioEngine = nil
        microphoneInputNode = nil
    }
    
    // MARK: - Audio Processing
    
    private func processMicrophoneBuffer(_ buffer: AVAudioPCMBuffer, format targetFormat: AVAudioFormat) {
        // Convert to target format if needed
        guard let convertedBuffer = convertBuffer(buffer, to: targetFormat) else { 
            ResponseHandler.log("⚠️ Failed to convert microphone buffer")
            return 
        }
        
        // Reduced logging for microphone processing
        if Int.random(in: 1...100) == 1 {
            ResponseHandler.log("🎤 Processing microphone audio: \(convertedBuffer.frameLength) frames")
        }
        
        // Add to streaming buffer
        addToBuffer(convertedBuffer, source: "microphone")
    }
    
    private func processSystemAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        // Convert to target format
        guard let targetFormat = AVAudioFormat(standardFormatWithSampleRate: targetSampleRate, channels: targetChannels),
              let convertedBuffer = convertBuffer(buffer, to: targetFormat) else { return }
        
        // Add to streaming buffer
        addToBuffer(convertedBuffer, source: "system")
    }
    
    private func convertBuffer(_ buffer: AVAudioPCMBuffer, to targetFormat: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard let converter = AVAudioConverter(from: buffer.format, to: targetFormat) else { 
            ResponseHandler.log("Warning: Failed to create audio converter from \(buffer.format) to \(targetFormat)")
            return nil 
        }
        
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * targetFormat.sampleRate / buffer.format.sampleRate)
        guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else { 
            ResponseHandler.log("Warning: Failed to create converted buffer with capacity \(capacity)")
            return nil 
        }
        
        var error: NSError?
        let status = converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
            outStatus.pointee = .haveData
            return buffer
        }
        
        guard status == .haveData, error == nil else { 
            if let error = error {
                ResponseHandler.log("Warning: Audio conversion failed: \(error)")
            }
            return nil 
        }
        return convertedBuffer
    }
    
    private func addToBuffer(_ buffer: AVAudioPCMBuffer, source: String) {
        bufferLock.lock()
        defer { bufferLock.unlock() }
        
        // Update heartbeat tracking
        let currentTime = CFAbsoluteTimeGetCurrent()
        if source == "microphone" {
            lastMicrophoneActivity = currentTime
        } else {
            lastSystemActivity = currentTime
        }
        
        // Convert PCM buffer to Float array
        guard let floatChannelData = buffer.floatChannelData else { 
            ResponseHandler.log("Warning: No float channel data from \(source)")
            return 
        }
        let frameLength = Int(buffer.frameLength)
        let channelData = floatChannelData[0]
        
        // Process audio with appropriate gain and add to separate buffers
        var totalPower: Float = 0
        let baseGain: Float = source == "microphone" ? 3.2 : 1.6
        let adaptiveGain: Float = source == "microphone" ? getAdaptiveMicrophoneGain() : 1.0
        let gain: Float = baseGain * adaptiveGain
        
        for i in 0..<frameLength {
            let sample = channelData[i] * gain
            totalPower += abs(sample)
            
            // Add to appropriate buffer
            if source == "microphone" {
                microphoneBuffer.append(sample)
            } else {
                systemBuffer.append(sample)
            }
        }
        let averagePower = totalPower / Float(frameLength)
        
        // Track microphone levels for adaptive gain
        if source == "microphone" {
            recentMicLevels.append(averagePower)
            if recentMicLevels.count > 30 { // Keep last 30 samples
                recentMicLevels.removeFirst()
            }
        }
        class Logger {
    static var logCounter = 0
}
        // Reduce logging frequency - only log significant audio changes or occasionally
        
        Logger.logCounter += 1
        
        if averagePower > 0.005 && Logger.logCounter % 50 == 0 {
            ResponseHandler.log("🔊 Audio detected from \(source): level=\(String(format: "%.4f", averagePower)), frames=\(frameLength)")
        } else if averagePower <= 0.001 && Logger.logCounter % 200 == 0 {
            ResponseHandler.log("🔇 Low audio from \(source): level=\(String(format: "%.4f", averagePower))")
        }
        
        // Check if we have enough data for processing (prioritize the more active source)
        let samplesNeeded = Int(targetSampleRate * chunkDuration)
        let minSamplesForEarlyProcessing = Int(targetSampleRate * 0.5)  // 0.5 seconds minimum
        
        // Process immediately when enough data is available
        if microphoneBuffer.count >= samplesNeeded || systemBuffer.count >= samplesNeeded {
            sendMeetingAudioChunk(currentTime)
        }
        // Early processing on speech pause (silence detection for faster response)
        else if (currentTime - lastChunkTime > 0.6) && // At least 0.6 seconds since last chunk (faster response)
                (microphoneBuffer.count >= minSamplesForEarlyProcessing || systemBuffer.count >= minSamplesForEarlyProcessing) &&
                averagePower < 0.001 { // Low current activity (speech pause) - more sensitive
            if Logger.logCounter % 20 == 0 { // Only log occasionally
                ResponseHandler.log("Processing early due to speech pause")
            }
            sendMeetingAudioChunk(currentTime)
        }
    }
    
    private func sendMeetingAudioChunk(_ timestamp: TimeInterval) {
        let samplesPerChunk = Int(targetSampleRate * chunkDuration)
        
        // Calculate average levels for better comparison (avoid buffer overflow)
        let micSampleCount = min(8000, microphoneBuffer.count)
        let sysSampleCount = min(8000, systemBuffer.count)
        
        let micLevel = micSampleCount > 0 ? microphoneBuffer.suffix(micSampleCount).map { abs($0) }.reduce(0, +) / Float(micSampleCount) : 0.0
        let sysLevel = sysSampleCount > 0 ? systemBuffer.suffix(sysSampleCount).map { abs($0) }.reduce(0, +) / Float(sysSampleCount) : 0.0
        
        var chunkSamples: [Float] = []
        var sourceInfo = ""
        
        // Smart dual-source prioritization for meeting scenarios
        // More sensitive microphone detection to compete with YouTube audio
        if microphoneBuffer.count >= samplesPerChunk && micLevel > 0.001 {
            // Microphone activity detected - prioritize user voice over system audio
            chunkSamples = Array(microphoneBuffer.prefix(samplesPerChunk))
            microphoneBuffer.removeFirst(min(samplesPerChunk, microphoneBuffer.count))
            sourceInfo = "🎤 Microphone PRIORITY (mic: \(String(format: "%.4f", micLevel)), sys: \(String(format: "%.4f", sysLevel)))"
            
        } else if systemBuffer.count >= samplesPerChunk && sysLevel > 0.005 && micLevel <= 0.001 {
            // System audio activity (YouTube, meeting participants) when mic is quiet
            chunkSamples = Array(systemBuffer.prefix(samplesPerChunk))
            systemBuffer.removeFirst(min(samplesPerChunk, systemBuffer.count))
            sourceInfo = "🔊 System audio (YouTube/meeting - mic: \(String(format: "%.4f", micLevel)), sys: \(String(format: "%.4f", sysLevel)))"
            
        } else if microphoneBuffer.count >= samplesPerChunk && micLevel > 0.0005 {
            // Fallback: very weak microphone activity (distant speech)
            chunkSamples = Array(microphoneBuffer.prefix(samplesPerChunk))
            microphoneBuffer.removeFirst(min(samplesPerChunk, microphoneBuffer.count))
            sourceInfo = "🎤 Microphone fallback (weak speech - mic: \(String(format: "%.4f", micLevel)), sys: \(String(format: "%.4f", sysLevel)))"
            
        } else {
            // Clean up buffers if no significant activity to prevent memory issues
            if microphoneBuffer.count > samplesPerChunk * 2 {
                microphoneBuffer.removeFirst(samplesPerChunk)
            }
            if systemBuffer.count > samplesPerChunk * 2 {
                systemBuffer.removeFirst(samplesPerChunk)
            }
            return // Not enough audio activity
        }
        
        ResponseHandler.log("\(sourceInfo) - sending \(chunkDuration)s chunk")
        
        // Convert to Data for Whisper.cpp
        let data = Data(bytes: chunkSamples, count: chunkSamples.count * MemoryLayout<Float>.size)
        
        let chunk = AudioChunk(
            data: data,
            sampleRate: Int(targetSampleRate),
            channels: Int(targetChannels),
            timestamp: timestamp
        )
        
        // Send to delegate (Whisper.cpp processor)
        ResponseHandler.log("📦 Sending audio chunk to Whisper: \(chunkSamples.count) samples (\(sourceInfo))")
        DispatchQueue.main.async {
            self.delegate?.audioStreamer(self, didCaptureChunk: chunk)
        }
        
        lastChunkTime = timestamp
    }
    
    private func sendAudioChunk(_ timestamp: TimeInterval) {
        // Legacy method - redirect to meeting mode
        sendMeetingAudioChunk(timestamp)
    }
    
    private func clearBuffer() {
        bufferLock.lock()
        microphoneBuffer.removeAll()
        systemBuffer.removeAll()
        bufferLock.unlock()
    }
    
    // MARK: - SCStreamOutput Delegate
    
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .audio else { return }
        guard let audioBuffer = sampleBuffer.asPCMBuffer else { return }
        
        processSystemAudioBuffer(audioBuffer)
    }
    
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        ResponseHandler.log("System audio stream stopped with error: \(error)")
        
        // Check if this is the common interruption error (error -3805)
        if (error as NSError).code == -3805 {
            ResponseHandler.log("⚠️ ScreenCaptureKit interrupted (likely by call or virtual audio device)")
            ResponseHandler.log("🔄 Attempting to recover system audio capture in 2 seconds...")
            
            // Schedule recovery attempt after a short delay
            DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 2.0) { [weak self] in
                guard let self = self else { return }
                Task {
                    await self.attemptSystemAudioRecovery()
                }
            }
            return
        }
        
        // Only propagate unexpected errors
        ResponseHandler.log("Unexpected system audio error: \(error)")
        delegate?.audioStreamer(self, didEncounterError: error)
    }
    
    // MARK: - Audio Session Management
    
    private func setupAudioSessionNotifications() {
        // On macOS, listen for audio engine configuration changes instead of AVAudioSession
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(audioEngineConfigurationChanged),
            name: .AVAudioEngineConfigurationChange,
            object: audioEngine
        )
        
        ResponseHandler.log("🔔 macOS audio notifications setup complete")
    }
    
    @objc private func audioEngineConfigurationChanged(notification: Notification) {
        ResponseHandler.log("🔄 Audio engine configuration changed - attempting recovery...")
        
        // This fires when calls start/end, audio devices change, etc.
        // Schedule a recovery attempt after a short delay to avoid rapid-fire attempts
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self = self else { return }
            Task {
                await self.attemptSystemAudioRecovery()
            }
        }
    }
    
    // MARK: - Audio Recovery
    
    private func attemptSystemAudioRecovery() async {
        ResponseHandler.log("🔄 Attempting system audio recovery...")
        
        // First, clean up the failed stream
        stopSystemAudioCapture()
        
        // Wait a moment for audio session to stabilize
        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        
        // Check if we can detect active calls or audio conflicts
        checkForAudioConflicts()
        
        // Try to restart system audio capture with multiple strategies
        for attempt in 1...3 {
            do {
                ResponseHandler.log("🔄 Recovery attempt \(attempt)/3...")
                try await setupSystemAudioCapture()
                ResponseHandler.log("✅ System audio recovery successful on attempt \(attempt)!")
                return // Success, exit retry loop
            } catch {
                ResponseHandler.log("⚠️ Recovery attempt \(attempt) failed: \(error)")
                
                if attempt < 3 {
                    // Wait longer between attempts
                    try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
                }
            }
        }
        
        ResponseHandler.log("❌ All recovery attempts failed - continuing with microphone-only mode")
        ResponseHandler.log("🔄 Will retry recovery in 10 seconds...")
        
        // Schedule another recovery attempt in 10 seconds
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 10.0) { [weak self] in
            guard let self = self else { return }
            Task {
                await self.attemptSystemAudioRecovery()
            }
        }
    }
    
    private func checkForAudioConflicts() {
        // Check for common call/meeting applications that might be using audio
        let runningApps = NSWorkspace.shared.runningApplications
        let callApps = runningApps.filter { app in
            guard let bundleId = app.bundleIdentifier else { return false }
            let appName = app.localizedName?.lowercased() ?? ""
            
            return bundleId.contains("whatsapp") ||
                   bundleId.contains("zoom") ||
                   bundleId.contains("teams") ||
                   bundleId.contains("skype") ||
                   bundleId.contains("facetime") ||
                   bundleId.contains("FaceTime") ||
                   bundleId.contains("discord") ||
                   bundleId.contains("meet") ||
                   bundleId.contains("webex") ||
                   appName.contains("facetime") ||
                   appName.contains("whatsapp") ||
                   appName.contains("zoom") ||
                   appName.contains("teams")
        }
        
        if !callApps.isEmpty {
            let appNames = callApps.compactMap { $0.localizedName }.joined(separator: ", ")
            ResponseHandler.log("📞 Detected active call/meeting apps: \(appNames)")
            ResponseHandler.log("🎯 These apps may be interfering with system audio capture")
            
            // Update call detection time for adaptive gain
            updateCallDetection()
            
            // Schedule microphone health check after problematic call apps
            DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 3.0) { [weak self] in
                guard let self = self else { return }
                Task {
                    await self.checkMicrophoneHealth()
                }
            }
        } else {
            ResponseHandler.log("✅ No obvious call/meeting app conflicts detected")
        }
    }
    
    // MARK: - Audio Heartbeat Monitoring
    
    private func startAudioHeartbeatMonitoring() {
        lastMicrophoneActivity = CFAbsoluteTimeGetCurrent()
        lastSystemActivity = CFAbsoluteTimeGetCurrent()
        
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.checkAudioHeartbeat()
        }
        
        ResponseHandler.log("💓 Audio heartbeat monitoring started")
    }
    
    private func stopAudioHeartbeatMonitoring() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        ResponseHandler.log("💓 Audio heartbeat monitoring stopped")
    }
    
    private func checkAudioHeartbeat() {
        let currentTime = CFAbsoluteTimeGetCurrent()
        let micSilentTime = currentTime - lastMicrophoneActivity
        let sysSilentTime = currentTime - lastSystemActivity
        
        // Alert if both audio sources have been silent for too long
        if micSilentTime > 10.0 && sysSilentTime > 10.0 {
            ResponseHandler.log("🚨 AUDIO DEATH DETECTED! Mic silent: \(Int(micSilentTime))s, Sys silent: \(Int(sysSilentTime))s")
            ResponseHandler.log("🔧 Checking audio engine state...")
            
            if let engine = audioEngine {
                ResponseHandler.log("🔍 Audio engine running: \(engine.isRunning)")
                if !engine.isRunning {
                    ResponseHandler.log("💀 Audio engine has stopped! This is the bug!")
                }
            }
            
            // Trigger recovery attempt
            Task {
                await attemptAudioSystemRecovery()
            }
        } else if micSilentTime > 5.0 {
            ResponseHandler.log("⚠️ Microphone silent for \(Int(micSilentTime))s")
        } else if sysSilentTime > 5.0 {
            ResponseHandler.log("⚠️ System audio silent for \(Int(sysSilentTime))s")
        }
    }
    
    private func attemptAudioSystemRecovery() async {
        ResponseHandler.log("🆘 Attempting full audio system recovery...")
        
        // Try to restart the entire audio capture system
        stopMicrophoneCapture()
        stopSystemAudioCapture()
        
        try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
        
        do {
            try setupMicrophoneCapture()
            ResponseHandler.log("✅ Microphone recovery successful!")
        } catch {
            ResponseHandler.log("❌ Microphone recovery failed: \(error)")
        }
        
        do {
            try await setupSystemAudioCapture()
            ResponseHandler.log("✅ System audio recovery successful!")
        } catch {
            ResponseHandler.log("❌ System audio recovery failed: \(error)")
        }
    }
    
    // MARK: - Adaptive Gain Management
    
    private func getAdaptiveMicrophoneGain() -> Float {
        // Track recent microphone levels for adaptive gain
        let currentTime = Date()
        
        // Debug: Always log when this function is called
        if recentMicLevels.count % 20 == 0 && recentMicLevels.count > 0 {
            ResponseHandler.log("🔍 getAdaptiveMicrophoneGain called - samples: \(recentMicLevels.count), lastCall: \(lastCallDetectionTime != nil ? "YES" : "NO")")
        }
        
        // If we detected call apps recently, apply adaptive gain
        if let lastCallTime = lastCallDetectionTime,
           currentTime.timeIntervalSince(lastCallTime) < 60.0 { // Within 60 seconds of call
            
            // Calculate average mic level from recent samples
            if recentMicLevels.count >= 10 {
                let avgLevel = recentMicLevels.suffix(10).reduce(0, +) / Float(10)
                
                // If levels are low after call (indicating call reset the gain), boost it
                if avgLevel < 0.025 { // Raised threshold to catch WhatsApp-level drops
                    adaptiveGainMultiplier = min(adaptiveGainMultiplier * 1.3, 6.0) // Stronger boost, higher max
                    ResponseHandler.log("🔊 Boosting mic gain to \(String(format: "%.1f", adaptiveGainMultiplier))x (avg level: \(String(format: "%.4f", avgLevel)))")
                } else if avgLevel > 0.04 { // Good level, reduce boost gradually
                    adaptiveGainMultiplier = max(adaptiveGainMultiplier * 0.95, 1.0) // Gradually return to normal
                    ResponseHandler.log("🔉 Reducing mic gain to \(String(format: "%.1f", adaptiveGainMultiplier))x (avg level: \(String(format: "%.4f", avgLevel)))")
                }
                
                // Debug logging for adaptive gain
                ResponseHandler.log("🎚️ Adaptive gain check: avg=\(String(format: "%.4f", avgLevel)), multiplier=\(String(format: "%.1f", adaptiveGainMultiplier)), samples=\(recentMicLevels.count)")
                
                // Keep only recent samples
                if recentMicLevels.count > 20 {
                    recentMicLevels.removeFirst(10)
                }
            }
        } else {
            // No recent calls, reset to normal gain
            adaptiveGainMultiplier = 1.0
        }
        
        return adaptiveGainMultiplier
    }
    
    private func updateCallDetection() {
        // Called when we detect call apps - updates lastCallDetectionTime
        lastCallDetectionTime = Date()
        ResponseHandler.log("⏰ updateCallDetection() called - lastCallDetectionTime set to \(lastCallDetectionTime!)")
    }
    
    // MARK: - Microphone Health Check
    
    private func checkMicrophoneHealth() async {
        ResponseHandler.log("🔍 Checking microphone health after call app detection...")
        
        // Check if audio engine is still running
        guard let engine = audioEngine else {
            ResponseHandler.log("❌ Audio engine is nil - restarting microphone capture")
            await restartMicrophoneCapture()
            return
        }
        
        if !engine.isRunning {
            ResponseHandler.log("❌ Audio engine stopped - restarting microphone capture")
            await restartMicrophoneCapture()
            return
        }
        
        // Check if we're still getting microphone input
        let timeSinceLastMic = CFAbsoluteTimeGetCurrent() - lastMicrophoneActivity
        if timeSinceLastMic > 5.0 {
            ResponseHandler.log("❌ No microphone activity for \(Int(timeSinceLastMic))s - restarting microphone capture")
            await restartMicrophoneCapture()
        } else {
            ResponseHandler.log("✅ Microphone appears healthy (last activity: \(Int(timeSinceLastMic))s ago)")
        }
    }
    
    private func restartMicrophoneCapture() async {
        ResponseHandler.log("🔄 Restarting microphone capture after call interference...")
        
        // Stop current microphone
        stopMicrophoneCapture()
        
        // Wait a moment for cleanup
        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        
        // Restart microphone
        do {
            try setupMicrophoneCapture()
            ResponseHandler.log("✅ Microphone capture restarted successfully!")
        } catch {
            ResponseHandler.log("❌ Failed to restart microphone: \(error)")
        }
    }
}

// MARK: - Extensions

@available(macOS 13.0, *)
extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate, channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

// MARK: - Error Types

enum AudioStreamerError: Error, LocalizedError {
    case permissionDenied
    case noDisplayFound
    case filterCreationFailed
    case microphoneSetupFailed
    case formatConversionFailed
    
    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Screen recording permission denied"
        case .noDisplayFound:
            return "No display found for audio capture"
        case .filterCreationFailed:
            return "Failed to create content filter"
        case .microphoneSetupFailed:
            return "Failed to setup microphone"
        case .formatConversionFailed:
            return "Audio format conversion failed"
        }
    }
}

// MARK: - Utility

class ResponseHandler {
    static func log(_ message: String) {
        // Send debug logs to stderr instead of stdout
        fputs("AudioStreamer: \(message)\n", stderr)
        fflush(stderr)
    }
}