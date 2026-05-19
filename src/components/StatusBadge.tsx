import type { ConnectionStatus } from '../types';

interface StatusBadgeProps {
  status: ConnectionStatus;
}

const statusConfig: Record<ConnectionStatus, { color: string; label: string; bgColor: string }> = {
  disconnected: { color: 'bg-zinc-500', label: 'Disconnected', bgColor: 'bg-zinc-500/10' },
  connecting: { color: 'bg-yellow-500', label: 'Connecting...', bgColor: 'bg-yellow-500/10' },
  connected: { color: 'bg-emerald-500', label: 'Connected', bgColor: 'bg-emerald-500/10' },
  error: { color: 'bg-red-500', label: 'Error', bgColor: 'bg-red-500/10' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full ${config.bgColor}`}>
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        {status === 'connecting' && (
          <div className={`absolute inset-0 w-2 h-2 rounded-full ${config.color} pulse-ring`} />
        )}
        {status === 'connected' && (
          <div className={`absolute inset-0 w-2 h-2 rounded-full ${config.color} opacity-50 animate-ping`} />
        )}
      </div>
      <span className="text-xs font-medium text-text-secondary">{config.label}</span>
    </div>
  );
}
