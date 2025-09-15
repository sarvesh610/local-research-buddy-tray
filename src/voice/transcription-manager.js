import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { aiProvider } from '../core/ai-provider.js';

// __dirname is not available in ESM; compute it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Local Transcription Manager
 * 
 * Adapts lucidtalk's local Whisper transcription for voice-agent integration.
 * Uses local Swift binary for real-time transcription without cloud dependencies.
 * 
 * Features:
 * - Local Whisper.cpp integration via Swift binary
 * - Real-time transcription streaming
 * - Voice activity detection
 * - No cloud/API dependencies for transcription
 * - Integrates with agent system for voice commands
 */
export class TranscriptionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.streamerProcess = null;
        this.isTranscribing = false;
        this.currentSession = null;
        this.transcriptionBuffer = [];
        this.stdoutBuffer = '';
        this.stderrBuffer = '';
        this.partialBuffer = '';
        
        // Voice-specific configuration - more lenient to allow whisper to finish
        this.silenceTimeout = options.silenceTimeout || 8000; // 8 seconds - give whisper more time
        // Lower threshold so short phrases show up
        this.minTranscriptionLength = options.minTranscriptionLength || 3;
        this.voiceCommandMode = options.voiceCommandMode || false;
        
        console.log('[transcription-manager] Initialized for voice-agent integration');
    }

    /**
     * Start real-time transcription for voice input
     */
    async startVoiceInput(options = {}) {
        if (this.isTranscribing || this.streamerProcess) {
            throw new Error('Voice transcription already in progress');
        }

        console.log('[transcription-manager] Starting voice input transcription...');

        // Clear all previous transcript buffers for fresh session
        this.transcriptionBuffer = [];
        this.partialBuffer = '';

        try {
            await this.spawnStreamerProcess(options);
            
            this.isTranscribing = true;
            this.currentSession = {
                startTime: Date.now(),
                transcripts: [],
                id: this.generateSessionId(),
                mode: 'voice-input'
            };

            this.emit('voice:started', { sessionId: this.currentSession.id });
            console.log('[transcription-manager] Voice input started successfully');
            
        } catch (error) {
            console.error('[transcription-manager] Failed to start voice input:', error);
            this.cleanup();
            this.emit('voice:error', error);
            throw error;
        }
    }

    /**
     * Stop voice transcription
     */
    async stopVoiceInput() {
        if (!this.isTranscribing || !this.streamerProcess) {
            return;
        }

        console.log('[transcription-manager] Stopping voice input...');

        return new Promise((resolve) => {
            // Stop the streamer first
            this.streamerProcess.kill('SIGINT');
            
            this.streamerProcess.on('close', () => {
                // Process all audio chunks as a single combined file
                setTimeout(async () => {
                    try {
                        const finalTranscript = await this.processCombinedAudio();
                        this.cleanup();
                        
                        this.emit('voice:stopped', { 
                            sessionId: this.currentSession?.id,
                            finalTranscript,
                            transcripts: this.currentSession?.transcripts || []
                        });
                        
                        console.log('[transcription-manager] Voice input stopped');
                        console.log('[transcription-manager] Final combined transcript:', finalTranscript);
                        resolve({ 
                            success: true, 
                            finalTranscript,
                            transcripts: this.currentSession?.transcripts || []
                        });
                    } catch (error) {
                        console.error('[transcription-manager] Combined audio processing failed:', error);
                        const fallbackTranscript = this.getFinalTranscript();
                        this.cleanup();
                        resolve({ success: true, finalTranscript: fallbackTranscript });
                    }
                }, 1000);
            });

            // Force kill after 10 seconds if not responding
            setTimeout(() => {
                if (this.streamerProcess) {
                    this.streamerProcess.kill('SIGKILL');
                    this.cleanup();
                    resolve({ success: true, finalTranscript: this.getFinalTranscript() });
                }
            }, 10000);
        });
    }

    /**
     * Get current transcription status
     */
    getVoiceStatus() {
        return {
            isTranscribing: this.isTranscribing,
            currentSession: this.currentSession ? {
                id: this.currentSession.id,
                startTime: this.currentSession.startTime,
                duration: Date.now() - this.currentSession.startTime,
                transcriptCount: this.currentSession.transcripts.length,
                mode: this.currentSession.mode
            } : null
        };
    }

    /**
     * Get live transcription buffer (for real-time display)
     */
    getLiveTranscription() {
        return this.transcriptionBuffer.join(' ').trim();
    }

    /**
     * Get final transcript (for agent processing)
     */
    getFinalTranscript() {
        const merged = (this.currentSession?.transcripts || [])
            .map(t => t.text)
            .join(' ')
            .trim();
        if (!merged && this.partialBuffer) return this.partialBuffer.trim();
        if (merged && this.partialBuffer) return (merged + ' ' + this.partialBuffer).trim();
        return merged || '';
    }

    /**
     * Process voice command through agent
     */
    async processVoiceCommand(transcript) {
        if (!transcript || transcript.length < this.minTranscriptionLength) {
            console.log('[transcription-manager] Transcript too short for agent processing');
            return null;
        }

        console.log('[transcription-manager] Processing voice command:', transcript);

        try {
            // Send to agent for processing
            this.emit('voice:command', {
                transcript,
                sessionId: this.currentSession?.id,
                timestamp: Date.now()
            });

            return {
                success: true,
                transcript,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('[transcription-manager] Voice command processing failed:', error);
            this.emit('voice:error', error);
            return null;
        }
    }

    /**
     * Spawn the Swift transcription process
     */
    async spawnStreamerProcess(options) {
        // Find the LucidTalkStreamer binary
        const possiblePaths = [
            path.join(process.cwd(), 'src/voice/whisper-binary/LucidTalkStreamer'),
            path.join(__dirname, 'whisper-binary/LucidTalkStreamer'),
            path.join(process.resourcesPath, 'app.asar.unpacked/src/voice/whisper-binary/LucidTalkStreamer'),
        ];
        
        let streamerPath = null;
        console.log('[transcription-manager] Searching for LucidTalkStreamer binary...');
        
        for (const testPath of possiblePaths) {
            console.log('[transcription-manager] Checking path:', testPath);
            if (fs.existsSync(testPath)) {
                const stats = fs.statSync(testPath);
                if (stats.isFile()) {
                    streamerPath = testPath;
                    console.log('[transcription-manager] ✅ Found executable at:', streamerPath);
                    break;
                }
            }
        }
        
        if (!streamerPath) {
            console.error('[transcription-manager] Available paths checked:', possiblePaths);
            throw new Error('LucidTalkStreamer binary not found. Voice transcription unavailable.');
        }

        const args = ['--start'];

        // Resolve Whisper model path (options > env > common locations)
        let resolvedModel = options.modelPath || process.env.WHISPER_MODEL_PATH || process.env.WHISPER_MODEL || '';
        if (!resolvedModel) {
            const home = process.env.HOME || '';
            const candidates = [
                path.join(home, 'Documents/models/ggml-base.en.bin'),
                path.join(home, 'Documents/models/ggml-small.en.bin'),
                path.join(home, 'Documents/models/ggml-base.bin'),
                path.join(home, 'Documents/models/ggml-small.bin'),
                path.join(__dirname, '../models/ggml-base.en.bin'),
                path.join(__dirname, '../models/ggml-small.en.bin'),
                path.join(__dirname, '../models/ggml-base.bin'),
                path.join(__dirname, '../models/ggml-small.bin')
            ];
            for (const c of candidates) {
                try { if (fs.existsSync(c)) { resolvedModel = c; break; } } catch {}
            }
        }
        if (resolvedModel) {
            console.log('[transcription-manager] Using Whisper model:', resolvedModel);
            args.push('--model', resolvedModel);
        } else {
            console.warn('[transcription-manager] No Whisper model resolved. Expect startup failure.');
        }

        return new Promise((resolve, reject) => {
            console.log('[transcription-manager] Spawning LucidTalkStreamer:');
            console.log('  Path:', streamerPath);
            console.log('  Args:', args);
            
            this.streamerProcess = spawn(streamerPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: process.cwd()
            });

            // Handle process startup
            let startupTimeout = setTimeout(() => {
                reject(new Error('Voice transcription startup timeout'));
            }, 10000);
            
            let hasStarted = false;

            // Process stdout for real-time transcription
            this.streamerProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                this.stdoutBuffer += chunk;
                // Process complete lines only; keep remainder for next chunk
                const lines = this.stdoutBuffer.split('\n');
                this.stdoutBuffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim()) this.handleStreamerOutput(line);
                }
                
                // Resolve startup promise on first output
                if (!hasStarted) {
                    hasStarted = true;
                    clearTimeout(startupTimeout);
                    resolve();
                }
            });
            
            // Handle stderr for startup confirmation and debug logs
            this.streamerProcess.stderr.on('data', (data) => {
                const message = data.toString();
                console.log('[transcription-manager] Swift stderr:', message);
                // Some builds may emit JSON on stderr; try to parse per line
                this.stderrBuffer += message;
                const lines = this.stderrBuffer.split('\n');
                this.stderrBuffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.includes('{')) {
                        try { this.handleStreamerOutput(line); } catch {}
                    }
                }
                
                // Consider the process started on key initialization messages
                if (!hasStarted && (
                    message.includes('✅ Whisper binary found') ||
                    message.includes('AudioStreamer: Whisper processor started') ||
                    message.includes('🎙️ Continuing with microphone-only mode')
                )) {
                    hasStarted = true;
                    clearTimeout(startupTimeout);
                    resolve();
                }
            });

            // Handle process exit
            this.streamerProcess.on('close', (code) => {
                console.log('[transcription-manager] Streamer process exited with code:', code);
                if (code !== 0 && this.isTranscribing) {
                    this.emit('voice:error', new Error(`Streamer process exited with code ${code}`));
                }
                this.cleanup();
            });

            // Handle process errors
            this.streamerProcess.on('error', (error) => {
                clearTimeout(startupTimeout);
                console.error('[transcription-manager] Streamer process error:', error);
                this.cleanup();
                reject(error);
            });
        });
    }

    /**
     * Handle output from Swift streamer process
     */
    handleStreamerOutput(line) {
        const s = line.trim();
        if (!s) return;
        try {
            const data = JSON.parse(s);
            this.processStreamerMessage(data);
            return;
        } catch {}
        // Not JSON: log (do not forward raw logs to UI)
        console.log('[transcription-manager] Non-JSON output:', s);
        // Fallback: extract transcript if streamer prefixes lines
        const m = s.match(/^(?:TRANSCRIPT|Partial|Final)[:>\-]\s*(.+)$/i);
        if (m && m[1]) {
            const text = m[1].trim();
            if (text) {
                const transcript = {
                    id: this.generateTranscriptId(),
                    text,
                    timestamp: Date.now(),
                    isoTimestamp: new Date().toISOString(),
                    confidence: null,
                    sessionId: this.currentSession?.id
                };
                this.currentSession?.transcripts.push(transcript);
                this.transcriptionBuffer.push(transcript.text);
                if (this.transcriptionBuffer.length > 10) this.transcriptionBuffer.shift();
                this.emit('voice:transcription', transcript);
            }
        }
    }

    /**
     * Process messages from Swift streamer
     */
    processStreamerMessage(message) {
        console.log('[transcription-manager] Processing streamer message:', message);
        
        // Heuristic normalization: accept various message shapes
        const normalized = this.normalizeTranscriptMessage(message);
        if (normalized) {
            let { text, confidence, isFinal } = normalized;
            text = this.sanitizeTranscript(text);
            
            // Skip empty transcripts after sanitization
            if (!text || !text.trim()) {
                return;
            }
            
            const transcript = {
                id: this.generateTranscriptId(),
                text,
                timestamp: Date.now(),
                isoTimestamp: new Date().toISOString(),
                confidence: confidence ?? null,
                sessionId: this.currentSession?.id
            };

            if (isFinal) {
                // On final, flush any partials + current
                const combined = (this.partialBuffer + ' ' + (transcript.text || '')).trim();
                if (combined) {
                    const finalT = { ...transcript, text: combined };
                    this.currentSession?.transcripts.push(finalT);
                    this.transcriptionBuffer.push(finalT.text);
                    if (this.transcriptionBuffer.length > 10) this.transcriptionBuffer.shift();
                    this.emit('voice:transcription', finalT);
                    if (this.voiceCommandMode) this.processVoiceCommand(finalT.text);
                }
                this.partialBuffer = '';
            } else {
                // Buffer partials and emit to UI so user sees running text
                if (transcript.text?.trim()) {
                    this.partialBuffer = (this.partialBuffer + ' ' + transcript.text).trim();
                    const partialT = { ...transcript, partial: true };
                    this.emit('voice:transcription', partialT);
                }
            }
            return;
        }

        switch (message.type) {
            case 'status':
                console.log('[transcription-manager] Status:', message.message);
                this.emit('voice:status', {
                    message: message.message,
                    timestamp: message.timestamp
                });
                break;

            case 'transcription':
                let textField = message.text || message.message || message?.data?.text || message.partial || message.result || '';
                textField = this.sanitizeTranscript(textField);
                console.log('[transcription-manager] Transcription received:', textField);

                const transcript = {
                    id: this.generateTranscriptId(),
                    text: textField,
                    timestamp: message.timestamp,
                    isoTimestamp: message.iso_timestamp,
                    confidence: message.confidence || null,
                    sessionId: this.currentSession.id
                };

                // Add to session history
                const typeLower = (message.type || '').toLowerCase();
                const isFinal = typeLower.includes('final') || message.final === true || message.is_final === true;
                if (isFinal) {
                    const combined = (this.partialBuffer + ' ' + (transcript.text || '')).trim();
                    if (combined) {
                        const finalT = { ...transcript, text: combined };
                        this.currentSession.transcripts.push(finalT);
                        this.transcriptionBuffer.push(finalT.text);
                        if (this.transcriptionBuffer.length > 10) this.transcriptionBuffer.shift();
                        this.emit('voice:transcription', finalT);
                        if (this.voiceCommandMode) this.processVoiceCommand(finalT.text);
                    }
                    this.partialBuffer = '';
                } else {
                    // Buffer partials and emit to UI for live display
                    if (transcript.text?.trim()) {
                        this.partialBuffer = (this.partialBuffer + ' ' + transcript.text).trim();
                        const partialT = { ...transcript, partial: true };
                        this.emit('voice:transcription', partialT);
                    }
                }
                
                break;

            case 'error':
                console.error('[transcription-manager] Streamer error:', message.message);
                this.emit('voice:error', new Error(message.message));
                break;

            default:
                console.warn('[transcription-manager] Unknown streamer message type:', message.type);
        }
    }

    // Attempt to normalize different transcript message shapes from streamers
    normalizeTranscriptMessage(msg) {
        if (!msg || typeof msg !== 'object') return null;
        // Common variants
        const candidates = [
            msg.text,
            msg.transcript,
            msg.result,
            msg.partial,
            msg?.message?.text,
            msg?.data?.text
        ].filter(Boolean);

        const text = candidates[0];
        if (!text || typeof text !== 'string') return null;

        const confidence = msg.confidence ?? msg.prob ?? msg.avg_logprob ?? null;
        const type = (msg.type || '').toLowerCase();
        const isFinal = type.includes('final') || msg.final === true || msg.is_final === true;

        return { text, confidence, isFinal };
    }

    // Remove known debug prefixes and surrounding quotes from transcript strings
    sanitizeTranscript(text) {
        if (!text || typeof text !== 'string') return text;
        let t = text.trim();
        // Strip common debug prefixes
        t = t.replace(/^\[?transcription-manager\]?\s*/i, '')
             .replace(/^Swift stderr:\s*/i, '')
             .replace(/^WhisperProcessor:\s*/i, '')
             .replace(/^AudioStreamer:\s*/i, '')
             .replace(/^Parsed transcription:\s*/i, '')
             .replace(/^message:\s*/i, '')
             .trim();
        
        // Remove [BLANK_AUDIO] entries and clean up
        t = t.replace(/\[BLANK_AUDIO\]/g, '').trim();
        // Clean up multiple spaces left by removal
        t = t.replace(/\s+/g, ' ').trim();
        
        // Unwrap single/double quotes if the whole string is quoted
        const m = t.match(/^['"]([\s\S]*?)['"]$/);
        if (m) t = m[1];
        return t.trim();
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.isTranscribing = false;
        this.transcriptionBuffer = [];
        this.partialBuffer = '';
        this.currentSession = null;
        
        if (this.streamerProcess) {
            try {
                this.streamerProcess.kill('SIGTERM');
            } catch (error) {
                console.warn('[transcription-manager] Error killing streamer process:', error);
            }
        }
        this.streamerProcess = null;
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Process all captured audio chunks as a single combined file
     */
    async processCombinedAudio() {
        const { spawn } = await import('child_process');
        const fs = await import('fs');
        const path = await import('path');
        
        console.log('[transcription-manager] Processing combined audio from all chunks...');
        
        // Find all audio chunk files
        const chunkDir = '/var/folders/0d/rxv_l6fd02b25rmn07s9ygj80000gn/T/mindmeet_audio_chunks';
        if (!fs.existsSync(chunkDir)) {
            console.log('[transcription-manager] No audio chunks directory found');
            return this.getFinalTranscript();
        }
        
        const chunkFiles = fs.readdirSync(chunkDir)
            .filter(f => f.startsWith('chunk_') && f.endsWith('.wav'))
            .sort((a, b) => {
                const aNum = parseInt(a.match(/chunk_(\d+)\.wav/)?.[1] || '0');
                const bNum = parseInt(b.match(/chunk_(\d+)\.wav/)?.[1] || '0');
                return aNum - bNum;
            })
            .slice(0, 10); // Process max 10 chunks (15 seconds)
        
        if (chunkFiles.length === 0) {
            console.log('[transcription-manager] No audio chunks found');
            return this.getFinalTranscript();
        }
        
        console.log(`[transcription-manager] Found ${chunkFiles.length} chunks to combine`);
        
        // Check if we already have good transcripts from the real-time processing
        const existingTranscripts = this.getFinalTranscript();
        if (existingTranscripts && existingTranscripts.trim() && !existingTranscripts.includes('[BLANK_AUDIO]')) {
            console.log(`[transcription-manager] Using existing transcript: "${existingTranscripts}"`);
            return existingTranscripts;
        }
        
        // Use the first chunk file for processing
        const firstChunk = path.join(chunkDir, chunkFiles[0]);
        
        return new Promise((resolve) => {
            // Find whisper binary
            const whisperBinary = path.join(process.cwd(), 'bin/whisper-cli');
            
            console.log(`[transcription-manager] Processing combined audio with: ${whisperBinary}`);
            
            const whisperProcess = spawn(whisperBinary, [
                '--file', firstChunk
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let output = '';
            let error = '';
            
            whisperProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            whisperProcess.stderr.on('data', (data) => {
                error += data.toString();
            });
            
            whisperProcess.on('close', (code) => {
                console.log(`[transcription-manager] Combined processing exit code: ${code}`);
                
                if (code === 0 && output.trim()) {
                    const transcript = output.trim();
                    console.log(`[transcription-manager] Combined transcript: "${transcript}"`);
                    resolve(transcript);
                } else {
                    console.log('[transcription-manager] Combined processing failed, using fallback');
                    resolve(this.getFinalTranscript());
                }
                
                // Clean up chunk files
                try {
                    chunkFiles.forEach(f => {
                        try { fs.unlinkSync(path.join(chunkDir, f)); } catch {}
                    });
                } catch {}
            });
            
            whisperProcess.on('error', (err) => {
                console.error('[transcription-manager] Combined processing error:', err);
                resolve(this.getFinalTranscript());
            });
            
            // Timeout after 15 seconds
            setTimeout(() => {
                whisperProcess.kill('SIGKILL');
                resolve(this.getFinalTranscript());
            }, 15000);
        });
    }

    /**
     * Generate transcript ID
     */
    generateTranscriptId() {
        return `transcript_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export singleton instance for voice operations
export const voiceManager = new TranscriptionManager({
    voiceCommandMode: true,
    silenceTimeout: 8000,
    minTranscriptionLength: 3
});
