# Azure Simultaneous Interpretation Playground

A three-way comparison tool for Azure simultaneous interpretation solutions:

| Channel | Model | Approach |
|---------|-------|----------|
| **Voice Live API** | gpt-4.1-mini / gpt-realtime / etc. | Three-stage: Azure STT → LLM → Azure TTS |
| **GPT-Realtime-2** | gpt-realtime-2 | End-to-end: instruction-based translation (text mode) |
| **GPT-Realtime-Translate** | gpt-realtime-translate | Dedicated translation model (audio in → audio + text out) |

## Features

- 🎤 Real-time microphone capture (PCM16, 24kHz)
- ⚡ Per-turn latency measurement (speech_stopped → first_delta)
- 📊 Live latency comparison chart
- 🔊 Audio playback for translated speech
- 💾 Export results as JSON
- 🔗 Shared config with sync-to-all button
- 🌙 Dark theme (Vercel/Linear style)

## Usage

1. Open the page
2. In the **Shared** config tab, enter your Azure endpoint and API key
3. Click **Sync to All Channels**
4. Adjust models/deployments in per-channel tabs if needed
5. Set source/target language in Common tab
6. Click **Start** on each channel card
7. Start speaking!

## Deployment

Live at: https://xlbbb517.github.io/si-playground/

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tech Stack

- Vite + React + TypeScript + TailwindCSS
- Native WebSocket (no SDK dependencies for runtime)
- AudioWorklet for mic capture
