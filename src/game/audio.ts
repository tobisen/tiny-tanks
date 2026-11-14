export class AudioManager {
  enabled = true;
  volume = 0.65;
  private context?: AudioContext;
  private noise?: AudioBuffer;
  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.noise = this.context.createBuffer(
        1,
        this.context.sampleRate,
        this.context.sampleRate,
      );
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.context.resume().catch(() => {});
  }
  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType = "square",
    gain = 0.08,
    delay = 0,
  ): void {
    const ctx = this.context;
    if (!ctx || !this.enabled || !this.volume) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator(),
      amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, frequency * 0.5),
      now + duration,
    );
    amp.gain.setValueAtTime(gain * this.volume, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
  ui(): void {
    this.tone(540, 0.06, "sine", 0.05);
  }
  fire(heavy = false): void {
    this.tone(heavy ? 100 : 180, 0.2, "triangle", 0.24);
    this.boom(heavy ? 0.25 : 0.12, 0.12);
  }
  hit(): void {
    this.tone(330, 0.12, "sawtooth", 0.04);
  }
  boom(strength = 0.5, duration = 0.5): void {
    const ctx = this.context;
    if (!ctx || !this.noise || !this.enabled || !this.volume) return;
    const now = ctx.currentTime,
      source = ctx.createBufferSource(),
      amp = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + duration);
    amp.gain.setValueAtTime(strength * this.volume, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start(now);
    source.stop(now + duration);
    this.tone(65, duration, "sine", strength * 0.25);
  }
  victory(): void {
    for (const [i, note] of [392, 494, 587, 784].entries())
      this.tone(note, 0.28, "triangle", 0.14, i * 0.13);
  }
}
