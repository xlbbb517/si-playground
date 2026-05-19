export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ChannelType = 'voiceLive' | 'realtimeV2' | 'realtimeTranslate';

export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface LatencyRecord {
  turnId: string;
  timestamp: number;
  voiceLive: number | null;
  realtimeV2: number | null;
  realtimeTranslate: number | null;
}

export interface ChannelState {
  status: ConnectionStatus;
  sourceTranscript: TranscriptEntry[];
  translatedTranscript: TranscriptEntry[];
  currentLatency: number | null;
  latencyHistory: number[];
  isSpeaking: boolean;
}

export interface AppConfig {
  // Shared (sync source)
  sharedEndpoint: string;
  sharedApiKey: string;
  // Voice Live
  voiceLiveEndpoint: string;
  voiceLiveApiKey: string;
  voiceLiveModel: string;
  // GPT Realtime 2
  realtimeEndpoint: string;
  realtimeApiKey: string;
  realtimeDeployment: string;
  // GPT Realtime Translate
  translateEndpoint: string;
  translateApiKey: string;
  translateDeployment: string;
  // Common
  sourceLanguage: string;
  targetLanguage: string;
  systemPrompt: string;
}

export const VOICE_LIVE_MODELS = [
  { id: 'gpt-realtime', label: 'GPT Realtime', tier: 'Pro' },
  { id: 'gpt-4o', label: 'GPT-4o', tier: 'Pro' },
  { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'Pro' },
  { id: 'gpt-5', label: 'GPT-5', tier: 'Pro' },
  { id: 'gpt-5-chat', label: 'GPT-5 Chat', tier: 'Pro' },
  { id: 'gpt-realtime-mini', label: 'GPT Realtime Mini', tier: 'Basic' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tier: 'Basic' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', tier: 'Basic' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', tier: 'Basic' },
  { id: 'gpt-5-nano', label: 'GPT-5 Nano', tier: 'Lite' },
  { id: 'phi4-mm-realtime', label: 'Phi-4 MM Realtime', tier: 'Lite' },
  { id: 'phi4-mini', label: 'Phi-4 Mini', tier: 'Lite' },
];

export const DEFAULT_CONFIG: AppConfig = {
  sharedEndpoint: '',
  sharedApiKey: '',
  voiceLiveEndpoint: '',
  voiceLiveApiKey: '',
  voiceLiveModel: 'gpt-4.1-mini',
  realtimeEndpoint: '',
  realtimeApiKey: '',
  realtimeDeployment: 'gpt-realtime-2',
  translateEndpoint: '',
  translateApiKey: '',
  translateDeployment: 'gpt-realtime-translate',
  sourceLanguage: 'zh-CN',
  targetLanguage: 'en',
  systemPrompt: 'You are a professional simultaneous interpreter. Translate the spoken input faithfully and naturally into the target language. Maintain the speaker\'s tone and intent. Be concise and real-time.',
};

export const LANGUAGES = [
  { code: 'zh-CN', label: '中文 (Chinese)' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'ar', label: 'العربية (Arabic)' },
];

export interface ExportData {
  timestamp: string;
  config: Partial<AppConfig>;
  results: {
    channel: string;
    sourceTranscript: TranscriptEntry[];
    translatedTranscript: TranscriptEntry[];
    latencyHistory: number[];
    avgLatency: number | null;
  }[];
}
