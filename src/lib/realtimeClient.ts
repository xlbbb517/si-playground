import { pcm16ToBase64 } from './audioCapture';
import type { ConnectionStatus, TranscriptEntry, SessionLogItem } from '../types';

export interface RealtimeCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSourceTranscript: (entry: TranscriptEntry) => void;
  onTranslatedTranscript: (entry: TranscriptEntry) => void;
  onLatency: (ms: number) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onLog: (item: SessionLogItem) => void;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private callbacks: RealtimeCallbacks;
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private systemPrompt: string;
  private lastSpeechEndTime = 0;
  private currentTranslationId = '';
  private currentTranscriptId = '';
  private logSeq = 0;

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

  private log(level: SessionLogItem['level'], text: string, category: SessionLogItem['category'], detail?: string): void {
    this.callbacks.onLog({
      id: `rt2-${++this.logSeq}`,
      ts: Date.now(),
      level,
      text,
      category,
      detail,
    });
  }

  connect(): void {
    this.callbacks.onStatusChange('connecting');
    this.log('info', 'Connecting to GPT-Realtime-2...', 'session');

    const resource = this.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `wss://${resource}/openai/realtime?api-version=2025-04-01-preview&deployment=${this.deployment}&api-key=${this.apiKey}`;

    this.log('info', `WebSocket URL: wss://${resource}/openai/realtime?...&deployment=${this.deployment}`, 'session');

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

    this.sendEvent(sessionUpdate);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sendEvent(event: any): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const json = JSON.stringify(event);
    this.ws.send(json);
    if (event.type !== 'input_audio_buffer.append') {
      this.log('input', `→ ${event.type}`, 'client_event', JSON.stringify(event, null, 2));
    }
  }

  sendAudio(pcm16: Int16Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
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
      case 'session.created':
        this.log('info', 'Session created by server', 'session');
        break;

      case 'session.updated':
        this.log('info', 'Session config updated', 'session');
        break;

      case 'input_audio_buffer.speech_started':
        this.callbacks.onSpeakingChange(true);
        this.log('info', 'Speech started', 'vad');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.callbacks.onSpeakingChange(false);
        this.lastSpeechEndTime = Date.now();
        this.log('info', 'Speech stopped', 'vad');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this.currentTranscriptId = crypto.randomUUID();
        this.callbacks.onSourceTranscript({
          id: this.currentTranscriptId,
          text: data.transcript || '',
          timestamp: Date.now(),
          isFinal: true,
        });
        this.log('info', `ASR: ${data.transcript || ''}`, 'asr');
        break;

      case 'response.text.delta':
        if (!this.currentTranslationId) {
          this.currentTranslationId = crypto.randomUUID();
          if (this.lastSpeechEndTime > 0) {
            const latency = Date.now() - this.lastSpeechEndTime;
            this.callbacks.onLatency(latency);
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
