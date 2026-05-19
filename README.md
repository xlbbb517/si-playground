# Azure Simultaneous Interpretation Playground

Three-way comparison tool for Azure SI solutions:

| Channel | Model | Approach |
|---------|-------|----------|
| **Voice Live API** | gpt-4.1-mini / gpt-realtime / etc. | Three-stage: Azure STT → LLM → Azure TTS |
| **GPT-Realtime-2** | gpt-realtime-2 | Instruction-based translation (text mode) |
| **GPT-Realtime-Translate** | gpt-realtime-translate | Dedicated translation model (audio+text out) |

## Live Demo
https://xlbbb517.github.io/si-playground/

## Quick Start
1. Open the page → **Shared** tab
2. Enter your Azure endpoint + API key → **Sync to All**
3. Set source/target language in **Common** tab
4. Click **Start All** — speak and compare!

## Voice Live Supported Models
| Tier | Models |
|------|--------|
| Pro | gpt-realtime, gpt-4o, gpt-4.1, gpt-5, gpt-5-chat |
| Basic | gpt-realtime-mini, gpt-4o-mini, gpt-4.1-mini, gpt-5-mini |
| Lite | gpt-5-nano, phi4-mm-realtime, phi4-mini |

[Docs: Voice Live API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live)

## Dev
```bash
npm install && npm run dev
```
