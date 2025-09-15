import Foundation

// Main application class for real-time transcription
class MindMeetStreamer: NSObject, WhisperProcessorDelegate {
    private let audioStreamer: AudioStreamer
    private var whisperProcessor: WhisperProcessor
    private var isRunning: Bool = false
    
    // Command line arguments
    private var outputMode: OutputMode = .realtime
    private var modelPath: String?
    
    enum OutputMode {
        case realtime    // Stream transcription to stdout
        case batch       // Process and output final result
    }
    
    override init() {
        if #available(macOS 13.0, *) {
            self.audioStreamer = AudioStreamer()
        } else {
            // Fallback for older macOS versions (microphone only)
            fatalError("macOS 13.0 or later is required for system audio capture")
        }
        
        self.whisperProcessor = WhisperProcessor()
        super.init()
        
        // Set up delegation chain
        if #available(macOS 13.0, *) {
            audioStreamer.delegate = whisperProcessor
        }
        whisperProcessor.delegate = self
        
        processCommandLineArguments()
        
        // Update model path if provided via command line
        if let modelPath = self.modelPath {
            self.whisperProcessor = WhisperProcessor(modelPath: modelPath)
            self.whisperProcessor.delegate = self
            if #available(macOS 13.0, *) {
                audioStreamer.delegate = whisperProcessor
            }
        }
    }
    
    // MARK: - Command Line Processing
    
    private func processCommandLineArguments() {
        let arguments = CommandLine.arguments
        
        // Check for help
        if arguments.contains("--help") || arguments.contains("-h") {
            printUsage()
            exit(0)
        }
        
        // Check for model path
        if let modelIndex = arguments.firstIndex(of: "--model"), modelIndex + 1 < arguments.count {
            modelPath = arguments[modelIndex + 1]
        }
        
        // Check for output mode
        if arguments.contains("--batch") {
            outputMode = .batch
        }
        
        // Validate arguments
        guard arguments.contains("--start") else {
            printUsage()
            exit(1)
        }
    }
    
    private func printUsage() {
        let usage = """
        MindMeet Real-time Transcription Streamer
        
        Usage: MindMeetStreamer --start [options]
        
        Options:
            --start                 Start real-time transcription
            --model <path>          Path to Whisper model (optional)
            --batch                 Batch mode (vs real-time streaming)
            --help, -h              Show this help message
        
        Examples:
            MindMeetStreamer --start
            MindMeetStreamer --start --model ./models/ggml-small.bin
            MindMeetStreamer --start --batch
        
        Output:
            Real-time mode: JSON objects streamed to stdout
            Batch mode: Final transcript on completion
        """
        
        print(usage)
    }
    
    // MARK: - Main Execution
    
    func run() async {
        do {
            // Setup signal handlers for graceful shutdown
            setupSignalHandlers()
            
            // Start the transcription pipeline
            try await startTranscription()
            
            // Keep running until interrupted
            await waitForInterruption()
            
        } catch {
            outputError(error)
            exit(1)
        }
    }
    
    private func startTranscription() async throws {
        isRunning = true
        
        // Start Whisper processor
        whisperProcessor.startProcessing()
        
        // Start audio streaming
        if #available(macOS 13.0, *) {
            try await audioStreamer.startStreaming()
        } else {
            throw NSError(domain: "MindMeetError", code: 1, userInfo: [NSLocalizedDescriptionKey: "macOS 13.0 or later required"])
        }
        
        outputStatus("Transcription started - listening...")
    }
    
    private func stopTranscription() {
        ResponseHandler.log("🛑 stopTranscription() called from MindMeetStreamer")
        guard isRunning else { 
            ResponseHandler.log("⚠️ stopTranscription called but already stopped")
            return 
        }
        
        isRunning = false
        
        // Stop components
        if #available(macOS 13.0, *) {
            audioStreamer.stopStreaming()
        }
        whisperProcessor.stopProcessing()
        
        outputStatus("Transcription stopped")
    }
    
    private func setupSignalHandlers() {
        let signalHandler: @convention(c) (Int32) -> Void = { signal in
            ResponseHandler.log("🚨 Received signal: \(signal)")
            if signal == SIGINT || signal == SIGTERM {
                ResponseHandler.log("🛑 SIGINT/SIGTERM received - shutting down gracefully")
                // Graceful shutdown
                DispatchQueue.main.async {
                    if let streamer = MindMeetStreamer.shared {
                        streamer.stopTranscription()
                        streamer.outputStatus("Shutting down...")
                        exit(0)
                    }
                }
            }
        }
        
        signal(SIGINT, signalHandler)
        signal(SIGTERM, signalHandler)
    }
    
    private func waitForInterruption() async {
        // Keep the main thread alive using async waiting
        while isRunning {
            try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
        }
    }
    
    // MARK: - WhisperProcessorDelegate
    
    func whisperProcessor(_ processor: WhisperProcessor, didTranscribe text: String, timestamp: TimeInterval) {
        outputTranscription(text: text, timestamp: timestamp)
    }
    
    func whisperProcessor(_ processor: WhisperProcessor, didEncounterError error: Error) {
        // Log the error but don't crash the app
        ResponseHandler.log("Whisper processor error (non-fatal): \(error)")
        // Don't output error to UI to avoid crashes
        // outputError(error)
    }
    
    // MARK: - Output Methods
    
    private func outputTranscription(text: String, timestamp: TimeInterval) {
        switch outputMode {
        case .realtime:
            let output: [String: Any] = [
                "type": "transcription",
                "text": text,
                "timestamp": timestamp + 978307200, // Convert CFAbsoluteTime to Unix timestamp
                "iso_timestamp": ISO8601DateFormatter().string(from: Date(timeIntervalSinceReferenceDate: timestamp))
            ]
            outputJSON(output)
            
        case .batch:
            // Store for batch output (implement as needed)
            break
        }
    }
    
    private func outputStatus(_ message: String) {
        let output: [String: Any] = [
            "type": "status",
            "message": message,
            "timestamp": CFAbsoluteTimeGetCurrent() + 978307200 // Convert to Unix timestamp
        ]
        outputJSON(output)
    }
    
    private func outputError(_ error: Error) {
        let output: [String: Any] = [
            "type": "error",
            "message": error.localizedDescription,
            "timestamp": CFAbsoluteTimeGetCurrent() + 978307200 // Convert to Unix timestamp
        ]
        outputJSON(output)
    }
    
    private func outputJSON(_ object: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: object, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
                fflush(stdout)
            }
        } catch {
            print("{\"type\":\"error\",\"message\":\"JSON serialization failed\"}")
            fflush(stdout)
        }
    }
    
    // MARK: - Singleton for signal handling
    static var shared: MindMeetStreamer?
}

// MARK: - Main Entry Point

@main
struct MindMeetApp {
    static func main() async {
        let streamer = MindMeetStreamer()
        MindMeetStreamer.shared = streamer
        
        await streamer.run()
    }
}