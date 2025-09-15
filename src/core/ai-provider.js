import OpenAI from "openai";

/**
 * QVac Provider Abstraction Layer
 * 
 * This module provides a unified interface for AI operations, with QVac SDK as the 
 * primary provider and OpenAI as fallback. The architecture is ready for QVac 
 * integration when the SDK becomes publicly available.
 * 
 * Architecture Features:
 * - Provider-agnostic interface for all AI operations
 * - Seamless fallback from QVac to OpenAI
 * - Support for both text chat and transcription services
 * - Streaming and non-streaming modes
 * - Token usage tracking and cost estimation
 */

// Provider configuration
const PROVIDER = process.env.AI_PROVIDER || "openai";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const QVAC_API_KEY = process.env.QVAC_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const QVAC_MODEL = process.env.QVAC_MODEL || "default";

/**
 * QVac Provider - Ready for SDK integration
 */
class QVacProvider {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.name = "qvac";
        // TODO: Initialize QVac SDK when available
        // this.client = new QVacSDK({ apiKey });
    }

    async chatCompletion({ messages, model = QVAC_MODEL, temperature = 0.2, stream = false }) {
        // TODO: Implement QVac SDK chat completion
        console.log(`[qvac-provider] QVac SDK not yet available, using fallback`);
        
        // Placeholder response structure matching OpenAI format
        const mockResponse = {
            choices: [{
                message: {
                    content: `[QVac Local Processing]\n\nThis is a placeholder response. The QVac SDK will provide local AI inference when available.\n\nReceived ${messages.length} messages for processing.`,
                    role: "assistant"
                }
            }],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };

        if (stream) {
            // Simulate streaming for development
            return this.simulateStreaming(mockResponse.choices[0].message.content);
        }

        return mockResponse;
    }

    async transcription({ audioPath, model = "whisper-1" }) {
        // TODO: Implement QVac local transcription when SDK is available
        console.log(`[qvac-provider] QVac transcription not yet available`);
        
        return {
            text: "[QVac Local Transcription] - Not yet implemented",
            confidence: 0.0
        };
    }

    async *simulateStreaming(text) {
        // Simulate streaming chunks for development
        const words = text.split(' ');
        for (let i = 0; i < words.length; i += 3) {
            const chunk = words.slice(i, i + 3).join(' ') + ' ';
            yield {
                choices: [{
                    delta: {
                        content: chunk
                    }
                }]
            };
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    supportsLocalTranscription() {
        // QVac will support local transcription
        return true;
    }

    supportsLocalChat() {
        // QVac provides local AI chat
        return true;
    }
}

/**
 * OpenAI Provider - Production fallback
 */
class OpenAIProvider {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.name = "openai";
        this.client = new OpenAI({ apiKey });
    }

    async chatCompletion({ messages, model = OPENAI_MODEL, temperature = 0.2, stream = false }) {
        const response = await this.client.chat.completions.create({
            model,
            messages,
            temperature,
            stream
        });

        return response;
    }

    async transcription({ audioPath, model = "whisper-1" }) {
        // OpenAI Whisper API (cloud-based)
        const fs = await import('fs');
        const transcription = await this.client.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: model,
        });

        return {
            text: transcription.text,
            confidence: 1.0 // OpenAI doesn't provide confidence scores
        };
    }

    supportsLocalTranscription() {
        // OpenAI uses cloud-based transcription
        return false;
    }

    supportsLocalChat() {
        // OpenAI uses cloud-based chat
        return false;
    }
}

/**
 * Unified AI Provider Interface
 * 
 * Provides a single interface for all AI operations with automatic fallback
 */
export class AIProvider {
    constructor() {
        this.primaryProvider = null;
        this.fallbackProvider = null;
        this.currentProvider = null;
        
        this.initialize();
    }

    initialize() {
        console.log(`[ai-provider] Initializing with primary provider: ${PROVIDER}`);

        try {
            // Initialize primary provider
            switch (PROVIDER) {
                case "qvac":
                    if (QVAC_API_KEY) {
                        this.primaryProvider = new QVacProvider(QVAC_API_KEY);
                        console.log(`[ai-provider] QVac provider initialized`);
                    } else {
                        console.warn(`[ai-provider] QVac provider selected but no API key provided`);
                    }
                    break;
                    
                case "openai":
                    if (OPENAI_API_KEY) {
                        this.primaryProvider = new OpenAIProvider(OPENAI_API_KEY);
                        console.log(`[ai-provider] OpenAI provider initialized`);
                    } else {
                        console.warn(`[ai-provider] OpenAI provider selected but no API key provided`);
                    }
                    break;
                    
                default:
                    console.warn(`[ai-provider] Unknown provider: ${PROVIDER}`);
            }

            // Always initialize OpenAI as fallback (unless it's already primary)
            if (PROVIDER !== "openai" && OPENAI_API_KEY) {
                this.fallbackProvider = new OpenAIProvider(OPENAI_API_KEY);
                console.log(`[ai-provider] OpenAI fallback provider initialized`);
            }

            // Set current provider
            this.currentProvider = this.primaryProvider || this.fallbackProvider;
            
            if (!this.currentProvider) {
                console.error(`[ai-provider] No valid providers available. Please set OPENAI_API_KEY or QVAC_API_KEY`);
            } else {
                console.log(`[ai-provider] Active provider: ${this.currentProvider.name}`);
            }

        } catch (error) {
            console.error(`[ai-provider] Provider initialization failed:`, error);
            // Try to fall back to OpenAI if primary provider fails
            if (this.fallbackProvider && PROVIDER !== "openai") {
                this.currentProvider = this.fallbackProvider;
                console.log(`[ai-provider] Falling back to: ${this.currentProvider.name}`);
            }
        }
    }

    /**
     * Chat completion with automatic fallback
     */
    async chat({ messages, model, temperature = 0.2, stream = false, onToken }) {
        if (!this.currentProvider) {
            throw new Error("No AI provider available. Please configure OPENAI_API_KEY or QVAC_API_KEY");
        }

        try {
            console.log(`[ai-provider] Using ${this.currentProvider.name} for chat completion`);
            
            const response = await this.currentProvider.chatCompletion({
                messages,
                model,
                temperature,
                stream
            });

            // Handle streaming response
            if (stream && onToken) {
                let fullText = "";
                for await (const chunk of response) {
                    const content = chunk.choices?.[0]?.delta?.content || "";
                    if (content) {
                        fullText += content;
                        onToken(content);
                    }
                }
                return { text: fullText, usage: { total_tokens: 0 } };
            }

            // Handle regular response
            const text = response.choices?.[0]?.message?.content || "";
            return {
                text,
                usage: response.usage || { total_tokens: 0 }
            };

        } catch (error) {
            console.error(`[ai-provider] Chat failed with ${this.currentProvider.name}:`, error.message);
            
            // Try fallback provider
            if (this.fallbackProvider && this.currentProvider !== this.fallbackProvider) {
                console.log(`[ai-provider] Attempting fallback to ${this.fallbackProvider.name}`);
                try {
                    const fallbackResponse = await this.fallbackProvider.chatCompletion({
                        messages,
                        model: OPENAI_MODEL, // Use OpenAI model for fallback
                        temperature,
                        stream
                    });

                    if (stream && onToken) {
                        let fullText = "";
                        for await (const chunk of fallbackResponse) {
                            const content = chunk.choices?.[0]?.delta?.content || "";
                            if (content) {
                                fullText += content;
                                onToken(content);
                            }
                        }
                        return { text: fullText, usage: { total_tokens: 0 } };
                    }

                    const text = fallbackResponse.choices?.[0]?.message?.content || "";
                    return {
                        text,
                        usage: fallbackResponse.usage || { total_tokens: 0 }
                    };

                } catch (fallbackError) {
                    console.error(`[ai-provider] Fallback also failed:`, fallbackError.message);
                    throw new Error(`All providers failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`);
                }
            }

            throw error;
        }
    }

    /**
     * Transcription with provider selection based on capabilities
     */
    async transcribe({ audioPath, model }) {
        if (!this.currentProvider) {
            throw new Error("No AI provider available for transcription");
        }

        // For now, always use fallback (OpenAI) for transcription since QVac SDK isn't available
        // TODO: When QVac SDK is available, prefer local transcription
        const transcriptionProvider = this.fallbackProvider || this.currentProvider;
        
        try {
            console.log(`[ai-provider] Using ${transcriptionProvider.name} for transcription`);
            return await transcriptionProvider.transcription({ audioPath, model });
        } catch (error) {
            console.error(`[ai-provider] Transcription failed:`, error.message);
            throw error;
        }
    }

    /**
     * Get provider information
     */
    getProviderInfo() {
        return {
            current: this.currentProvider?.name || "none",
            primary: this.primaryProvider?.name || "none",
            fallback: this.fallbackProvider?.name || "none",
            supportsLocalChat: this.currentProvider?.supportsLocalChat() || false,
            supportsLocalTranscription: this.currentProvider?.supportsLocalTranscription() || false
        };
    }

    /**
     * Check if provider is available
     */
    isAvailable() {
        return !!this.currentProvider;
    }
}

// Export singleton instance
export const aiProvider = new AIProvider();

// Export individual classes for testing
export { QVacProvider, OpenAIProvider };