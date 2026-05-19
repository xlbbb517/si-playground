import { useState, useCallback, useRef } from 'react';
import { ConfigPanel } from './components/ConfigPanel';
import { ChannelPanel } from './components/ChannelPanel';
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
  SessionLogItem,
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
  logs: [],
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

const TAB_META: Record<ChannelType, { label: string; color: string }> = {
  voiceLive: { label: 'Voice Live', color: 'border-purple-500 text-purple-400' },
  realtimeV2: { label: 'GPT-Realtime-2', color: 'border-blue-500 text-blue-400' },
  realtimeTranslate: { label: 'Translate', color: 'border-emerald-500 text-emerald-400' },
};

export default function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelType>('voiceLive');
  const [latencyRecords, setLatencyRecords] = useState<LatencyRecord[]>([]);

  const [voiceLiveState, setVoiceLiveState] = useState<ChannelState>(INITIAL_CHANNEL_STATE);
  const [realtimeV2State, setRealtimeV2State] = useState<ChannelState>(INITIAL_CHANNEL_STATE);
  const [translateState, setTranslateState] = useState<ChannelState>(INITIAL_CHANNEL_STATE);

  // Track which channel is actively running
  const [runningChannel, setRunningChannel] = useState<ChannelType | null>(null);

  const audioCapture = useRef<AudioCapture>(new AudioCapture());
  const voiceLiveClient = useRef<VoiceLiveClient | null>(null);
  const realtimeClient = useRef<RealtimeClient | null>(null);
  const translateClient = useRef<TranslateClient | null>(null);
  const voiceLivePcmPlayer = useRef<PCMPlayer | null>(null);
  const translatePcmPlayer = useRef<PCMPlayer | null>(null);
  const latencyTurnId = useRef(0);

  const handleConfigChange = useCallback((newConfig: AppConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  }, []);

  const getStateSetter = useCallback((channel: ChannelType) => {
    return channel === 'voiceLive'
      ? setVoiceLiveState
      : channel === 'realtimeV2'
        ? setRealtimeV2State
        : setTranslateState;
  }, []);

  const addLog = useCallback((channel: ChannelType, item: SessionLogItem) => {
    const setter = channel === 'voiceLive'
      ? setVoiceLiveState
      : channel === 'realtimeV2'
        ? setRealtimeV2State
        : setTranslateState;
    setter((prev) => ({
      ...prev,
      logs: [...prev.logs.slice(-500), item], // Keep last 500 entries
    }));
  }, []);

  const addTranscriptEntry = useCallback(
    (
      channel: ChannelType,
      type: 'source' | 'translated',
      entry: TranscriptEntry
    ) => {
      const setter = getStateSetter(channel);

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
    [getStateSetter]
  );

  const handleLatency = useCallback(
    (channel: ChannelType, ms: number) => {
      const setter = getStateSetter(channel);

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
    [getStateSetter]
  );

  const startChannel = useCallback(async (channel: ChannelType) => {
    // Stop any currently running channel first
    if (runningChannel) {
      stopChannel(runningChannel);
    }

    if (channel === 'voiceLive') {
      const endpoint = config.voiceLiveEndpoint || config.sharedEndpoint;
      const apiKey = config.voiceLiveApiKey || config.sharedApiKey;
      if (!endpoint || !apiKey) return;

      voiceLivePcmPlayer.current = new PCMPlayer();
      await voiceLivePcmPlayer.current.resume();

      voiceLiveClient.current = new VoiceLiveClient(
        endpoint,
        apiKey,
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
          onLog: (item) => addLog('voiceLive', item),
        }
      );
      voiceLiveClient.current.connect();

      // Start audio capture — sends to Voice Live only
      await audioCapture.current.start((pcm16) => {
        voiceLiveClient.current?.sendAudio(pcm16);
      });
    } else if (channel === 'realtimeV2') {
      const endpoint = config.realtimeEndpoint || config.sharedEndpoint;
      const apiKey = config.realtimeApiKey || config.sharedApiKey;
      if (!endpoint || !apiKey) return;

      // Inject source/target language into prompt for RT-2
      const targetLang = LANGUAGES.find(l => l.code === config.targetLanguage)?.label || config.targetLanguage;
      const sourceLang = LANGUAGES.find(l => l.code === config.sourceLanguage)?.label || config.sourceLanguage;
      const rtPrompt = config.systemPrompt + `\n\nIMPORTANT: Translate from ${sourceLang} into ${targetLang}. Output ONLY the translation, nothing else.`;

      realtimeClient.current = new RealtimeClient(
        endpoint,
        apiKey,
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
          onLog: (item) => addLog('realtimeV2', item),
        }
      );
      realtimeClient.current.connect();

      // Start audio capture — sends to RT-2 only
      await audioCapture.current.start((pcm16) => {
        realtimeClient.current?.sendAudio(pcm16);
      });
    } else if (channel === 'realtimeTranslate') {
      const endpoint = config.translateEndpoint || config.sharedEndpoint;
      const apiKey = config.translateApiKey || config.sharedApiKey;
      if (!endpoint || !apiKey) return;

      translatePcmPlayer.current = new PCMPlayer();
      await translatePcmPlayer.current.resume();

      translateClient.current = new TranslateClient(
        endpoint,
        apiKey,
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
          onLog: (item) => addLog('realtimeTranslate', item),
        }
      );
      translateClient.current.connect();

      // Start audio capture — sends to Translate only
      await audioCapture.current.start((pcm16) => {
        translateClient.current?.sendAudio(pcm16);
      });
    }

    setRunningChannel(channel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, addTranscriptEntry, handleLatency, addLog, runningChannel]);

  const stopChannel = useCallback((channel: ChannelType) => {
    audioCapture.current.stop();

    if (channel === 'voiceLive') {
      voiceLiveClient.current?.disconnect();
      voiceLivePcmPlayer.current?.close();
      voiceLiveClient.current = null;
      voiceLivePcmPlayer.current = null;
    } else if (channel === 'realtimeV2') {
      realtimeClient.current?.disconnect();
      realtimeClient.current = null;
    } else if (channel === 'realtimeTranslate') {
      translateClient.current?.disconnect();
      translatePcmPlayer.current?.close();
      translateClient.current = null;
      translatePcmPlayer.current = null;
    }

    setRunningChannel(null);
  }, []);

  const handleToggle = useCallback(
    (channel: ChannelType) => {
      if (runningChannel === channel) {
        stopChannel(channel);
      } else {
        void startChannel(channel);
      }
    },
    [runningChannel, startChannel, stopChannel]
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

  const getChannelState = (channel: ChannelType): ChannelState => {
    switch (channel) {
      case 'voiceLive': return voiceLiveState;
      case 'realtimeV2': return realtimeV2State;
      case 'realtimeTranslate': return translateState;
    }
  };

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
            {runningChannel && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live ({TAB_META[runningChannel].label})
              </span>
            )}
          </div>
          <button
            onClick={exportResults}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-border/50 hover:bg-border rounded-lg transition-colors"
          >
            📥 Export Results
          </button>
        </header>

        {/* Tab Bar */}
        <div className="flex border-b border-border bg-card/30">
          {(['voiceLive', 'realtimeV2', 'realtimeTranslate'] as ChannelType[]).map((ch) => {
            const meta = TAB_META[ch];
            const isActive = activeTab === ch;
            const isChannelRunning = runningChannel === ch;
            const state = getChannelState(ch);
            return (
              <button
                key={ch}
                onClick={() => setActiveTab(ch)}
                className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? `${meta.color} border-b-2`
                    : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
                }`}
              >
                {/* Running indicator */}
                {isChannelRunning && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {meta.label}
                {/* Status dot */}
                {state.status === 'connected' && !isChannelRunning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
                {state.status === 'error' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Active Channel Panel */}
        <div className="flex-1 overflow-hidden p-4">
          <ChannelPanel
            key={activeTab}
            type={activeTab}
            state={getChannelState(activeTab)}
            isRunning={runningChannel === activeTab}
            onToggle={() => handleToggle(activeTab)}
          />
        </div>

        {/* Bottom Latency Comparison */}
        <div className="px-4 pb-4">
          <LatencyChart records={latencyRecords} />
        </div>
      </div>
    </div>
  );
}
