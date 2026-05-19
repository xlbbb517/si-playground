import { useState, useCallback, useRef, useEffect } from 'react';
import { ConfigPanel } from './components/ConfigPanel';
import { ChannelCard } from './components/ChannelCard';
import { LatencyChart } from './components/LatencyChart';
import { AudioCapture } from './lib/audioCapture';
import { PCMPlayer } from './lib/pcmPlayer';
import { VoiceLiveClient } from './lib/voiceLiveClient';
import { RealtimeClient } from './lib/realtimeClient';
import { TranslateClient } from './lib/translateClient';
import type {
  AppConfig,
  ChannelState,
  ChannelType,
  LatencyRecord,
  TranscriptEntry,
  ExportData,
} from './types';
import { DEFAULT_CONFIG, LANGUAGES } from './types';

const STORAGE_KEY = 'sip-config';
const INITIAL_CHANNEL_STATE: ChannelState = {
  status: 'disconnected',
  sourceTranscript: [],
  translatedTranscript: [],
  currentLatency: null,
  latencyHistory: [],
  isSpeaking: false,
};

function loadConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelType>('voiceLive');
  const [isRunning, setIsRunning] = useState(false);
  const [latencyRecords, setLatencyRecords] = useState<LatencyRecord[]>([]);

  const [voiceLiveState, setVoiceLiveState] = useState<ChannelState>(INITIAL_CHANNEL_STATE);
  const [realtimeV2State, setRealtimeV2State] = useState<ChannelState>(INITIAL_CHANNEL_STATE);
  const [translateState, setTranslateState] = useState<ChannelState>(INITIAL_CHANNEL_STATE);

  const audioCapture = useRef<AudioCapture>(new AudioCapture());
  const voiceLiveClient = useRef<VoiceLiveClient | null>(null);
  const realtimeClient = useRef<RealtimeClient | null>(null);
  const translateClient = useRef<TranslateClient | null>(null);
  const voiceLivePcmPlayer = useRef<PCMPlayer | null>(null);
  const translatePcmPlayer = useRef<PCMPlayer | null>(null);
  const latencyTurnId = useRef(0);

  // Responsive: detect small screens
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setIsSmallScreen(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleConfigChange = useCallback((newConfig: AppConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  }, []);

  const addTranscriptEntry = useCallback(
    (
      channel: ChannelType,
      type: 'source' | 'translated',
      entry: TranscriptEntry
    ) => {
      const setter =
        channel === 'voiceLive'
          ? setVoiceLiveState
          : channel === 'realtimeV2'
            ? setRealtimeV2State
            : setTranslateState;

      setter((prev) => {
        const key = type === 'source' ? 'sourceTranscript' : 'translatedTranscript';
        const existing = prev[key];

        // If entry is final, replace any streaming entry with same id
        if (entry.isFinal) {
          const filtered = existing.filter((e) => e.id !== entry.id);
          return { ...prev, [key]: [...filtered, entry] };
        }

        // Streaming delta: accumulate text on same id
        const existingEntry = existing.find((e) => e.id === entry.id);
        if (existingEntry) {
          return {
            ...prev,
            [key]: existing.map((e) =>
              e.id === entry.id ? { ...e, text: e.text + entry.text } : e
            ),
          };
        }
        return { ...prev, [key]: [...existing, entry] };
      });
    },
    []
  );

  const handleLatency = useCallback(
    (channel: ChannelType, ms: number) => {
      const setter =
        channel === 'voiceLive'
          ? setVoiceLiveState
          : channel === 'realtimeV2'
            ? setRealtimeV2State
            : setTranslateState;

      setter((prev) => ({
        ...prev,
        currentLatency: ms,
        latencyHistory: [...prev.latencyHistory, ms],
      }));

      // Update latency records for comparison
      setLatencyRecords((prev) => {
        const currentTurnId = `turn-${latencyTurnId.current}`;
        const last = prev[prev.length - 1];
        if (last && last.turnId === currentTurnId) {
          return [...prev.slice(0, -1), { ...last, [channel]: ms }];
        }
        latencyTurnId.current++;
        const newRecord: LatencyRecord = {
          turnId: `turn-${latencyTurnId.current}`,
          timestamp: Date.now(),
          voiceLive: null,
          realtimeV2: null,
          realtimeTranslate: null,
          [channel]: ms,
        };
        return [...prev, newRecord];
      });
    },
    []
  );

  const startSession = useCallback(async () => {
    // Voice Live
    if (config.voiceLiveEndpoint && config.voiceLiveApiKey) {
      voiceLivePcmPlayer.current = new PCMPlayer();
      await voiceLivePcmPlayer.current.resume();

      voiceLiveClient.current = new VoiceLiveClient(
        config.voiceLiveEndpoint,
        config.voiceLiveApiKey,
        config.voiceLiveModel,
        config.sourceLanguage,
        config.targetLanguage,
        config.systemPrompt,
        {
          onStatusChange: (status) =>
            setVoiceLiveState((prev) => ({ ...prev, status })),
          onSourceTranscript: (entry) =>
            addTranscriptEntry('voiceLive', 'source', entry),
          onTranslatedTranscript: (entry) =>
            addTranscriptEntry('voiceLive', 'translated', entry),
          onLatency: (ms) => handleLatency('voiceLive', ms),
          onAudioOutput: (base64) => voiceLivePcmPlayer.current?.enqueue(base64),
          onSpeakingChange: (speaking) =>
            setVoiceLiveState((prev) => ({ ...prev, isSpeaking: speaking })),
        }
      );
      voiceLiveClient.current.connect();
    }

    // Realtime V2
    if (config.realtimeEndpoint && config.realtimeApiKey) {
      // Inject source/target language into prompt for RT-2
      const targetLang = LANGUAGES.find(l => l.code === config.targetLanguage)?.label || config.targetLanguage;
      const sourceLang = LANGUAGES.find(l => l.code === config.sourceLanguage)?.label || config.sourceLanguage;
      const rtPrompt = config.systemPrompt + `\n\nIMPORTANT: Translate from ${sourceLang} into ${targetLang}. Output ONLY the translation, nothing else.`;
      realtimeClient.current = new RealtimeClient(
        config.realtimeEndpoint,
        config.realtimeApiKey,
        config.realtimeDeployment,
        rtPrompt,
        {
          onStatusChange: (status) =>
            setRealtimeV2State((prev) => ({ ...prev, status })),
          onSourceTranscript: (entry) =>
            addTranscriptEntry('realtimeV2', 'source', entry),
          onTranslatedTranscript: (entry) =>
            addTranscriptEntry('realtimeV2', 'translated', entry),
          onLatency: (ms) => handleLatency('realtimeV2', ms),
          onSpeakingChange: (speaking) =>
            setRealtimeV2State((prev) => ({ ...prev, isSpeaking: speaking })),
        }
      );
      realtimeClient.current.connect();
    }

    // Translate
    if (config.translateEndpoint && config.translateApiKey) {
      translatePcmPlayer.current = new PCMPlayer();
      await translatePcmPlayer.current.resume();

      translateClient.current = new TranslateClient(
        config.translateEndpoint,
        config.translateApiKey,
        config.translateDeployment,
        config.targetLanguage,
        {
          onStatusChange: (status) =>
            setTranslateState((prev) => ({ ...prev, status })),
          onSourceTranscript: (entry) =>
            addTranscriptEntry('realtimeTranslate', 'source', entry),
          onTranslatedTranscript: (entry) =>
            addTranscriptEntry('realtimeTranslate', 'translated', entry),
          onLatency: (ms) => handleLatency('realtimeTranslate', ms),
          onAudioOutput: (base64) => translatePcmPlayer.current?.enqueue(base64),
          onSpeakingChange: (speaking) =>
            setTranslateState((prev) => ({ ...prev, isSpeaking: speaking })),
        }
      );
      translateClient.current.connect();
    }

    // Start audio capture
    await audioCapture.current.start((pcm16) => {
      voiceLiveClient.current?.sendAudio(pcm16);
      realtimeClient.current?.sendAudio(pcm16);
      translateClient.current?.sendAudio(pcm16);
    });

    setIsRunning(true);
  }, [config, addTranscriptEntry, handleLatency]);

  const stopSession = useCallback(() => {
    audioCapture.current.stop();
    voiceLiveClient.current?.disconnect();
    realtimeClient.current?.disconnect();
    translateClient.current?.disconnect();
    voiceLivePcmPlayer.current?.close();
    translatePcmPlayer.current?.close();
    voiceLiveClient.current = null;
    realtimeClient.current = null;
    translateClient.current = null;
    voiceLivePcmPlayer.current = null;
    translatePcmPlayer.current = null;
    setIsRunning(false);
  }, []);

  const handleToggle = useCallback(
    (_channel: ChannelType) => {
      if (isRunning) {
        stopSession();
      } else {
        void startSession();
      }
    },
    [isRunning, startSession, stopSession]
  );

  const exportResults = useCallback(() => {
    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const exportData: ExportData = {
      timestamp: new Date().toISOString(),
      config: {
        sourceLanguage: config.sourceLanguage,
        targetLanguage: config.targetLanguage,
        voiceLiveModel: config.voiceLiveModel,
        realtimeDeployment: config.realtimeDeployment,
        translateDeployment: config.translateDeployment,
      },
      results: [
        {
          channel: 'Voice Live',
          sourceTranscript: voiceLiveState.sourceTranscript,
          translatedTranscript: voiceLiveState.translatedTranscript,
          latencyHistory: voiceLiveState.latencyHistory,
          avgLatency: avg(voiceLiveState.latencyHistory),
        },
        {
          channel: 'GPT-Realtime-2',
          sourceTranscript: realtimeV2State.sourceTranscript,
          translatedTranscript: realtimeV2State.translatedTranscript,
          latencyHistory: realtimeV2State.latencyHistory,
          avgLatency: avg(realtimeV2State.latencyHistory),
        },
        {
          channel: 'GPT-Realtime-Translate',
          sourceTranscript: translateState.sourceTranscript,
          translatedTranscript: translateState.translatedTranscript,
          latencyHistory: translateState.latencyHistory,
          avgLatency: avg(translateState.latencyHistory),
        },
      ],
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interpretation-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [config, voiceLiveState, realtimeV2State, translateState]);

  const channels: { type: ChannelType; state: ChannelState }[] = [
    { type: 'voiceLive', state: voiceLiveState },
    { type: 'realtimeV2', state: realtimeV2State },
    { type: 'realtimeTranslate', state: translateState },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Config Panel */}
      <ConfigPanel
        config={config}
        onConfigChange={handleConfigChange}
        isCollapsed={configCollapsed}
        onToggleCollapse={() => setConfigCollapsed(!configCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-text-primary">
              🎙️ Azure Simultaneous Interpretation
            </h1>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportResults}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-border/50 hover:bg-border rounded-lg transition-colors"
            >
              📥 Export Results
            </button>
            <button
              onClick={isRunning ? stopSession : () => void startSession()}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                isRunning
                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
                  : 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30'
              }`}
            >
              {isRunning ? '⏹ Stop All' : '▶ Start All'}
            </button>
          </div>
        </header>

        {/* Channel Cards */}
        <div className="flex-1 overflow-hidden p-4">
          {isSmallScreen ? (
            // Tabs layout for small screens
            <div className="flex flex-col h-full">
              <div className="flex border-b border-border mb-4">
                {channels.map((ch) => (
                  <button
                    key={ch.type}
                    onClick={() => setActiveTab(ch.type)}
                    className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                      activeTab === ch.type
                        ? 'text-text-primary border-b-2 border-accent'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {ch.type === 'voiceLive'
                      ? 'Voice Live'
                      : ch.type === 'realtimeV2'
                        ? 'Realtime V2'
                        : 'Translate'}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {channels
                  .filter((ch) => ch.type === activeTab)
                  .map((ch) => (
                    <ChannelCard
                      key={ch.type}
                      type={ch.type}
                      state={ch.state}
                      isRunning={isRunning}
                      onToggle={() => handleToggle(ch.type)}
                    />
                  ))}
              </div>
            </div>
          ) : (
            // Three-column layout for large screens
            <div className="grid grid-cols-3 gap-4 h-full">
              {channels.map((ch) => (
                <ChannelCard
                  key={ch.type}
                  type={ch.type}
                  state={ch.state}
                  isRunning={isRunning}
                  onToggle={() => handleToggle(ch.type)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom Latency Comparison */}
        <div className="px-4 pb-4">
          <LatencyChart records={latencyRecords} />
        </div>
      </div>
    </div>
  );
}
