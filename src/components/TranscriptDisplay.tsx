import { useEffect, useRef } from 'react';
import type { TranscriptEntry } from '../types';

interface TranscriptDisplayProps {
  label: string;
  entries: TranscriptEntry[];
  variant: 'source' | 'translated';
}

export function TranscriptDisplay({ label, entries, variant }: TranscriptDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const borderColor = variant === 'source' ? 'border-blue-500/30' : 'border-emerald-500/30';
  const labelColor = variant === 'source' ? 'text-blue-400' : 'text-emerald-400';

  return (
    <div className={`flex flex-col border-l-2 ${borderColor} pl-3`}>
      <span className={`text-[10px] uppercase tracking-wider font-semibold ${labelColor} mb-1`}>
        {label}
      </span>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 text-sm"
      >
        {entries.length === 0 ? (
          <p className="text-zinc-600 text-xs italic">Waiting for speech...</p>
        ) : (
          entries.map((entry) => (
            <p
              key={entry.id + entry.timestamp}
              className={`leading-relaxed ${
                entry.isFinal ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {entry.text}
              {!entry.isFinal && (
                <span className="inline-block w-1.5 h-3.5 bg-text-secondary/50 ml-0.5 animate-pulse" />
              )}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
