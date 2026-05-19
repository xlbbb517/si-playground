const SAMPLE_RATE = 24000;

export class PCMPlayer {
  private audioContext: AudioContext;
  private queue: Float32Array[] = [];
  private isPlaying = false;
  private nextStartTime = 0;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  }

  enqueue(pcm16Base64: string): void {
    const binaryStr = atob(pcm16Base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }
    this.queue.push(float32);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const samples = this.queue.shift()!;
    const buffer = this.audioContext.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    const startTime = Math.max(currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    source.onended = () => {
      this.playNext();
    };
  }

  flush(): void {
    this.queue = [];
    this.nextStartTime = 0;
    this.isPlaying = false;
  }

  async resume(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  close(): void {
    this.flush();
    void this.audioContext.close();
  }
}
