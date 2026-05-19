interface AudioVisualizerProps {
  isSpeaking: boolean;
  isActive: boolean;
}

export function AudioVisualizer({ isSpeaking, isActive }: AudioVisualizerProps) {
  if (!isActive) return null;

  return (
    <div className="flex items-center justify-center gap-0.5 h-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-150 ${
            isSpeaking
              ? 'bg-emerald-400 speaking-wave'
              : 'bg-zinc-600 h-1'
          }`}
          style={{
            height: isSpeaking ? `${12 + Math.random() * 12}px` : '4px',
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}
