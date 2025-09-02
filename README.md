# 🤖 Local Research Buddy

> **A powerful AI-powered desktop assistant with 4 specialized modes, built for the Qvac SDK Hackathon**

![Local Research Buddy](https://img.shields.io/badge/Electron-App-blue) ![AI](https://img.shields.io/badge/AI-Powered-green) ![Hackathon](https://img.shields.io/badge/Qvac-Hackathon-purple)

## ✨ Features

Local Research Buddy is an elegant desktop tray application that showcases the versatility of AI through **4 distinct specialized modes**, each with its own visual theme and optimized prompting strategy.

### 🎯 **4 AI-Powered Modes**

| Mode | Icon | Description | Use Case |
|------|------|-------------|----------|
| **📄 Document Summarizer** | Blue Theme | Analyze and summarize documents with citations | Research papers, reports, meeting notes |
| **✉️ Email Writer** | Orange Theme | Generate professional emails from context | Business correspondence, follow-ups |
| **🔍 Directory Analyzer** | Purple Theme | Analyze codebase structure and architecture | Code reviews, technical documentation |
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
- **Optional file input** for Email Writer and Code Generator modes

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- OpenAI API key (temporary - will use Qvac SDK when available)

### Installation
```bash
git clone git@github.com:sarvesh610/local-research-buddy-tray.git
cd local-research-buddy-tray
npm install
```

### Setup
1. Copy `.env.example` to `.env`
2. Add your OpenAI API key:
```bash
OPENAI_API_KEY=your_key_here
```

### Run
```bash
npm start
```

## 🎮 Usage Examples

### 📄 **Document Summarizer Mode**
Perfect for research and analysis:
```
Input: Select folder containing research papers
Prompt: "Summarize key findings and identify common themes across all papers"
Output: Structured summary with citations and key insights
```

### ✉️ **Email Writer Mode** 
Generate professional emails instantly:
```
Input: Optional context documents
Prompt: "Write a follow-up email after our product demo meeting"
Output: Complete professional email ready to send
```

### 🔍 **Directory Analyzer Mode**
Understand any codebase quickly:
```
Input: Project directory
Prompt: "Analyze the architecture and identify the main components"
Output: Technical overview with dependency analysis
```

### ⚡ **Code Generator Mode**
From idea to implementation:
```
Input: Optional reference code
Prompt: "Create a React component for user authentication with form validation"  
Output: Complete, documented React component
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

## 🎯 Qvac SDK Integration

This application is designed with **Qvac SDK** integration in mind. The modular architecture allows for easy provider switching:

```javascript
// Current: OpenAI implementation
const provider = process.env.AI_PROVIDER || "openai";

// Future: Qvac SDK implementation  
const provider = process.env.AI_PROVIDER || "qvac";
```

**Ready for Qvac SDK:**
- ✅ Abstracted AI provider interface
- ✅ Mode-specific prompt engineering
- ✅ Streaming response handling
- ✅ Error handling and fallbacks

## 🏆 Hackathon Highlights

### **Innovation**
- **4-in-1 AI tool** showcasing versatility
- **Visual mode switching** with theme changes
- **Smart file processing** with multiple format support

### **User Experience** 
- **Zero-configuration** for Email Writer and Code Generator
- **Intuitive icon-based interface**
- **Real-time streaming responses**
- **System tray integration** for productivity

### **Technical Excellence**
- **Clean modular architecture** ready for SDK integration
- **Robust error handling** with graceful fallbacks
- **Cross-platform** Electron application
- **Production-ready** code quality

## 📦 Build & Distribution

### Development
```bash
npm start
```

### Production Build
```bash  
npm run build
# Creates distributable packages for all platforms
```

## 🤝 Contributing

This project is open for contributions! Areas for enhancement:
- Additional AI providers integration
- More file format support  
- Extended prompt templates
- UI/UX improvements

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙋 Support

For questions or support, please open an issue on GitHub.

---

**Built with ❤️ for the Qvac SDK Hackathon**

> Showcasing the future of AI-powered desktop productivity tools