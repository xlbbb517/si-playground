import { useState } from 'react';
import type { AppConfig } from '../types';
import { LANGUAGES, VOICE_LIVE_MODELS } from '../types';

interface ConfigPanelProps {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-zinc-600 focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { code: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
      >
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-zinc-600 focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}

function AdvancedDivider() {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">Advanced Settings</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export function ConfigPanel({ config, onConfigChange, isCollapsed, onToggleCollapse }: ConfigPanelProps) {
  const [activeSection, setActiveSection] = useState<string>('shared');
  const [syncNotice, setSyncNotice] = useState(false);

  const update = (key: keyof AppConfig, value: string | number) => {
    onConfigChange({ ...config, [key]: value });
  };

  const syncToAll = () => {
    const endpoint = config.sharedEndpoint;
    const apiKey = config.sharedApiKey;
    // Voice Live uses cognitiveservices.azure.com
    // Realtime uses openai.azure.com (same resource, different domain)
    // Both domains work for the same resource, so we populate both
    onConfigChange({
      ...config,
      voiceLiveEndpoint: endpoint,
      voiceLiveApiKey: apiKey,
      realtimeEndpoint: endpoint,
      realtimeApiKey: apiKey,
      translateEndpoint: endpoint,
      translateApiKey: apiKey,
    });
    setSyncNotice(true);
    setTimeout(() => setSyncNotice(false), 2000);
  };

  if (isCollapsed) {
    return (
      <div className="w-12 bg-card border-r border-border flex flex-col items-center pt-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-border transition-colors text-text-secondary hover:text-text-primary"
          title="Expand config panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    );
  }

  const sections = [
    { id: 'shared', label: '🔗 Shared' },
    { id: 'voiceLive', label: 'Voice Live' },
    { id: 'realtimeV2', label: 'RT-2' },
    { id: 'translate', label: 'Translate' },
    { id: 'common', label: 'Common' },
  ];

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Configuration</h2>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-border transition-colors text-text-secondary hover:text-text-primary"
          title="Collapse"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex-1 px-1.5 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors whitespace-nowrap ${
              activeSection === section.id
                ? 'text-text-primary border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeSection === 'shared' && (
          <>
            <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
              <p className="text-[11px] text-accent leading-relaxed">
                Configure once here, then click <strong>Sync to All</strong> to populate all three channels.
                You can still override per-channel in their individual tabs.
              </p>
            </div>
            <Input
              label="Endpoint"
              value={config.sharedEndpoint}
              onChange={(v) => update('sharedEndpoint', v)}
              placeholder="https://your-resource.cognitiveservices.azure.com"
            />
            <Input
              label="API Key"
              value={config.sharedApiKey}
              onChange={(v) => update('sharedApiKey', v)}
              type="password"
              placeholder="••••••••"
            />
            <button
              onClick={syncToAll}
              className="w-full py-2.5 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 8C2 4.686 4.686 2 8 2c2.21 0 4.16 1.2 5.2 3M14 8c0 3.314-2.686 6-6 6-2.21 0-4.16-1.2-5.2-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M13 2v3h-3M3 14v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Sync to All Channels
            </button>
            {syncNotice && (
              <p className="text-[11px] text-green-400 text-center animate-pulse">
                ✓ Synced to all three channels
              </p>
            )}
          </>
        )}

        {activeSection === 'voiceLive' && (
          <>
            <Input
              label="Endpoint"
              value={config.voiceLiveEndpoint}
              onChange={(v) => update('voiceLiveEndpoint', v)}
              placeholder="https://resource.cognitiveservices.azure.com"
            />
            <Input
              label="API Key"
              value={config.voiceLiveApiKey}
              onChange={(v) => update('voiceLiveApiKey', v)}
              type="password"
              placeholder="••••••••"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Model
                </label>
                <a
                  href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-zinc-700 text-[9px] text-zinc-400 hover:bg-accent hover:text-white transition-colors"
                  title="Voice Live API documentation – supported models & pricing tiers"
                >
                  i
                </a>
              </div>
              <select
                value={config.voiceLiveModel}
                onChange={(e) => update('voiceLiveModel', e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
              >
                {(['Pro', 'Basic', 'Lite'] as const).map((tier) => (
                  <optgroup key={tier} label={`── ${tier} tier ──`}>
                    {VOICE_LIVE_MODELS.filter((m) => m.tier === tier).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600">
                Pro = native audio I/O, Basic/Lite = Azure Speech STT + TTS
              </p>
            </div>
            <AdvancedDivider />
            <Input
              label="Voice Name"
              value={config.voiceLiveVoiceName}
              onChange={(v) => update('voiceLiveVoiceName', v)}
              placeholder="en-US-Aria:DragonHDFlashLatestNeural"
            />
            <Input
              label="ASR Language (empty = use Source Language)"
              value={config.voiceLiveAsrLanguage}
              onChange={(v) => update('voiceLiveAsrLanguage', v)}
              placeholder="e.g. zh-CN, en-US"
            />
            <Select
              label="Turn Detection Type"
              value={config.voiceLiveTurnDetection}
              onChange={(v) => update('voiceLiveTurnDetection', v)}
              options={[
                { code: 'azure_semantic_vad', label: 'Azure Semantic VAD' },
                { code: 'server_vad', label: 'Server VAD' },
              ]}
            />
            <NumberInput
              label="Silence Duration (ms)"
              value={config.voiceLiveSilenceDuration}
              onChange={(v) => update('voiceLiveSilenceDuration', v)}
              min={0}
              step={50}
            />
            <NumberInput
              label="Speech Duration (ms)"
              value={config.voiceLiveSpeechDuration}
              onChange={(v) => update('voiceLiveSpeechDuration', v)}
              min={0}
              step={10}
            />
          </>
        )}

        {activeSection === 'realtimeV2' && (
          <>
            <Input
              label="Endpoint"
              value={config.realtimeEndpoint}
              onChange={(v) => update('realtimeEndpoint', v)}
              placeholder="https://resource.openai.azure.com"
            />
            <Input
              label="API Key"
              value={config.realtimeApiKey}
              onChange={(v) => update('realtimeApiKey', v)}
              type="password"
              placeholder="••••••••"
            />
            <Input
              label="Deployment Name"
              value={config.realtimeDeployment}
              onChange={(v) => update('realtimeDeployment', v)}
              placeholder="gpt-realtime-2"
            />
            <AdvancedDivider />
            <Select
              label="Reasoning Effort"
              value={config.realtimeReasoningEffort}
              onChange={(v) => update('realtimeReasoningEffort', v)}
              options={[
                { code: 'none', label: 'None (disabled)' },
                { code: 'low', label: 'Low' },
                { code: 'medium', label: 'Medium' },
                { code: 'high', label: 'High' },
              ]}
            />
            <NumberInput
              label="Temperature (0-2)"
              value={config.realtimeTemperature}
              onChange={(v) => update('realtimeTemperature', v)}
              min={0}
              max={2}
              step={0.1}
            />
            <Input
              label="Max Output Tokens"
              value={config.realtimeMaxTokens}
              onChange={(v) => update('realtimeMaxTokens', v)}
              placeholder="inf"
            />
            <Select
              label="Turn Detection"
              value={config.realtimeTurnDetection}
              onChange={(v) => update('realtimeTurnDetection', v)}
              options={[
                { code: 'server_vad', label: 'Server VAD' },
                { code: 'none', label: 'None (manual commit)' },
              ]}
            />
            <NumberInput
              label="VAD Silence Duration (ms)"
              value={config.realtimeVadSilence}
              onChange={(v) => update('realtimeVadSilence', v)}
              min={0}
              step={50}
            />
          </>
        )}

        {activeSection === 'translate' && (
          <>
            <Input
              label="Endpoint"
              value={config.translateEndpoint}
              onChange={(v) => update('translateEndpoint', v)}
              placeholder="https://resource.openai.azure.com"
            />
            <Input
              label="API Key"
              value={config.translateApiKey}
              onChange={(v) => update('translateApiKey', v)}
              type="password"
              placeholder="••••••••"
            />
            <Input
              label="Deployment Name"
              value={config.translateDeployment}
              onChange={(v) => update('translateDeployment', v)}
              placeholder="gpt-realtime-translate"
            />
            <AdvancedDivider />
            <Select
              label="Translation Delay"
              value={config.translateDelay}
              onChange={(v) => update('translateDelay', v)}
              options={[
                { code: '0', label: '0 (no delay)' },
                { code: '2', label: '2' },
                { code: '4', label: '4' },
              ]}
            />
            <Select
              label="Noise Reduction"
              value={config.translateNoiseReduction}
              onChange={(v) => update('translateNoiseReduction', v)}
              options={[
                { code: 'off', label: 'Off' },
                { code: 'near_field', label: 'Near Field' },
                { code: 'far_field', label: 'Far Field' },
              ]}
            />
          </>
        )}

        {activeSection === 'common' && (
          <>
            <Select
              label="Source Language"
              value={config.sourceLanguage}
              onChange={(v) => update('sourceLanguage', v)}
              options={LANGUAGES}
            />
            <Select
              label="Target Language"
              value={config.targetLanguage}
              onChange={(v) => update('targetLanguage', v)}
              options={LANGUAGES}
            />
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                System Prompt (Voice Live & Realtime V2)
              </label>
              <textarea
                value={config.systemPrompt}
                onChange={(e) => update('systemPrompt', e.target.value)}
                rows={6}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-zinc-600 focus:outline-none focus:border-accent transition-colors resize-none"
                placeholder="You are a simultaneous interpreter..."
              />
            </div>
          </>
        )}
      </div>

      {/* Save indicator */}
      <div className="px-4 py-2 border-t border-border">
        <p className="text-[10px] text-zinc-600 text-center">
          Config auto-saved to localStorage
        </p>
      </div>
    </div>
  );
}
