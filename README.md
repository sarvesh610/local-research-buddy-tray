# 🤖 Local Research Buddy

> **A powerful AI-powered desktop assistant with 6 specialized modes, built for the Qvac SDK Hackathon**

![Local Research Buddy](https://img.shields.io/badge/Electron-App-blue) ![AI](https://img.shields.io/badge/AI-Powered-green) ![Hackathon](https://img.shields.io/badge/Qvac-Hackathon-purple) ![Voice](https://img.shields.io/badge/Voice-Enabled-orange) ![Health](https://img.shields.io/badge/Health-Analytics-red)

## ✨ Features

Local Research Buddy is an elegant desktop tray application that showcases the versatility of AI through **6 distinct specialized modes**, each with its own visual theme and optimized prompting strategy.

### 🎯 **6 AI-Powered Modes**

| Mode | Icon | Description | Use Case |
|------|------|-------------|----------|
| **📄 Folder Analyzer** | Blue Theme | Analyze and summarize documents with citations | Research papers, reports, meeting notes |
| **❤️ Health Coach** | Teal Theme | Personalized health coaching from Fitbit data | Sleep optimization, fitness planning, recovery |
| **🎙️ Voice Assistant** | Green Theme | Local speech-to-text with AI agent integration | Hands-free AI interaction, voice commands |
| **🤖 Agent** | Purple Theme | Multi-step AI agent with file system tools | Complex research tasks, data analysis |
| **🔒 Security Scanner** | Red Theme | System security analysis and vulnerability assessment | Security audits, risk assessment |
| **⚡ Code Generator** | Green Theme | Generate clean, documented code from requirements | Rapid prototyping, component creation |

### 🎨 **Visual Excellence**
- **Animated robot character** with mode-specific eye colors
- **Dynamic color themes** that change based on selected mode
- **ChatGPT-style streaming responses** with typewriter effects
- **Sleek modern UI** with smooth animations and hover effects
- **System tray integration** for seamless workflow integration

### 📁 **Smart File Processing**
- **Multiple formats**: PDF, DOCX, CSV, Markdown, Text files
- **Intelligent parsing** with fallback mechanisms
- **Batch processing** of entire directories
- **Optional file input** for various modes

### 🎙️ **Voice Features**
- **Local speech-to-text** using Whisper.cpp (no cloud required)
- **Real-time transcription** with live feedback
- **Voice command processing** through AI agent
- **Hands-free operation** for all AI modes
- **Privacy-focused** - all voice processing happens locally

## 🚀 Installation & Setup

### System Requirements

**Operating System Support:**
- **macOS 13.0+** (fully supported with voice features)
- **macOS 10.15-12.x** (supported, but voice features disabled)
- **Linux** (basic support, voice features require manual setup)
- **Windows** (basic support, voice features require manual setup)

**Dependencies:**
- **Node.js 18+** (download from [nodejs.org](https://nodejs.org/))
- **Git** for cloning repositories
- **OpenAI API Key** (get from [platform.openai.com](https://platform.openai.com/))
- **C++ compiler** (for whisper.cpp server compilation)

**Voice Feature Requirements (Optional):**
- **macOS**: Xcode command line tools, Metal support recommended
- **Linux**: GCC/Clang, CUDA optional for GPU acceleration
- **Windows**: Visual Studio Build Tools, CUDA optional

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-username/local-research-buddy-tray.git
cd local-research-buddy-tray

# Install dependencies
npm install
```

### 2. Environment Configuration

```bash
# Copy the environment template
cp .env.example .env

# Edit the .env file with your API key
echo "OPENAI_API_KEY=your_actual_api_key_here" >> .env
```

**Required Environment Variables:**
- `OPENAI_API_KEY` - Your OpenAI API key (required for all AI modes)

**Optional Variables:**
- `OPENAI_MODEL` - Model to use (default: "gpt-4o-mini")
- `WHISPER_MODEL_PATH` - Path to Whisper model (see Voice Setup below)
- `MAX_FILES` - Max files to process (default: 40)

### 3. Voice Setup (Optional but Recommended)

The voice feature requires **Whisper model files** for local speech recognition:

#### A. Install Whisper.cpp Server
This project uses the **whisper.cpp server mode** for voice processing:

**Step 1: Install Prerequisites**
```bash
# macOS - Install Xcode command line tools
xcode-select --install

# Linux (Ubuntu/Debian) - Install build tools
sudo apt update && sudo apt install build-essential

# Linux (Red Hat/CentOS) - Install build tools
sudo yum groupinstall "Development Tools"

# Windows - Install Visual Studio Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
```

**Step 2: Clone and Build whisper.cpp**
```bash
# Clone whisper.cpp repository
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Build the server
# macOS (with Metal acceleration)
make server

# Linux (CPU only)
make server

# Linux (with CUDA GPU support)
WHISPER_CUDA=1 make server

# Windows (use Developer Command Prompt)
# cmake -B build -DWHISPER_BUILD_SERVER=ON
# cmake --build build --config Release
```

**Step 3: Download Whisper Models**
```bash
# Download base English model (recommended, ~150MB)
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
  -o models/ggml-base.en.bin

# Alternative: smaller model (faster but less accurate)
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin" \
  -o models/ggml-small.en.bin

# Windows: Use PowerShell or download manually from browser
# Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" -OutFile "models/ggml-base.en.bin"
```

#### B. Start Whisper Server
**Before using voice features, you must start the whisper.cpp server:**

```bash
# Navigate to whisper.cpp directory
cd whisper.cpp

# Start server with your chosen model
# macOS/Linux:
./server -m models/ggml-base.en.bin --port 8081 --host 127.0.0.1

# Windows:
# build\bin\Release\server.exe -m models\ggml-base.en.bin --port 8081 --host 127.0.0.1

# The server should show:
# whisper server listening at http://127.0.0.1:8081
```

**Keep this server running** while using Local Research Buddy's voice features.

**Performance Options:**
```bash
# macOS with Metal GPU acceleration
./server -m models/ggml-base.en.bin --port 8081 --host 127.0.0.1 -ngl 1

# Linux with CUDA GPU acceleration
./server -m models/ggml-base.en.bin --port 8081 --host 127.0.0.1 -ngl 30

# CPU-only (all platforms)
./server -m models/ggml-base.en.bin --port 8081 --host 127.0.0.1 -t 4
```

#### C. Build Voice Binary (macOS Only)
```bash
# The Swift voice binary should be pre-built, but if needed:
cd src/voice/whisper-binary/
swift build -c release

# Note: Voice binary only works on macOS 13.0+
# Other platforms will use text-only modes
```

#### D. Platform-Specific Notes

**macOS:**
- Voice features require macOS 13.0+ (uses ScreenCaptureKit)
- Microphone permissions will be requested automatically
- Metal GPU acceleration recommended for best performance

**Linux:**
- Voice features require manual whisper.cpp server setup
- Swift voice binary not supported (macOS-specific APIs)
- All other modes work normally

**Windows:**
- Voice features require manual whisper.cpp server setup
- Swift voice binary not supported (macOS-specific APIs)
- All other modes work normally

### 4. Health Analytics Setup (Optional)

For the **Health Coach** mode, you'll need Fitbit data:

#### A. Export Fitbit Data
1. Go to [Fitbit Data Export](https://www.fitbit.com/export/user/data)
2. Request your data archive
3. Download and extract when ready

#### B. Setup Data Folder
```bash
# Place extracted data in Downloads
# Expected structure:
# ~/Downloads/Takeout/Fitbit/Global Export Data/
#   ├── sleep-*.json
#   ├── steps-*.json
#   └── calories-*.json
```

### 5. Launch Application

```bash
# Development mode
npm start

# The app will appear in your system tray
# Click the tray icon or look for the floating robot assistant
```

### 6. First Run Verification

1. **Basic functionality**: Try Folder Analyzer mode with any text files
2. **Voice feature**: Click Voice mode - you should see microphone permissions request
3. **Health mode**: If you have Fitbit data, try Health Coach mode
4. **Agent mode**: Try asking "List files in the current directory"

## 🎮 Usage Examples

### 📄 **Folder Analyzer Mode**
Perfect for research and document analysis:
```
Input: Select folder containing research papers, reports, or documents
Prompt: "Summarize key findings and identify common themes across all papers"
Output: Structured summary with citations and key insights
```

### ❤️ **Health Coach Mode**
Personalized health insights from your Fitbit data:
```
Input: ~/Downloads/Takeout/Fitbit/ (your exported Fitbit data)
Prompt: "Create a 7-day sleep and fitness optimization plan based on my data"
Output: Personalized sleep schedule, workout plan, and recovery recommendations
```

### 🎙️ **Voice Assistant Mode**
Hands-free AI interaction with local speech recognition:
```
Action: Click "Start Recording" and speak naturally
Voice Input: "Analyze the documents in my Downloads folder and summarize the main findings"
Output: Real-time transcription → AI processing → spoken results
```

**Voice Commands Examples:**
- "List all PDF files in my project directory"
- "Summarize the meeting notes from yesterday"
- "Generate a React component for user login"
- "Analyze my Fitbit sleep data"

### 🤖 **Agent Mode**
Multi-step AI agent with file system access:
```
Input: Optional working directory
Prompt: "Find all JavaScript files mentioning 'authentication', read the top 3, and create a security analysis"
Agent Steps: list_files → read_text → analyze → summarize
Output: Comprehensive analysis with file references
```

### 🔒 **Security Scanner Mode**
System vulnerability assessment:
```
Input: No files needed (scans current system)
Prompt: "Perform a comprehensive security audit of my system"
Output: Security score, vulnerability assessment, and remediation steps
```

### ⚡ **Code Generator Mode**
From requirements to implementation:
```
Input: Optional reference code or documentation
Prompt: "Create a React component for user authentication with form validation"
Output: Complete, documented React component with best practices
```

## 🔧 Technical Architecture

### **Multi-Modal AI System**
- **Specialized prompting** for each mode type
- **Context-aware processing** based on file types and user intent
- **Streaming response handling** for real-time feedback

### **File Processing Pipeline**
```
File Input → Parser Selection → Text Extraction → AI Processing → Streaming Output
```

### **Supported Formats**
- **PDF**: pdf-parse + pdfjs-dist fallback
- **DOCX**: mammoth.js extraction
- **CSV**: Structured data parsing
- **Text/Markdown**: Direct processing
- **Audio**: Local Whisper.cpp for voice transcription
- **Health Data**: Fitbit JSON export analysis

### **Voice Architecture**
```
Microphone → Swift Binary → HTTP Request → Whisper.cpp Server → Local Transcription → AI Agent → Response
```

**Privacy Features:**
- All voice processing happens **locally** on your machine
- Uses local whisper.cpp server (no cloud APIs)
- No audio data sent to external services
- Whisper model runs on your hardware
- Temporary audio chunks auto-deleted after processing
- Server runs on localhost only (127.0.0.1:8081)

## 🎯 Qvac SDK Integration

This application is **architecturally designed** for seamless **Qvac SDK** integration. The modular provider system allows for easy switching between AI backends:

```javascript
// Current: OpenAI implementation
const provider = process.env.AI_PROVIDER || "openai";

// Future: Qvac SDK implementation
const provider = process.env.AI_PROVIDER || "qvac";
```

### **Qvac SDK Benefits (Coming Soon)**

When the Qvac SDK becomes available, Local Research Buddy will gain:

#### **🔒 Enhanced Privacy**
- **100% local processing** - no data leaves your device
- **No API keys required** - eliminates external dependencies
- **Decentralized P2P networking** - no central points of failure

#### **🚀 Superior Performance**
- **Local AI models** - faster response times
- **Offline capability** - works without internet
- **Native transcription** - replace whisper.cpp server dependency
- **Multimodal processing** - enhanced document and audio analysis

#### **⚡ Advanced Features**
- **Real-time transcription** with `transcribeStream()`
- **Text embeddings & RAG** for smarter document analysis
- **Translation capabilities** for new international modes
- **Text-to-speech** for voice responses

### **Current Integration Status**

**✅ Ready for Qvac SDK:**
- Abstracted AI provider interface in `src/core/summarizer.js`
- Mode-specific prompt engineering system
- Streaming response handling architecture
- Comprehensive error handling and fallbacks
- Placeholder Qvac implementation already in codebase

**🔄 Integration Points Prepared:**
```javascript
// Voice transcription: Ready to replace whisper.cpp server
async function callQvacTranscription(audioStream) {
  const modelId = await loadModel(WHISPER_TINY, {
    modelType: "whisper",
    modelConfig: { mode: "caption", output_format: "plaintext" }
  });
  return await transcribeStream(modelId, audioStream);
}

// AI completions: Ready to replace OpenAI API
async function callQvacCompletion(prompt, context) {
  return await qvac.complete({
    prompt, context,
    mode: 'local',
    streaming: true
  });
}
```

**🎯 Migration Plan:**
1. **Phase 1**: Replace OpenAI API calls with Qvac completions
2. **Phase 2**: Integrate Qvac transcription to eliminate whisper.cpp dependency
3. **Phase 3**: Add new modes leveraging Qvac's multimodal capabilities
4. **Phase 4**: Implement P2P networking for collaborative features

## 🏆 Hackathon Highlights

### **Innovation**
- **6-in-1 AI tool** showcasing diverse use cases
- **Local voice recognition** with privacy-first approach
- **Health data analytics** with personalized coaching
- **Multi-step AI agent** with file system tools
- **Visual mode switching** with theme changes
- **Smart file processing** with multiple format support

### **User Experience**
- **Zero-configuration** for multiple modes
- **Hands-free voice interaction** with local processing
- **Health insights** from personal Fitbit data
- **Real-time streaming responses** with visual feedback
- **System tray integration** for seamless productivity
- **Intuitive icon-based interface**

### **Technical Excellence**
- **Privacy-focused architecture** (local voice processing)
- **Clean modular design** ready for SDK integration
- **Comprehensive error handling** with graceful fallbacks
- **Production-ready** security and performance
- **Cross-platform** Electron application
- **Extensible plugin system** for new modes

## 🔧 Troubleshooting

### Voice Issues

**"Voice binary not found" or voice mode disabled:**
```bash
# Check if binary exists
ls -la src/voice/whisper-binary/LucidTalkStreamer

# If missing, the app will still work without voice features
# Voice mode will show as disabled but won't crash
```

**"Whisper server request failed" or connection refused:**
```bash
# Check if whisper.cpp server is running
curl http://127.0.0.1:8081/

# If not running, start the server:
cd whisper.cpp
./server -m models/ggml-base.en.bin --port 8081 --host 127.0.0.1

# Verify server is responding:
# Should return: "whisper.cpp server"
```

**Microphone permissions denied:**
1. Go to **System Preferences** → **Security & Privacy** → **Privacy** → **Microphone**
2. Enable microphone access for your terminal app or Electron
3. Restart the application

**Voice transcription not working:**
```bash
# 1. Ensure whisper.cpp server is running
curl http://127.0.0.1:8081/

# 2. Check server logs for processing
# In whisper.cpp directory, server should show:
# "POST /inference HTTP/1.1 200"

# 3. Check app console for voice activity
npm start
# Look for: "WhisperProcessor: Processing audio file via server"
```

### Health Mode Issues

**"Fitbit data not found" error:**
```bash
# Check folder structure
ls -la ~/Downloads/Takeout/Fitbit/Global\ Export\ Data/

# Should contain files like:
# sleep-2024-*.json
# steps-2024-*.json
# calories-2024-*.json
```

**Empty health analysis:**
- Ensure your Fitbit export contains recent data (last 14 days)
- Check that JSON files are not empty
- Verify the export completed successfully from Fitbit

### General Issues

**"OPENAI_API_KEY is not set" error:**
```bash
# Check .env file exists
cat .env

# Should contain:
OPENAI_API_KEY=sk-...your-key...

# Verify no extra spaces or quotes
```

**App won't start:**
```bash
# Check Node.js version
node --version
# Should be 18+

# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**File processing errors:**
- Ensure files aren't corrupted or password-protected
- Check file permissions (readable by the app)
- Try with smaller file sets first

**System tray icon not appearing:**
- The app runs as a menu bar application
- Look in the top-right corner of your screen
- Try clicking where other menu bar icons appear

### Performance Tips

**Large file processing:**
- Use `MAX_FILES=20` in .env for faster processing
- Break large directories into smaller chunks
- Prefer recent/relevant files over entire archives

**Voice performance:**
- Use `ggml-base.en.bin` for best English accuracy
- Use `ggml-small.en.bin` for faster but less accurate processing
- Speak clearly and pause between commands
- Ensure whisper.cpp server has adequate CPU/GPU resources
- Consider using GPU acceleration: `./server -m models/ggml-base.en.bin --port 8081 -ngl 1`

**Memory usage:**
- The app automatically limits file processing to prevent memory issues
- Restart occasionally if processing many large files

## 📦 Build & Distribution

### Development
```bash
npm start
```

### Production Build
```bash
# Package for macOS
npm run pack

# Create distributable DMG
npm run dist

# The built app will be in the dist/ folder
```

### Building Voice Components (Advanced)
```bash
# If you need to rebuild the Swift voice binary:
cd src/voice/whisper-binary/
swift build -c release

# Copy the built binary to the expected location
cp .build/release/LucidTalkStreamer ./LucidTalkStreamer
```

## 🤝 Contributing

This project is open for contributions! Areas for enhancement:

### Core Features
- Additional AI providers integration (Anthropic, local models)
- More file format support (PowerPoint, Excel, images)
- Extended prompt templates for specialized domains
- UI/UX improvements and accessibility features

### Voice & Audio
- Support for additional languages in Whisper
- Voice activity detection improvements
- Audio preprocessing and noise reduction
- Voice synthesis for AI responses

### Health Analytics
- Support for other health platforms (Apple Health, Google Fit)
- Advanced health metrics and correlations
- Integration with nutrition tracking
- Sleep stage analysis improvements

### Agent System
- Additional tools for file manipulation
- Web scraping and research capabilities
- Integration with external APIs and services
- Multi-modal agent workflows

### Architecture
- Plugin system for custom modes
- Local model support (llama.cpp, etc.)
- Performance optimizations
- Enhanced security features

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙋 Support

For questions or support, please open an issue on GitHub.

---

**Built with ❤️ for the Qvac SDK Hackathon**

> Showcasing the future of AI-powered desktop productivity tools