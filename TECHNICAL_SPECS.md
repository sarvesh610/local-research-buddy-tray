# 🔧 Technical Specifications - Local Research Buddy

## Architecture Overview

### Application Structure
```
local-research-buddy-tray/
├── main.js              # Electron main process & IPC handlers
├── renderer.html        # UI structure & styling  
├── renderer.js          # Frontend logic & mode switching
├── preload.cjs         # Secure IPC bridge
├── summarizer.js       # AI processing & provider abstraction
└── package.json        # Dependencies & scripts
```

### Technology Stack
- **Frontend**: Electron, HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js with ES modules
- **AI Integration**: OpenAI API (ready for Qvac SDK)
- **File Processing**: pdf-parse, mammoth, csv-parse
- **System Integration**: Electron system tray

## Core Components

### 1. Mode Management System

#### Mode Configuration
```javascript
const modeConfig = {
    summarizer: {
        placeholder: "Summarize key themes and list findings",
        directoryLabel: "Directory", 
        buttonText: "Summarize",
        requiresFiles: true
    },
    email: {
        placeholder: "Write professional email based on context",
        directoryLabel: "Documents (optional)",
        buttonText: "Generate Email", 
        requiresFiles: false
    }
    // ... other modes
};
```

#### Visual Theme System
```css
[data-mode="summarizer"] {
    --accent: #8bd3ff;
    --btn-bg: #0f1a34;
    --eye-color: #8bd3ff;
}

[data-mode="generator"] {
    --accent: #26de81;  
    --btn-bg: #0a1f0f;
    --eye-color: #26de81;
}
```

### 2. AI Provider Abstraction

#### Provider Interface
```javascript
async function summarizeWithProvider(provider, userPrompt, docs, mode) {
    switch (provider) {
        case "qvac":
            return await callQvac(userPrompt, docs, mode);
        case "openai": 
            return await callOpenAI(userPrompt, docs, mode);
        default:
            return fallbackProvider(userPrompt, docs);
    }
}
```

#### Qvac SDK Integration Points
```javascript
// Environment configuration
const QVAC_API_KEY = process.env.QVAC_API_KEY || "";
const QVAC_MODEL = process.env.QVAC_MODEL || "default";

// Placeholder implementation ready for SDK
async function callQvac(userPrompt, docs, mode = 'summarizer') {
    // TODO: Replace with actual Qvac SDK calls
    const qvacClient = new QvacSDK({ apiKey: QVAC_API_KEY });
    
    const response = await qvacClient.complete({
        model: QVAC_MODEL,
        prompt: getModePrompts(mode, userPrompt, docs).guidance,
        context: docs.map(d => d.text).join('\n'),
        mode: mode
    });
    
    return {
        output: response.text,
        tokens: response.usage?.total_tokens || 0
    };
}
```

### 3. File Processing Pipeline

#### Supported Formats & Handlers
```javascript
const processors = {
    '.pdf': async (path) => {
        // Primary: pdf-parse for speed
        // Fallback: pdfjs-dist for complex PDFs
        return await readPdf(path);
    },
    '.docx': async (path) => {
        // mammoth.js for clean text extraction
        return await readDocx(path);
    },
    '.csv': async (path) => {
        // csv-parse with row limiting
        return await readCsv(path);
    },
    '.md,.txt,.log': async (path) => {
        // Direct file system read
        return await readTextFile(path);
    }
};
```

#### Processing Flow
```
Directory Selection → File Discovery (fast-glob) → 
Format Detection → Text Extraction → 
Character Limiting → AI Processing → 
Streaming Response
```

### 4. User Interface Architecture

#### Component Hierarchy
```
App Container
├── Robot Character (animated, theme-aware)
├── Window Controls (minimize, pin, close)
├── Mode Selector (icon-based, theme switching)
├── Input Section
│   ├── Prompt Textarea (dynamic placeholders)
│   └── Directory Selector (conditional visibility)
├── Options Panel (file type filters)
└── Output Section (streaming text display)
```

#### Responsive Behavior
- **Mode switching**: Instant visual feedback
- **Directory requirements**: Smart UI adaptation  
- **File processing**: Progress indication
- **Error states**: User-friendly messaging

## Performance Characteristics

### File Processing Limits
```javascript
const MAX_FILES = 40;        // Prevent memory issues
const MAX_CHARS = 120_000;   // AI context window limit
const PDF_MAX_PAGES = 50;    // Balance speed vs completeness
const CSV_MAX_ROWS = 20;     // Prevent overwhelming output
```

### Memory Management
- **Streaming processing**: Files processed individually
- **Garbage collection**: Explicit cleanup after processing
- **Error boundaries**: Prevent memory leaks on failures

### Response Handling
- **Streaming UI**: Character-by-character display (20ms intervals)
- **Token counting**: Usage tracking for API optimization
- **Caching**: None (intentionally - fresh results each time)

## Security Implementation

### API Key Management
```bash
# Environment variables only
OPENAI_API_KEY=secret_key
QVAC_API_KEY=secret_key

# Never committed to repository
# .gitignore includes .env
# .env.example provided for setup
```

### Electron Security
```javascript
// Preload script with context isolation
contextBridge.exposeInMainWorld("api", {
    pickDir: () => ipcRenderer.invoke("pick-dir"),
    runSummary: (payload) => ipcRenderer.invoke("run-summary", payload)
});

// Renderer security
webPreferences: {
    contextIsolation: true,    // Isolate contexts
    nodeIntegration: false,    // Disable Node in renderer  
    sandbox: false            // Allow file system access
}
```

### Input Validation
- **File path validation**: Existence and permission checks
- **Content sanitization**: Safe text extraction
- **Prompt length limits**: Prevent API abuse
- **Rate limiting**: Built into provider abstraction

## Deployment & Distribution

### Build Configuration
```json
{
    "scripts": {
        "start": "electron .",
        "build": "electron-builder",
        "dist": "npm run build"
    },
    "build": {
        "appId": "com.hackathon.local-research-buddy",
        "productName": "Local Research Buddy",
        "directories": {
            "output": "dist"
        }
    }
}
```

### Cross-Platform Support
- **Windows**: .exe installer + portable
- **macOS**: .dmg with code signing ready
- **Linux**: .AppImage + .deb packages

### System Integration
- **Auto-start**: Optional system tray persistence
- **File associations**: Register for supported document types
- **Context menus**: OS integration hooks ready

## Extensibility Points

### Adding New Modes
1. **UI Configuration**: Add to `modeConfig` object
2. **Prompt Engineering**: Extend `getModePrompts()` function  
3. **Visual Theme**: Add CSS variables for mode colors
4. **File Requirements**: Configure `requiresFiles` flag

### Supporting New File Types
1. **Parser Function**: Implement `async readNewFormat(filePath)`
2. **Format Detection**: Add extension to `extractTextForFile()`
3. **Glob Patterns**: Update `fileMatcher()` configuration
4. **UI Options**: Add checkbox to file type filters

### AI Provider Integration
1. **Provider Function**: Implement `async callNewProvider()`
2. **Configuration**: Add environment variables
3. **Error Handling**: Extend error mapping
4. **Feature Mapping**: Handle provider-specific capabilities

## Error Handling Strategy

### Graceful Degradation
```javascript
// Multi-level fallbacks
PDF Processing: pdf-parse → pdfjs-dist → skip file
AI Processing: primary provider → fallback provider → local summary  
File Access: requested file → alternative formats → user notification
```

### User Communication
- **Processing errors**: Specific, actionable messages
- **Configuration issues**: Setup guidance provided
- **Network failures**: Retry mechanisms with feedback
- **Validation errors**: Inline form validation

This technical architecture demonstrates production-ready code quality while maintaining the flexibility needed for rapid hackathon development and future Qvac SDK integration.