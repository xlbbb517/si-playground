import type { ChannelState, ChannelType } from '../types';
import { StatusBadge } from './StatusBadge';
import { AudioVisualizer } from './AudioVisualizer';
import { TranscriptDisplay } from './TranscriptDisplay';
import { DebugLog } from './DebugLog';
import { useState } from 'react';

interface ChannelPanelProps {
  type: ChannelType;
  state: ChannelState;
  isRunning: boolean;
  onToggle: () => void;
}

const channelMeta: Record<ChannelType, { title: string; subtitle: string; accentBorder: string }> = {
  voiceLive: {
    title: 'Voice Live API',
    subtitle: 'STT → LLM → TTS (Azure Semantic VAD, 16kHz input)',
    accentBorder: 'border-l-purple-500',
  },
  realtimeV2: {
    title: 'GPT-Realtime-2',
    subtitle: 'Text modality + Whisper ASR (server_vad)',
    accentBorder: 'border-l-blue-500',
  },
  realtimeTranslate: {
    title: 'GPT-Realtime-Translate',
    subtitle: 'Native translation model (streaming)',
    accentBorder: 'border-l-emerald-500',
  },
};

export function ChannelPanel({ type, state, isRunning, onToggle }: ChannelPanelProps) {
  const meta = channelMeta[type];
  const [debugExpanded, setDebugExpanded] = useState(false);

  return (
    <div className={`flex flex-col bg-card border border-border rounded-xl overflow-hidden h-full border-l-2 ${meta.accentBorder}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{meta.title}</h3>
            <p className="text-[11px] text-text-secondary mt-0.5">{meta.subtitle}</p>
          </div>
          <StatusBadge status={state.status} />
        </div>
        <div className="flex items-center gap-3">
          {/* Latency badge */}
          {state.currentLatency !== null && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20">
              <span className="text-[10px] text-text-secondary uppercase">Latency</span>
              <span className={`text-sm font-mono font-bold ${
                state.currentLatency < 1000 ? 'text-emerald-400' :
                state.currentLatency < 2000 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {state.currentLatency}ms
              </span>
            </div>
          )}
          {/* Start/Stop button */}
          <button
            onClick={onToggle}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              isRunning
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
            }`}
          >
            {isRunning ? '⏹ Stop' : '▶ Start'}
          </button>
        </div>
      </div>

      {/* Body - Transcripts */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Audio visualizer strip */}
        <div className="flex flex-col items-center justify-start pt-4 px-2">
          <AudioVisualizer isSpeaking={state.isSpeaking} isActive={state.status === 'connected'} />
        </div>

        {/* Two-column transcript area */}
        <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
          <div className="flex flex-col overflow-hidden">
            <TranscriptDisplay
              label="Source (ASR)"
              entries={state.sourceTranscript}
              variant="source"
            />
          </div>
          <div className="flex flex-col overflow-hidden">
            <TranscriptDisplay
              label="Translation"
              entries={state.translatedTranscript}
              variant="translated"
            />
          </div>
        </div>
      </div>

      {/* Debug Log (collapsible at bottom) */}
      <DebugLog
        logs={state.logs}
        isExpanded={debugExpanded}
        onToggle={() => setDebugExpanded(!debugExpanded)}
      />
    </div>
  );
}
