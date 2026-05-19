import { useState, useEffect, useRef } from 'react';
import type { SessionLogItem, LogCategory } from '../types';

interface DebugLogProps {
  logs: SessionLogItem[];
  isExpanded: boolean;
  onToggle: () => void;
}

const CATEGORY_COLORS: Record<LogCategory, string> = {
  server_event: 'text-blue-400',
  client_event: 'text-purple-400',
  session: 'text-zinc-400',
  error: 'text-red-400',
  vad: 'text-yellow-400',
  asr: 'text-emerald-400',
  latency: 'text-orange-400',
};

const CATEGORY_LABELS: Record<LogCategory, string> = {
  server_event: 'Server',
  client_event: 'Client',
  session: 'Session',
  error: 'Error',
  vad: 'VAD',
  asr: 'ASR',
  latency: 'Latency',
};

const ALL_CATEGORIES: LogCategory[] = ['server_event', 'client_event', 'session', 'error', 'vad', 'asr', 'latency'];

export function DebugLog({ logs, isExpanded, onToggle }: DebugLogProps) {
  const [activeFilters, setActiveFilters] = useState<Set<LogCategory>>(new Set(ALL_CATEGORIES));
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const toggleFilter = (cat: LogCategory) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const filteredLogs = logs.filter((l) => activeFilters.has(l.category));

  const errorCount = logs.filter((l) => l.level === 'error').length;

  return (
    <div className="border-t border-border">
      {/* Toggle bar */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-border/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-text-secondary font-medium">
            {isExpanded ? '▼' : '▶'} Debug Log
          </span>
          <span className="text-zinc-600">({logs.length} events)</span>
          {errorCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded">
              {errorCount} errors
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border">
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-border">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleFilter(cat)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  activeFilters.has(cat)
                    ? `${CATEGORY_COLORS[cat]} bg-white/5 border border-white/10`
                    : 'text-zinc-600 bg-transparent border border-transparent'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Log entries */}
          <div
            ref={scrollRef}
            className="max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-zinc-600 text-center py-4">No log entries</p>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="group">
                  <div
                    className={`flex items-start gap-2 px-4 py-0.5 hover:bg-white/[0.02] ${
                      log.detail ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => {
                      if (log.detail) {
                        setExpandedLogId(expandedLogId === log.id ? null : log.id);
                      }
                    }}
                  >
                    <span className="text-zinc-600 whitespace-nowrap shrink-0">
                      {new Date(log.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`shrink-0 w-12 ${CATEGORY_COLORS[log.category]}`}>
                      [{CATEGORY_LABELS[log.category]}]
                    </span>
                    <span className={`truncate ${log.level === 'error' ? 'text-red-400' : 'text-text-secondary'}`}>
                      {log.text}
                    </span>
                    {log.detail && (
                      <span className="text-zinc-700 shrink-0 ml-auto">
                        {expandedLogId === log.id ? '▼' : '▶'}
                      </span>
                    )}
                  </div>
                  {expandedLogId === log.id && log.detail && (
                    <pre className="px-4 py-2 ml-20 text-[10px] text-zinc-500 bg-black/20 rounded mx-4 mb-1 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                      {log.detail}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
