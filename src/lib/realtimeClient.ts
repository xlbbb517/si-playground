import { pcm16ToBase64 } from './audioCapture';
import type { ConnectionStatus, TranscriptEntry } from '../types';

export interface RealtimeCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSourceTranscript: (entry: TranscriptEntry) => void;
  onTranslatedTranscript: (entry: TranscriptEntry) => void;
  onLatency: (ms: number) => void;
  onSpeakingChange: (speaking: boolean) => void;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private callbacks: RealtimeCallbacks;
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private systemPrompt: string;
  private lastAudioSentTime = 0;
  private currentTranslationId = '';
  private currentTranscriptId = '';

  constructor(
    endpoint: string,
    apiKey: string,
    deployment: string,
    systemPrompt: string,
    callbacks: RealtimeCallbacks
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.deployment = deployment;
    this.systemPrompt = systemPrompt;
    this.callbacks = callbacks;
  }

  connect(): void {
    this.callbacks.onStatusChange('connecting');

    const resource = this.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `wss://${resource}/openai/realtime?api-version=2025-04-01-preview&deployment=${this.deployment}&api-key=${this.apiKey}`;

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
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text'],
        instructions: this.systemPrompt,
        input_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
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

      case 'response.text.delta':
        if (!this.currentTranslationId) {
          this.currentTranslationId = crypto.randomUUID();
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

      case 'response.text.done':
        if (this.currentTranslationId) {
          this.callbacks.onTranslatedTranscript({
            id: this.currentTranslationId,
            text: data.text || '',
            timestamp: Date.now(),
            isFinal: true,
          });
          this.currentTranslationId = '';
        }
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
