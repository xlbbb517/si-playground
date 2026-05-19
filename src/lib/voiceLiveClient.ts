import { pcm16ToBase64 } from './audioCapture';
import type { ConnectionStatus, TranscriptEntry, SessionLogItem } from '../types';

export interface VoiceLiveCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSourceTranscript: (entry: TranscriptEntry) => void;
  onTranslatedTranscript: (entry: TranscriptEntry) => void;
  onLatency: (ms: number) => void;
  onAudioOutput: (base64: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onLog: (item: SessionLogItem) => void;
}

export class VoiceLiveClient {
  private ws: WebSocket | null = null;
  private callbacks: VoiceLiveCallbacks;
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private sourceLanguage: string;
  private targetLanguage: string;
  private systemPrompt: string;
  private lastSpeechEndTime = 0;
  private currentTranscriptId = '';
  private currentTranslationId = '';
  private logSeq = 0;

  constructor(
    endpoint: string,
    apiKey: string,
    model: string,
    sourceLanguage: string,
    targetLanguage: string,
    systemPrompt: string,
    callbacks: VoiceLiveCallbacks
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.systemPrompt = systemPrompt;
    this.callbacks = callbacks;
  }

  private log(level: SessionLogItem['level'], text: string, category: SessionLogItem['category'], detail?: string): void {
    this.callbacks.onLog({
      id: `vl-${++this.logSeq}`,
      ts: Date.now(),
      level,
      text,
      category,
      detail,
    });
  }

  connect(): void {
    this.callbacks.onStatusChange('connecting');
    this.log('info', 'Connecting to Voice Live...', 'session');

    // Voice Live uses cognitiveservices.azure.com with model param
    const resource = this.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `wss://${resource}/openai/realtime?api-version=2025-10-01&model=${this.model}&api-key=${this.apiKey}`;

    this.log('info', `WebSocket URL: wss://${resource}/openai/realtime?api-version=2025-10-01&model=${this.model}`, 'session');

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
    // Determine voice name based on target language
    const voiceName = this.targetLanguage.startsWith('en')
      ? 'en-US-Aria:DragonHDFlashLatestNeural'
      : this.targetLanguage.startsWith('zh')
        ? 'zh-CN-Xiaochen:DragonHDFlashLatestNeural'
        : 'en-US-Aria:DragonHDFlashLatestNeural';

    const sessionUpdate = {
      type: 'session.update',
      session: {
        model: this.model,
        modalities: ['audio', 'text'],
        instructions: this.systemPrompt,
        input_audio_format: 'pcm16',
        input_audio_sampling_rate: 16000,
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

      case 'response.audio_transcript.delta':
        if (!this.currentTranslationId) {
          this.currentTranslationId = crypto.randomUUID();
          // First translation delta - measure latency from speech end
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
