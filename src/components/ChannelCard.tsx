import type { ChannelState, ChannelType } from '../types';
import { StatusBadge } from './StatusBadge';
import { AudioVisualizer } from './AudioVisualizer';
import { TranscriptDisplay } from './TranscriptDisplay';

interface ChannelCardProps {
  type: ChannelType;
  state: ChannelState;
  isRunning: boolean;
  onToggle: () => void;
}

const channelMeta: Record<ChannelType, { title: string; subtitle: string; accent: string }> = {
  voiceLive: {
    title: 'Voice Live API',
    subtitle: 'STT → LLM → TTS (Semantic VAD)',
    accent: 'from-purple-500/20 to-transparent',
  },
  realtimeV2: {
    title: 'GPT-Realtime-2',
    subtitle: 'Text modality + Whisper ASR',
    accent: 'from-blue-500/20 to-transparent',
  },
  realtimeTranslate: {
    title: 'GPT-Realtime-Translate',
    subtitle: 'Native translation model',
    accent: 'from-emerald-500/20 to-transparent',
  },
};

export function ChannelCard({ type, state, isRunning, onToggle }: ChannelCardProps) {
  const meta = channelMeta[type];

  return (
    <div className="flex flex-col bg-card border border-border rounded-xl overflow-hidden h-full">
      {/* Header with gradient */}
      <div className={`relative px-4 py-3 border-b border-border bg-gradient-to-b ${meta.accent}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{meta.title}</h3>
            <p className="text-[10px] text-text-secondary mt-0.5">{meta.subtitle}</p>
          </div>
          <StatusBadge status={state.status} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
        {/* Audio Visualizer */}
        <AudioVisualizer isSpeaking={state.isSpeaking} isActive={state.status === 'connected'} />

        {/* Transcripts */}
        <div className="flex-1 flex flex-col gap-3 overflow-hidden min-h-0">
          <TranscriptDisplay
            label="Source (ASR)"
            entries={state.sourceTranscript}
            variant="source"
          />
          <TranscriptDisplay
            label="Translation"
            entries={state.translatedTranscript}
            variant="translated"
          />
        </div>

        {/* Latency */}
        {state.currentLatency !== null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary">Latency:</span>
            <span className={`font-mono font-bold ${
              state.currentLatency < 1000 ? 'text-emerald-400' :
              state.currentLatency < 2000 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {state.currentLatency}ms
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <button
          onClick={onToggle}
          className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            isRunning
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
          }`}
        >
          {isRunning ? '⏹ Stop' : '▶ Start'}
        </button>
      </div>
    </div>
  );
}
