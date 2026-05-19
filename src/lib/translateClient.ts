import { pcm16ToBase64 } from './audioCapture';
import type { ConnectionStatus, TranscriptEntry } from '../types';

export interface TranslateCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSourceTranscript: (entry: TranscriptEntry) => void;
  onTranslatedTranscript: (entry: TranscriptEntry) => void;
  onLatency: (ms: number) => void;
  onAudioOutput: (base64: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
}

export class TranslateClient {
  private ws: WebSocket | null = null;
  private callbacks: TranslateCallbacks;
  private endpoint: string;
  private apiKey: string;
  private targetLanguage: string;
  private lastAudioSentTime = 0;
  private currentTranslationId = '';
  private currentTranscriptId = '';
  private hasReceivedFirstDelta = false;

  constructor(
    endpoint: string,
    apiKey: string,
    targetLanguage: string,
    callbacks: TranslateCallbacks
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.targetLanguage = targetLanguage;
    this.callbacks = callbacks;
  }

  connect(): void {
    this.callbacks.onStatusChange('connecting');

    const resource = this.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `wss://${resource}/openai/v1/realtime/translations?model=gpt-realtime-translate&api-key=${this.apiKey}`;

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
        audio: {
          output: {
            language: this.targetLanguage,
          },
          input: {
            transcription: {
              model: 'gpt-realtime-translate',
            },
          },
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
        type: 'session.input_audio_buffer.append',
        audio: base64,
      })
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMessage(data: any): void {
    switch (data.type) {
      case 'session.input_transcript.delta':
        if (!this.currentTranscriptId) {
          this.currentTranscriptId = crypto.randomUUID();
          this.callbacks.onSpeakingChange(true);
        }
        this.callbacks.onSourceTranscript({
          id: this.currentTranscriptId,
          text: data.delta || '',
          timestamp: Date.now(),
          isFinal: false,
        });
        break;

      case 'session.input_transcript.done':
        this.callbacks.onSpeakingChange(false);
        if (this.currentTranscriptId) {
          this.callbacks.onSourceTranscript({
            id: this.currentTranscriptId,
            text: data.transcript || '',
            timestamp: Date.now(),
            isFinal: true,
          });
          this.currentTranscriptId = '';
        }
        this.lastAudioSentTime = Date.now();
        break;

      case 'session.output_transcript.delta':
        if (!this.currentTranslationId) {
          this.currentTranslationId = crypto.randomUUID();
          if (!this.hasReceivedFirstDelta && this.lastAudioSentTime > 0) {
            const latency = Date.now() - this.lastAudioSentTime;
            this.callbacks.onLatency(latency);
            this.hasReceivedFirstDelta = true;
          }
        }
        this.callbacks.onTranslatedTranscript({
          id: this.currentTranslationId,
          text: data.delta || '',
          timestamp: Date.now(),
          isFinal: false,
        });
        break;

      case 'session.output_transcript.done':
        if (this.currentTranslationId) {
          this.callbacks.onTranslatedTranscript({
            id: this.currentTranslationId,
            text: data.transcript || '',
            timestamp: Date.now(),
            isFinal: true,
          });
          this.currentTranslationId = '';
          this.hasReceivedFirstDelta = false;
        }
        break;

      case 'session.output_audio.delta':
        this.callbacks.onAudioOutput(data.delta || '');
        break;
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
