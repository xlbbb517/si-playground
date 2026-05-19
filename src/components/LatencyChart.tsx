import type { LatencyRecord } from '../types';

interface LatencyChartProps {
  records: LatencyRecord[];
}

export function LatencyChart({ records }: LatencyChartProps) {
  const lastRecords = records.slice(-10);

  if (lastRecords.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Latency Comparison</h3>
        <p className="text-xs text-zinc-600 text-center py-6">No latency data yet. Start a session to see metrics.</p>
      </div>
    );
  }

  const maxLatency = Math.max(
    ...lastRecords.flatMap((r) => [r.voiceLive, r.realtimeV2, r.realtimeTranslate].filter((v): v is number => v !== null))
  );

  const channels = [
    { key: 'voiceLive' as const, label: 'Voice Live', color: 'bg-purple-500' },
    { key: 'realtimeV2' as const, label: 'Realtime V2', color: 'bg-blue-500' },
    { key: 'realtimeTranslate' as const, label: 'Translate', color: 'bg-emerald-500' },
  ];

  const averages = channels.map((ch) => {
    const values = lastRecords.map((r) => r[ch.key]).filter((v): v is number => v !== null);
    return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Latency Comparison</h3>
        <div className="flex items-center gap-3">
          {channels.map((ch) => (
            <div key={ch.key} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${ch.color}`} />
              <span className="text-[10px] text-text-secondary">{ch.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Average latency display */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {channels.map((ch, i) => (
          <div key={ch.key} className="text-center">
            <div className="text-lg font-bold text-text-primary">
              {averages[i] !== null ? `${averages[i]}ms` : '—'}
            </div>
            <div className="text-[10px] text-text-secondary uppercase tracking-wider">
              Avg {ch.label}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="space-y-2">
        {lastRecords.map((record, idx) => (
          <div key={record.turnId} className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600 w-4 text-right">{idx + 1}</span>
            <div className="flex-1 flex gap-1">
              {channels.map((ch) => {
                const value = record[ch.key];
                if (value === null) return (
                  <div key={ch.key} className="flex-1 h-3 bg-zinc-800 rounded-sm" />
                );
                const width = Math.max(5, (value / maxLatency) * 100);
                return (
                  <div key={ch.key} className="flex-1 h-3 bg-zinc-800 rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${ch.color} rounded-sm transition-all duration-300`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
