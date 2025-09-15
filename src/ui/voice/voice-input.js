/**
 * Voice Input Component
 * 
 * Handles voice recording controls, real-time transcription display,
 * and voice command processing for the agent system.
 */

export class VoiceInput {
    constructor(container) {
        this.container = container;
        this.isRecording = false;
        this.isProcessing = false;
        this.transcriptionBuffer = '';
        this.agentThinking = false;
        
        this.init();
        this.bindEvents();
    }

    init() {
        this.container.innerHTML = this.createVoiceInterface();
        this.elements = this.getElements();
        this.updateUIState('idle');
    }

    createVoiceInterface() {
        return `
            <div class="voice-interface">
                <!-- Voice Assistant Avatar -->
                <div class="voice-avatar" id="voiceAvatar">
                    <div class="avatar-container">
                        <div class="avatar-circle">
                            <div class="avatar-pulse"></div>
                            <svg class="avatar-icon" viewBox="0 0 24 24">
                                <path d="M12 2C13.1 2 14 2.9 14 4V10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10V4C10 2.9 10.9 2 12 2Z"/>
                                <path d="M19 10V12C19 15.9 15.9 19 12 19C8.1 19 5 15.9 5 10V12H7V10C7 6.1 10.1 3 14 3H12C15.9 7 19 10.1 19 10Z"/>
                                <path d="M12 19V22M8 22H16"/>
                            </svg>
                        </div>
                        <div class="status-indicator" id="statusIndicator"></div>
                    </div>
                </div>

                <!-- Voice Controls -->
                <div class="voice-controls">
                    <button class="voice-button" id="voiceButton">
                        <svg class="mic-icon" viewBox="0 0 24 24">
                            <path d="M12 2C13.1 2 14 2.9 14 4V10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10V4C10 2.9 10.9 2 12 2Z"/>
                            <path d="M19 10V12C19 15.9 15.9 19 12 19C8.1 19 5 15.9 5 10V12H7V10C7 6.1 10.1 3 14 3H12C15.9 7 19 10.1 19 10Z"/>
                        </svg>
                        <span class="button-text">Start Voice Input</span>
                    </button>
                    
                    <button class="stop-button hidden" id="stopButton">
                        <svg viewBox="0 0 24 24">
                            <rect x="6" y="6" width="12" height="12" rx="2"/>
                        </svg>
                        <span>Stop</span>
                    </button>
                </div>

                <!-- Live Transcription Display -->
                <div class="transcription-display" id="transcriptionDisplay">
                    <div class="transcription-header">
                        <h3>Live Transcription</h3>
                        <div class="transcription-status" id="transcriptionStatus">Ready</div>
                    </div>
                    <div class="transcription-content" id="transcriptionContent">
                        <div class="placeholder-text">Click "Start Voice Input" to begin speaking...</div>
                    </div>
                </div>

                <!-- Agent Response Area -->
                <div class="agent-response" id="agentResponse">
                    <div class="response-header">
                        <h3>Agent Response</h3>
                        <div class="thinking-indicator hidden" id="thinkingIndicator">
                            <div class="dots">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                            <span>Processing...</span>
                        </div>
                    </div>
                    <div class="response-content" id="responseContent">
                        <div class="placeholder-text">Agent responses will appear here...</div>
                    </div>
                </div>

                <!-- Voice Commands Help -->
                <div class="voice-help collapsed" id="voiceHelp">
                    <button class="help-toggle" id="helpToggle">
                        <span>Voice Commands</span>
                        <svg class="chevron" viewBox="0 0 24 24">
                            <path d="M7 10L12 15L17 10"/>
                        </svg>
                    </button>
                    <div class="help-content">
                        <div class="command-examples">
                            <h4>Example Commands:</h4>
                            <ul>
                                <li>"Analyze the documents in my Downloads folder"</li>
                                <li>"Summarize the PDF files in the project directory"</li>
                                <li>"Find all JavaScript files and explain the code structure"</li>
                                <li>"Help me understand this codebase"</li>
                                <li>"Generate a report from the CSV data"</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getElements() {
        return {
            avatar: document.getElementById('voiceAvatar'),
            statusIndicator: document.getElementById('statusIndicator'),
            voiceButton: document.getElementById('voiceButton'),
            stopButton: document.getElementById('stopButton'),
            transcriptionDisplay: document.getElementById('transcriptionDisplay'),
            transcriptionStatus: document.getElementById('transcriptionStatus'),
            transcriptionContent: document.getElementById('transcriptionContent'),
            agentResponse: document.getElementById('agentResponse'),
            responseContent: document.getElementById('responseContent'),
            thinkingIndicator: document.getElementById('thinkingIndicator'),
            voiceHelp: document.getElementById('voiceHelp'),
            helpToggle: document.getElementById('helpToggle')
        };
    }

    bindEvents() {
        // Voice control buttons
        this.elements.voiceButton.addEventListener('click', () => this.startVoiceInput());
        this.elements.stopButton.addEventListener('click', () => this.stopVoiceInput());
        
        // Help toggle
        this.elements.helpToggle.addEventListener('click', () => this.toggleHelp());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && e.ctrlKey && !e.repeat) {
                e.preventDefault();
                if (this.isRecording) {
                    this.stopVoiceInput();
                } else {
                    this.startVoiceInput();
                }
            }
        });

        // Voice events from main process
        window.electronAPI?.onVoiceEvent?.(this.handleVoiceEvent.bind(this));
        window.electronAPI?.onAgentResponse?.(this.handleAgentResponse.bind(this));
    }

    async startVoiceInput() {
        if (this.isRecording) return;
        
        console.log('[voice-input] Starting voice input...');
        
        try {
            this.updateUIState('starting');
            
            // Start transcription via IPC
            const result = await window.electronAPI.startVoiceInput();
            
            if (result.success) {
                this.isRecording = true;
                this.transcriptionBuffer = '';
                this.updateUIState('recording');
                this.clearTranscription();
                console.log('[voice-input] Voice input started successfully');
            } else {
                throw new Error(result.error || 'Failed to start voice input');
            }
            
        } catch (error) {
            console.error('[voice-input] Failed to start voice input:', error);
            this.updateUIState('error');
            this.showError('Failed to start voice input: ' + error.message);
        }
    }

    async stopVoiceInput() {
        if (!this.isRecording) return;
        
        console.log('[voice-input] Stopping voice input...');
        
        try {
            this.updateUIState('stopping');
            
            // Stop transcription via IPC
            const result = await window.electronAPI.stopVoiceInput();
            
            if (result.success) {
                this.isRecording = false;
                this.updateUIState('processing');
                
                // Process the final transcript with agent if available
                if (result.finalTranscript && result.finalTranscript.trim()) {
                    console.log('[voice-input] Processing final transcript:', result.finalTranscript);
                    this.processVoiceCommand(result.finalTranscript);
                } else {
                    this.updateUIState('idle');
                    this.updateTranscriptionStatus('No speech detected');
                }
                
            } else {
                throw new Error(result.error || 'Failed to stop voice input');
            }
            
        } catch (error) {
            console.error('[voice-input] Failed to stop voice input:', error);
            this.updateUIState('error');
            this.showError('Failed to stop voice input: ' + error.message);
        }
    }

    async processVoiceCommand(transcript) {
        console.log('[voice-input] Processing voice command:', transcript);
        
        try {
            this.agentThinking = true;
            this.updateUIState('processing');
            this.showThinking();
            
            // Send to agent via IPC
            const result = await window.electronAPI.runAgent({
                messages: [{ role: 'user', content: transcript }],
                maxSteps: 6
            });
            
            if (result.ok) {
                this.showAgentResponse(result.output);
                this.updateUIState('idle');
            } else {
                throw new Error(result.error || 'Agent processing failed');
            }
            
        } catch (error) {
            console.error('[voice-input] Voice command processing failed:', error);
            this.showError('Failed to process command: ' + error.message);
            this.updateUIState('error');
        } finally {
            this.agentThinking = false;
            this.hideThinking();
        }
    }

    handleVoiceEvent(event) {
        console.log('[voice-input] Voice event received:', event);
        
        switch (event.type) {
            case 'transcription':
                this.updateTranscription(event.data.text, event.data.confidence);
                break;
                
            case 'status':
                this.updateTranscriptionStatus(event.data.message);
                break;
                
            case 'error':
                this.showError(event.data.message);
                this.updateUIState('error');
                break;
                
            case 'stopped':
                this.isRecording = false;
                this.updateUIState('idle');
                break;
        }
    }

    handleAgentResponse(response) {
        if (response.token) {
            // Streaming response
            this.appendAgentResponse(response.token);
        } else if (response.final) {
            // Final response
            this.showAgentResponse(response.final);
            this.hideThinking();
        }
    }

    updateUIState(state) {
        // Remove all state classes
        const states = ['idle', 'starting', 'recording', 'stopping', 'processing', 'error'];
        states.forEach(s => this.container.classList.remove(`voice-${s}`));
        
        // Add current state class
        this.container.classList.add(`voice-${state}`);
        
        // Update avatar and controls based on state
        switch (state) {
            case 'idle':
                this.elements.voiceButton.classList.remove('hidden');
                this.elements.stopButton.classList.add('hidden');
                this.elements.voiceButton.querySelector('.button-text').textContent = 'Start Voice Input';
                this.updateTranscriptionStatus('Ready');
                break;
                
            case 'starting':
                this.elements.voiceButton.querySelector('.button-text').textContent = 'Starting...';
                this.updateTranscriptionStatus('Initializing...');
                break;
                
            case 'recording':
                this.elements.voiceButton.classList.add('hidden');
                this.elements.stopButton.classList.remove('hidden');
                this.updateTranscriptionStatus('Listening...');
                break;
                
            case 'stopping':
                this.elements.stopButton.querySelector('span').textContent = 'Stopping...';
                this.updateTranscriptionStatus('Finishing...');
                break;
                
            case 'processing':
                this.elements.voiceButton.classList.remove('hidden');
                this.elements.stopButton.classList.add('hidden');
                this.elements.voiceButton.querySelector('.button-text').textContent = 'Processing...';
                this.updateTranscriptionStatus('Processing with AI...');
                break;
                
            case 'error':
                this.elements.voiceButton.classList.remove('hidden');
                this.elements.stopButton.classList.add('hidden');
                this.elements.voiceButton.querySelector('.button-text').textContent = 'Start Voice Input';
                this.updateTranscriptionStatus('Error');
                break;
        }
    }

    updateTranscription(text, confidence = null) {
        this.transcriptionBuffer += text + ' ';
        
        const content = this.elements.transcriptionContent;
        content.innerHTML = `
            <div class="live-text">${this.transcriptionBuffer.trim()}</div>
            ${confidence !== null ? `<div class="confidence">Confidence: ${Math.round(confidence * 100)}%</div>` : ''}
        `;
        
        // Auto-scroll to bottom
        content.scrollTop = content.scrollHeight;
    }

    clearTranscription() {
        this.transcriptionBuffer = '';
        this.elements.transcriptionContent.innerHTML = '<div class="placeholder-text">Speak now...</div>';
    }

    updateTranscriptionStatus(status) {
        this.elements.transcriptionStatus.textContent = status;
    }

    showAgentResponse(response) {
        this.elements.responseContent.innerHTML = `<div class="response-text">${this.formatResponse(response)}</div>`;
        this.elements.responseContent.scrollTop = this.elements.responseContent.scrollHeight;
    }

    appendAgentResponse(token) {
        let responseText = this.elements.responseContent.querySelector('.response-text');
        if (!responseText) {
            responseText = document.createElement('div');
            responseText.className = 'response-text';
            this.elements.responseContent.innerHTML = '';
            this.elements.responseContent.appendChild(responseText);
        }
        responseText.textContent += token;
        this.elements.responseContent.scrollTop = this.elements.responseContent.scrollHeight;
    }

    showThinking() {
        this.elements.thinkingIndicator.classList.remove('hidden');
    }

    hideThinking() {
        this.elements.thinkingIndicator.classList.add('hidden');
    }

    showError(message) {
        this.elements.responseContent.innerHTML = `<div class="error-message">Error: ${message}</div>`;
        console.error('[voice-input] Error:', message);
    }

    formatResponse(response) {
        // Basic markdown-like formatting
        return response
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    toggleHelp() {
        this.elements.voiceHelp.classList.toggle('collapsed');
        const chevron = this.elements.helpToggle.querySelector('.chevron');
        chevron.style.transform = this.elements.voiceHelp.classList.contains('collapsed') 
            ? 'rotate(0deg)' 
            : 'rotate(180deg)';
    }

    // Public API for external control
    getRecordingState() {
        return {
            isRecording: this.isRecording,
            isProcessing: this.isProcessing,
            transcriptionBuffer: this.transcriptionBuffer
        };
    }

    // Cleanup method
    destroy() {
        document.removeEventListener('keydown', this.boundKeydownHandler);
        this.container.innerHTML = '';
    }
}