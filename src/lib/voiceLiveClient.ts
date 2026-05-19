import { pcm16ToBase64 } from './audioCapture';
import type { ConnectionStatus, TranscriptEntry } from '../types';

export interface VoiceLiveCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSourceTranscript: (entry: TranscriptEntry) => void;
  onTranslatedTranscript: (entry: TranscriptEntry) => void;
  onLatency: (ms: number) => void;
  onAudioOutput: (base64: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
}

export class VoiceLiveClient {
  private ws: WebSocket | null = null;
  private callbacks: VoiceLiveCallbacks;
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private sourceLanguage: string;
  private targetLanguage: string;
  private systemPrompt: string;
  private lastAudioSentTime = 0;
  private currentTranscriptId = '';
  private currentTranslationId = '';

  constructor(
    endpoint: string,
    apiKey: string,
    deployment: string,
    sourceLanguage: string,
    targetLanguage: string,
    systemPrompt: string,
    callbacks: VoiceLiveCallbacks
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.deployment = deployment;
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.systemPrompt = systemPrompt;
    this.callbacks = callbacks;
  }

  connect(): void {
    this.callbacks.onStatusChange('connecting');

    // Voice Live uses cognitiveservices.azure.com
    const resource = this.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `wss://${resource}/openai/realtime?api-version=2025-10-01&deployment=${this.deployment}&api-key=${this.apiKey}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.callbacks.onStatusChange('connected');
      this.sendSessionUpdate();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string);
      this.handleMessage(data);
    };

    this.ws.onerror = () => {
      this.callbacks.onStatusChange('error');
    };

    this.ws.onclose = () => {
      this.callbacks.onStatusChange('disconnected');
    };
  }

  private sendSessionUpdate(): void {
    const voiceName = this.targetLanguage.startsWith('en')
      ? 'en-US-Aria:DragonHDFlashLatestNeural'
      : this.targetLanguage.startsWith('zh')
        ? 'zh-CN-Xiaochen:DragonHDFlashLatestNeural'
        : 'en-US-Aria:DragonHDFlashLatestNeural';

    const sessionUpdate = {
      type: 'session.update',
      session: {
        model: this.deployment,
        modalities: ['audio', 'text'],
        instructions: this.systemPrompt,
        input_audio_format: 'pcm16',
        input_audio_sampling_rate: 24000,
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'azure_semantic_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
          speech_duration_ms: 80,
          create_response: true,
          interrupt_response: false,
        },
        input_audio_transcription: {
          model: 'azure-speech',
          language: this.sourceLanguage,
        },
        voice: {
          type: 'azure-standard',
          name: voiceName,
        },
      },
    };

    this.ws?.send(JSON.stringify(sessionUpdate));
  }

  sendAudio(pcm16: Int16Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.lastAudioSentTime = Date.now();
    const base64 = pcm16ToBase64(pcm16);
    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64,
      })
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMessage(data: any): void {
    switch (data.type) {
      case 'input_audio_buffer.speech_started':
        this.callbacks.onSpeakingChange(true);
        break;

      case 'input_audio_buffer.speech_stopped':
        this.callbacks.onSpeakingChange(false);
        this.lastAudioSentTime = Date.now();
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this.currentTranscriptId = crypto.randomUUID();
        this.callbacks.onSourceTranscript({
          id: this.currentTranscriptId,
          text: data.transcript || '',
          timestamp: Date.now(),
          isFinal: true,
        });
        break;

      case 'response.audio_transcript.delta':
        if (!this.currentTranslationId) {
          this.currentTranslationId = crypto.randomUUID();
          // First translation delta - measure latency
          if (this.lastAudioSentTime > 0) {
            const latency = Date.now() - this.lastAudioSentTime;
            this.callbacks.onLatency(latency);
          }
        }
        this.callbacks.onTranslatedTranscript({
          id: this.currentTranslationId,
          text: data.delta || '',
          timestamp: Date.now(),
          isFinal: false,
        });
        break;

      case 'response.audio_transcript.done':
        if (this.currentTranslationId) {
          this.callbacks.onTranslatedTranscript({
            id: this.currentTranslationId,
            text: data.transcript || '',
            timestamp: Date.now(),
            isFinal: true,
          });
          this.currentTranslationId = '';
        }
        break;

      case 'response.audio.delta':
        this.callbacks.onAudioOutput(data.delta || '');
        break;

      case 'response.done':
        this.currentTranslationId = '';
        break;
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
