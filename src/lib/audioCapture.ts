const SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4800; // 200ms chunks

export type AudioDataCallback = (pcm16: Int16Array) => void;

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onAudioData: AudioDataCallback | null = null;
  private _isCapturing = false;

  get isCapturing(): boolean {
    return this._isCapturing;
  }

  async start(onAudioData: AudioDataCallback): Promise<void> {
    this.onAudioData = onAudioData;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    // Use ScriptProcessorNode as fallback (AudioWorklet requires served file)
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // Try AudioWorklet first, fall back to ScriptProcessor
    try {
      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.buffer = new Float32Array(${BUFFER_SIZE});
            this.bufferIndex = 0;
          }
          process(inputs) {
            const input = inputs[0];
            if (!input || !input[0]) return true;
            const channel = input[0];
            for (let i = 0; i < channel.length; i++) {
              this.buffer[this.bufferIndex++] = channel[i];
              if (this.bufferIndex >= ${BUFFER_SIZE}) {
                this.port.postMessage({ buffer: this.buffer.slice(0) });
                this.bufferIndex = 0;
              }
            }
            return true;
          }
        }
        registerProcessor('pcm-processor', PCMProcessor);
      `;
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
      this.workletNode.port.onmessage = (event: MessageEvent) => {
        const float32 = event.data.buffer as Float32Array;
        const pcm16 = this.float32ToPcm16(float32);
        this.onAudioData?.(pcm16);
      };
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
    } catch {
      // Fallback to ScriptProcessorNode
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const scriptNode = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
        const float32 = event.inputBuffer.getChannelData(0);
        const pcm16 = this.float32ToPcm16(new Float32Array(float32));
        this.onAudioData?.(pcm16);
      };
      this.sourceNode.connect(scriptNode);
      scriptNode.connect(this.audioContext.destination);
    }

    this._isCapturing = true;
  }

  stop(): void {
    this._isCapturing = false;
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioContext?.close();
    this.audioContext = null;
    this.stream = null;
    this.workletNode = null;
    this.sourceNode = null;
  }

  private float32ToPcm16(float32: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }
}

export function pcm16ToBase64(pcm16: Int16Array): string {
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
