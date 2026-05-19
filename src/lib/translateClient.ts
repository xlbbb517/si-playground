import { pcm16ToBase64 } from './audioCapture';
import type { AppConfig, ConnectionStatus, TranscriptEntry, SessionLogItem } from '../types';

export interface TranslateCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSourceTranscript: (entry: TranscriptEntry) => void;
  onTranslatedTranscript: (entry: TranscriptEntry) => void;
  onLatency: (ms: number) => void;
  onAudioOutput: (base64: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onLog: (item: SessionLogItem) => void;
}

export class TranslateClient {
  private ws: WebSocket | null = null;
  private callbacks: TranslateCallbacks;
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private targetLanguage: string;
  private config: AppConfig;
  private lastSpeechEndTime = 0;
  private currentTranslationId = '';
  private currentTranscriptId = '';
  private hasReceivedFirstDelta = false;
  private logSeq = 0;

  constructor(
    endpoint: string,
    apiKey: string,
    deployment: string,
    targetLanguage: string,
    config: AppConfig,
    callbacks: TranslateCallbacks
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.deployment = deployment;
    this.targetLanguage = targetLanguage;
    this.config = config;
    this.callbacks = callbacks;
  }

  private log(level: SessionLogItem['level'], text: string, category: SessionLogItem['category'], detail?: string): void {
    this.callbacks.onLog({
      id: `tr-${++this.logSeq}`,
      ts: Date.now(),
      level,
      text,
      category,
      detail,
    });
  }

  connect(): void {
    this.callbacks.onStatusChange('connecting');
    this.log('info', 'Connecting to GPT-Realtime-Translate...', 'session');

    // Auto-convert endpoint domains to openai.azure.com for Translate
    let resource = this.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (resource.includes('.services.ai.azure.com')) {
      const name = resource.split('.services.ai.azure.com')[0];
      resource = `${name}.openai.azure.com`;
    } else if (resource.includes('.cognitiveservices.azure.com')) {
      const name = resource.split('.cognitiveservices.azure.com')[0];
      resource = `${name}.openai.azure.com`;
    }
    const url = `wss://${resource}/openai/v1/realtime/translations?model=${this.deployment}&api-key=${this.apiKey}&translation_delay=${this.config.translateDelay}`;

    this.log('info', `WebSocket URL: wss://${resource}/openai/v1/realtime/translations?model=${this.deployment}&translation_delay=${this.config.translateDelay}`, 'session');

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.callbacks.onStatusChange('connected');
      this.log('info', 'WebSocket connected', 'session');
      this.sendSessionUpdate();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string);
      this.log('output', `← ${data.type}`, 'server_event', JSON.stringify(data, null, 2));
      this.handleMessage(data);
    };

    this.ws.onerror = () => {
      this.callbacks.onStatusChange('error');
      this.log('error', 'WebSocket error', 'error');
    };

    this.ws.onclose = (ev) => {
      this.callbacks.onStatusChange('disconnected');
      this.log('info', `WebSocket closed: code=${ev.code} reason=${ev.reason}`, 'session');
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
        ...(this.config.translateNoiseReduction !== 'off' && {
          noise_reduction: { type: this.config.translateNoiseReduction },
        }),
      },
    };

    this.sendEvent(sessionUpdate);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sendEvent(event: any): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const json = JSON.stringify(event);
    this.ws.send(json);
    if (event.type !== 'session.input_audio_buffer.append') {
      this.log('input', `→ ${event.type}`, 'client_event', JSON.stringify(event, null, 2));
    }
  }

  sendAudio(pcm16: Int16Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
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
      case 'session.created':
        this.log('info', 'Session created by server', 'session');
        break;

      case 'session.updated':
        this.log('info', 'Session config updated', 'session');
        break;

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
        this.lastSpeechEndTime = Date.now();
        this.log('info', `ASR done: ${data.transcript || ''}`, 'asr');
        break;

      case 'session.output_transcript.delta':
        if (!this.currentTranslationId) {
          this.currentTranslationId = crypto.randomUUID();
          if (!this.hasReceivedFirstDelta && this.lastSpeechEndTime > 0) {
            const latency = Date.now() - this.lastSpeechEndTime;
            this.callbacks.onLatency(latency);
            this.hasReceivedFirstDelta = true;
            this.log('info', `First output latency: ${latency}ms`, 'latency');
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

      case 'error':
        this.log('error', `Server error: ${data.error?.message || JSON.stringify(data.error)}`, 'error');
        break;
    }
  }

  disconnect(): void {
    this.log('info', 'Disconnecting...', 'session');
    this.ws?.close();
    this.ws = null;
  }
}
