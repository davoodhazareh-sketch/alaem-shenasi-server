
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAIBlob } from '@google/genai';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const API_KEY = process.env.API_KEY as string;

const ai = new GoogleGenAI({ apiKey: API_KEY });

export interface LiveSessionCallbacks {
    onOpen?: () => void;
    onMessage?: (text: string | null, isUser: boolean) => void; // For transcripts
    onAudioData?: (audioBuffer: AudioBuffer) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
}

export class LiveSessionManager {
    private session: any = null; // Type inference from connect promise
    private audioContext: AudioContext;
    private inputProcessor: ScriptProcessorNode | null = null;
    private mediaStream: MediaStream | null = null;
    private nextStartTime = 0;
    private callbacks: LiveSessionCallbacks;
    private isConnected = false;

    constructor(callbacks: LiveSessionCallbacks) {
        this.callbacks = callbacks;
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    public async connect() {
        if (this.isConnected) return;

        try {
            // 1. Setup Input Audio Stream (Microphone)
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            
            // Check if mediaDevices API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Audio input is not supported in this browser.");
            }

            try {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                console.error("Microphone access denied or device not found:", err);
                throw new Error("Microphone not found or permission denied.");
            }

            const source = inputAudioContext.createMediaStreamSource(this.mediaStream);
            this.inputProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

            this.session = await ai.live.connect({
                model: MODEL_NAME,
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                    },
                    systemInstruction: "You are a wise, ancient healer (Hakim). You speak calmly, with empathy. You are diagnosing the user's health and spirit based on their voice.",
                },
                callbacks: {
                    onopen: () => {
                        console.log("Live Session Opened");
                        this.isConnected = true;
                        this.callbacks.onOpen?.();
                        
                        // Start streaming audio
                        if (this.inputProcessor) {
                            this.inputProcessor.onaudioprocess = (e) => {
                                const inputData = e.inputBuffer.getChannelData(0);
                                const pcmBlob = this.createBlob(inputData);
                                this.session.then((s: any) => s.sendRealtimeInput({ media: pcmBlob }));
                            };
                            source.connect(this.inputProcessor);
                            this.inputProcessor.connect(inputAudioContext.destination);
                        }
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                         // Handle Audio Output
                        const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            try {
                                const audioBuffer = await this.decodeAudioData(base64Audio);
                                this.playAudio(audioBuffer);
                                this.callbacks.onAudioData?.(audioBuffer); // For visualizer
                            } catch (e) {
                                console.error("Audio decode error", e);
                            }
                        }
                    },
                    onclose: () => {
                        console.log("Live Session Closed");
                        this.disconnect();
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error("Live Session Error", e);
                        this.callbacks.onError?.(new Error("Connection error"));
                    }
                }
            });

        } catch (error) {
            console.error("Failed to connect live session:", error);
            this.callbacks.onError?.(error as Error);
        }
    }

    public disconnect() {
        this.isConnected = false;
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.inputProcessor) {
            this.inputProcessor.disconnect();
            this.inputProcessor = null;
        }
        if (this.session) {
             // session.close() if available on the promise result, usually handled by just stopping input
             this.session.then((s: any) => {
                 try { s.close(); } catch(e){}
             });
             this.session = null;
        }
        this.callbacks.onClose?.();
    }

    private createBlob(data: Float32Array): GenAIBlob {
        const l = data.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            int16[i] = data[i] * 32768;
        }
        const uint8 = new Uint8Array(int16.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        
        return {
            data: base64,
            mimeType: 'audio/pcm;rate=16000',
        };
    }

    private async decodeAudioData(base64: string): Promise<AudioBuffer> {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const dataInt16 = new Int16Array(bytes.buffer);
        const buffer = this.audioContext.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) {
            channelData[i] = dataInt16[i] / 32768.0;
        }
        return buffer;
    }

    private playAudio(buffer: AudioBuffer) {
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        
        const now = this.audioContext.currentTime;
        // Simple scheduling to prevent overlap or gaps
        const startTime = Math.max(now, this.nextStartTime);
        source.start(startTime);
        this.nextStartTime = startTime + buffer.duration;
    }
}
