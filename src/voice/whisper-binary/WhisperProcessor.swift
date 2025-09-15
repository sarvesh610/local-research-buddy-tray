import Foundation

// Protocol for transcription results
protocol WhisperProcessorDelegate: AnyObject {
    func whisperProcessor(_ processor: WhisperProcessor, didTranscribe text: String, timestamp: TimeInterval)
    func whisperProcessor(_ processor: WhisperProcessor, didEncounterError error: Error)
}

class WhisperProcessor: NSObject, AudioStreamerDelegate {
    weak var delegate: WhisperProcessorDelegate?
    
    // Whisper server integration
    private var isProcessing: Bool = false
    private var isWhisperBusy: Bool = false
    private let processingQueue = DispatchQueue(label: "whisper.processing", qos: .userInteractive)
    
    // Audio chunk management
    private var pendingChunks: [AudioChunk] = []
    private let chunkLock = NSLock()
    private var chunkCounter: Int = 0
    
    // Temporary audio files for processing
    private let tempDirectory: URL
    
    init(modelPath: String? = nil) {
        // Create temporary directory for audio chunks
        self.tempDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("mindmeet_audio_chunks")
        
        super.init()
        
        // Ensure temp directory exists
        try? FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        
        ResponseHandler.log("WhisperProcessor initialized with server mode")
    }
    
    // MARK: - Public Interface
    
    func startProcessing() {
        isProcessing = true
        ResponseHandler.log("Whisper processor started")
    }
    
    func stopProcessing() {
        ResponseHandler.logWhisper("Stopping Whisper processor...")
        isProcessing = false
        
        // Wait a bit for any running processes to finish
        Thread.sleep(forTimeInterval: 0.5)
        
        clearPendingChunks()
        ResponseHandler.logWhisper("Whisper processor stopped")
    }
    
    // MARK: - AudioStreamerDelegate
    
    func audioStreamer(_ streamer: AudioStreamer, didCaptureChunk chunk: AudioChunk) {
        guard isProcessing else { return }
        
        // Skip if Whisper is already processing
        if isWhisperBusy {
            ResponseHandler.logWhisper("Skipping chunk - Whisper still busy")
            return
        }
        
        chunkLock.lock()
        
        // Limit pending chunks to prevent delays (smaller queue for faster response)
        if pendingChunks.count > 1 {
            ResponseHandler.logWhisper("Dropping old chunk - keeping queue short for real-time response")
            pendingChunks.removeFirst()
        }
        
        pendingChunks.append(chunk)
        let chunksInQueue = pendingChunks.count
        chunkLock.unlock()
        
        ResponseHandler.logWhisper("Audio chunk queued (\(chunksInQueue) pending)")
        
        // Process chunk asynchronously without blocking
        processingQueue.async {
            self.processAudioChunk(chunk)
        }
    }
    
    func audioStreamer(_ streamer: AudioStreamer, didEncounterError error: Error) {
        delegate?.whisperProcessor(self, didEncounterError: error)
    }
    
    // MARK: - Whisper.cpp Integration
    
    private func processAudioChunk(_ chunk: AudioChunk) {
        isWhisperBusy = true
        let startTime = CFAbsoluteTimeGetCurrent()
        
        // Processing started - UI feedback handled at completion
        
        defer {
            isWhisperBusy = false
            removeProcessedChunk(chunk)
        }
        
        do {
            // Save audio chunk to temporary WAV file
            let audioFileURL = try saveAudioChunkToFile(chunk)
            
            // Process with Whisper.cpp
            try processAudioFileWithWhisper(audioFileURL, timestamp: chunk.timestamp)
            
            let processingTime = CFAbsoluteTimeGetCurrent() - startTime
            ResponseHandler.logWhisper("Chunk processed in \(String(format: "%.2f", processingTime))s")
            
        } catch {
            ResponseHandler.logWhisper("Chunk processing failed: \(error)")
            // Don't crash the app - just log the error and continue
            // DispatchQueue.main.async {
            //     self.delegate?.whisperProcessor(self, didEncounterError: error)
            // }
        }
    }
    
    private func saveAudioChunkToFile(_ chunk: AudioChunk) throws -> URL {
        chunkCounter += 1
        let filename = "chunk_\(chunkCounter).wav"
        let fileURL = tempDirectory.appendingPathComponent(filename)
        
        // Convert Float data to PCM data for WAV file
        let floatData = chunk.data.withUnsafeBytes { bytes in
            return Array(bytes.bindMemory(to: Float.self))
        }
        
        // Create WAV file with proper format
        try createWAVFile(at: fileURL, 
                         samples: floatData, 
                         sampleRate: chunk.sampleRate, 
                         channels: chunk.channels)
        
        return fileURL
    }
    
    private func createWAVFile(at url: URL, samples: [Float], sampleRate: Int, channels: Int) throws {
        // Convert Float samples to Int16 PCM
        let pcmSamples = samples.map { sample -> Int16 in
            let clampedSample = max(-1.0, min(1.0, sample))
            return Int16(clampedSample * Float(Int16.max))
        }
        
        // WAV file header
        let dataSize = pcmSamples.count * 2 // 2 bytes per sample (Int16)
        let fileSize = 36 + dataSize
        
        var wavData = Data()
        
        // RIFF header
        wavData.append("RIFF".data(using: .ascii)!)
        wavData.append(withUnsafeBytes(of: UInt32(fileSize).littleEndian) { Data($0) })
        wavData.append("WAVE".data(using: .ascii)!)
        
        // fmt chunk
        wavData.append("fmt ".data(using: .ascii)!)
        wavData.append(withUnsafeBytes(of: UInt32(16).littleEndian) { Data($0) }) // fmt chunk size
        wavData.append(withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) })  // PCM format
        wavData.append(withUnsafeBytes(of: UInt16(channels).littleEndian) { Data($0) })
        wavData.append(withUnsafeBytes(of: UInt32(sampleRate).littleEndian) { Data($0) })
        wavData.append(withUnsafeBytes(of: UInt32(sampleRate * channels * 2).littleEndian) { Data($0) }) // byte rate
        wavData.append(withUnsafeBytes(of: UInt16(channels * 2).littleEndian) { Data($0) }) // block align
        wavData.append(withUnsafeBytes(of: UInt16(16).littleEndian) { Data($0) }) // bits per sample
        
        // data chunk
        wavData.append("data".data(using: .ascii)!)
        wavData.append(withUnsafeBytes(of: UInt32(dataSize).littleEndian) { Data($0) })
        
        // PCM data
        for sample in pcmSamples {
            wavData.append(withUnsafeBytes(of: sample.littleEndian) { Data($0) })
        }
        
        try wavData.write(to: url)
    }
    
    private func processAudioFileWithWhisper(_ audioURL: URL, timestamp: TimeInterval) throws {
        ResponseHandler.logWhisper("Processing audio file via server: \(audioURL.path)")
        
        do {
            // Send audio file to whisper server via HTTP
            let transcriptionResult = try sendAudioToWhisperServer(audioURL)
            
            // Parse the server response
            parseWhisperServerResponse(transcriptionResult, timestamp: timestamp)
            
        } catch {
            ResponseHandler.logWhisper("Whisper server request failed: \(error)")
            throw error
        }
        
        // Clean up temporary file
        try? FileManager.default.removeItem(at: audioURL)
    }
    
    private func sendAudioToWhisperServer(_ audioURL: URL) throws -> String {
        let serverURL = URL(string: "http://127.0.0.1:8081/inference")!
        var request = URLRequest(url: serverURL)
        request.httpMethod = "POST"
        
        // Create multipart form data
        let boundary = "----WhisperBoundary\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var formData = Data()
        
        // Add audio file
        let audioData = try Data(contentsOf: audioURL)
        formData.append("--\(boundary)\r\n".data(using: .utf8)!)
        formData.append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n".data(using: .utf8)!)
        formData.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        formData.append(audioData)
        formData.append("\r\n".data(using: .utf8)!)
        
        // Add temperature parameter for deterministic output
        formData.append("--\(boundary)\r\n".data(using: .utf8)!)
        formData.append("Content-Disposition: form-data; name=\"temperature\"\r\n\r\n".data(using: .utf8)!)
        formData.append("0.0\r\n".data(using: .utf8)!)
        
        // Add response format
        formData.append("--\(boundary)\r\n".data(using: .utf8)!)
        formData.append("Content-Disposition: form-data; name=\"response_format\"\r\n\r\n".data(using: .utf8)!)
        formData.append("json\r\n".data(using: .utf8)!)
        
        // Close boundary
        formData.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = formData
        
        // Send synchronous request
        let semaphore = DispatchSemaphore(value: 0)
        var result: String = ""
        var requestError: Error?
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            
            if let error = error {
                requestError = error
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                requestError = WhisperProcessorError.processingFailed
                return
            }
            
            ResponseHandler.logWhisper("Server response status: \(httpResponse.statusCode)")
            
            if httpResponse.statusCode != 200 {
                requestError = WhisperProcessorError.processingFailed
                return
            }
            
            guard let data = data,
                  let responseString = String(data: data, encoding: .utf8) else {
                requestError = WhisperProcessorError.processingFailed
                return
            }
            
            result = responseString
        }.resume()
        
        semaphore.wait()
        
        if let error = requestError {
            throw error
        }
        
        return result
    }
    
    private func parseWhisperServerResponse(_ jsonResponse: String, timestamp: TimeInterval) {
        ResponseHandler.logWhisper("Server response: \(jsonResponse)")
        
        // Parse JSON response from whisper server
        guard let jsonData = jsonResponse.data(using: .utf8),
              let jsonObject = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let text = jsonObject["text"] as? String else {
            ResponseHandler.logWhisper("Failed to parse JSON response")
            return
        }
        
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        ResponseHandler.logWhisper("Parsed transcription from server: '\(cleanText)'")
        
        // Only send non-empty transcriptions to avoid UI clutter
        DispatchQueue.main.async {
            if !cleanText.isEmpty && !self.isNonSpeechContent(cleanText) {
                self.delegate?.whisperProcessor(self, didTranscribe: cleanText, timestamp: timestamp)
            } else {
                ResponseHandler.logWhisper("No speech detected or filtered - skipping empty result")
            }
        }
    }
    
    
    // MARK: - Audio Content Filtering
    
    private func isNonSpeechContent(_ text: String) -> Bool {
        let lowercased = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Filter out very short or repetitive content (likely keyboard/mouse sounds)
        if lowercased.count < 3 {
            return true
        }
        
        // Filter out repetitive characters (like "aaa", "mmm" from background noise)
        if isRepetitiveText(lowercased) {
            return true
        }
        
        // Filter out common non-speech patterns
        let nonSpeechPatterns = [
            // Background noise interpretations
            "hmm", "uhh", "ahh", "ohh", "ehh",
            // Keyboard/typing sounds often transcribed as:
            "click", "tap", "type", "typing", "keyboard", "keyboard clicking",
            // Mouse sounds
            "mouse", "scroll", "scrolling",
            // Music-related
            "music", "song", "beat", "melody", "instrumental",
            // System sounds
            "beep", "ping", "notification", "alert",
            // Breathing/mouth sounds
            "breath", "sigh", "cough", "sniff",
            // Filler sounds that are too short to be meaningful
            "uh", "um", "er", "ah", "oh", "mm",
            // Common misinterpretations of background noise
            "static", "noise", "ambient", "background",
            // Fan and HVAC sounds (commonly transcribed as these)
            "fan", "air", "conditioning", "ventilation", "wind", "breeze",
            "whir", "hum", "buzz", "whirr", "whoosh", "rushing",
            // Other ambient appliance sounds
            "refrigerator", "fridge", "heater", "radiator", "appliance",
            "motor", "engine", "running", "humming", "buzzing",
            // Water/liquid sounds
            "water", "drip", "dripping", "flowing", "gurgle",
            // Electronic interference
            "electrical", "interference", "static", "hiss", "crackle",
            // Single letters or numbers (often noise)
            "a", "e", "i", "o", "u", "1", "2", "3", "4", "5"
        ]
        
        // Check if text matches any non-speech pattern
        for pattern in nonSpeechPatterns {
            if lowercased == pattern || lowercased.contains(pattern) && lowercased.count <= pattern.count + 2 {
                ResponseHandler.logWhisper("Filtered non-speech content: '\(text)'")
                return true
            }
        }
        
        // Filter out text that's mostly punctuation or special characters
        let alphanumericCount = lowercased.filter { $0.isLetter || $0.isNumber }.count
        if alphanumericCount < lowercased.count / 2 {
            return true
        }
        
        return false
    }
    
    private func isRepetitiveText(_ text: String) -> Bool {
        guard text.count > 2 else { return false }
        
        // Check if text is mostly the same character repeated
        let firstChar = text.first!
        let sameCharCount = text.filter { $0 == firstChar }.count
        return Double(sameCharCount) / Double(text.count) > 0.7
    }
    
    // MARK: - Chunk Management
    
    private func removeProcessedChunk(_ processedChunk: AudioChunk) {
        chunkLock.lock()
        pendingChunks.removeAll { chunk in
            chunk.timestamp == processedChunk.timestamp
        }
        chunkLock.unlock()
    }
    
    private func clearPendingChunks() {
        chunkLock.lock()
        pendingChunks.removeAll()
        chunkLock.unlock()
    }
}

// MARK: - Whisper.cpp Integration Points

extension WhisperProcessor {
    
    // TODO: Implement actual Whisper.cpp integration
    /*
    
    // Load Whisper model
    private func loadWhisperModel() throws {
        // whisper_init_from_file(modelPath)
    }
    
    // Process audio with Whisper
    private func processWithWhisper(_ audioData: [Float]) -> String? {
        // Convert Float array to whisper format
        // whisper_full(context, params, audioData, samples)
        // Extract transcribed text
        return nil
    }
    
    // Cleanup Whisper resources
    private func cleanupWhisper() {
        // whisper_free(context)
    }
    
    */
}

// MARK: - Error Types

enum WhisperProcessorError: Error, LocalizedError {
    case modelNotFound
    case modelLoadFailed
    case processingFailed
    case unsupportedAudioFormat
    
    var errorDescription: String? {
        switch self {
        case .modelNotFound:
            return "Whisper model file not found"
        case .modelLoadFailed:
            return "Failed to load Whisper model"
        case .processingFailed:
            return "Audio processing failed"
        case .unsupportedAudioFormat:
            return "Unsupported audio format for Whisper"
        }
    }
}

// MARK: - Utility Extensions

extension ResponseHandler {
    static func logWhisper(_ message: String) {
        // Send debug logs to stderr instead of stdout
        fputs("WhisperProcessor: \(message)\n", stderr)
        fflush(stderr)
    }
}