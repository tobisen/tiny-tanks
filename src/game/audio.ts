import type { WeaponId } from "./weapons";
export class AudioManager {
  enabled = true;
  volume = 0.65;
  private context?: AudioContext;
  private noise?: AudioBuffer;
  private bus?: DynamicsCompressorNode;
  private lastAim = 0;
  unlock(): void {
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return;
      }
      this.bus = this.context.createDynamicsCompressor();
      this.bus.threshold.value = -12;
      this.bus.ratio.value = 6;
      this.bus.attack.value = 0.002;
      this.bus.release.value = 0.12;
      this.bus.connect(this.context.destination);
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
    osc.connect(amp).connect(this.bus!);
    osc.start(now);
    osc.stop(now + duration);
  }
  ui(): void {
    this.tone(540, 0.06, "sine", 0.05);
  }
  aim(): void {
    const now = this.context?.currentTime ?? 0;
    if (now - this.lastAim < 0.1) return;
    this.lastAim = now;
    this.tone(760, 0.025, "sine", 0.012);
  }
  select(index: number): void {
    this.tone(330 + index * 66, 0.075, "triangle", 0.065);
  }
  fire(weapon: WeaponId = "standard"): void {
    const profile: Record<WeaponId, [number, number, OscillatorType, number]> =
      {
        standard: [185, 0.15, "triangle", 1.4],
        heavy: [88, 0.28, "triangle", 0.65],
        triple: [250, 0.12, "square", 1.8],
        cluster: [400, 0.2, "sine", 2],
        bunker: [120, 0.22, "sawtooth", 0.9],
        mega: [47, 0.4, "triangle", 0.45],
      };
    const [frequency, duration, wave, pitch] = profile[weapon];
    this.tone(frequency, duration, wave, weapon === "mega" ? 0.3 : 0.18);
    this.boom(weapon === "mega" ? 0.3 : 0.16, duration, pitch);
    if (weapon === "triple")
      for (let i = 1; i <= 2; i++)
        this.tone(250 - i * 25, 0.08, "square", 0.045, i * 0.035);
    if (weapon === "cluster") this.tone(760, 0.13, "sine", 0.04, 0.045);
  }
  split(): void {
    for (let i = 0; i < 4; i++)
      this.tone(900 - i * 110, 0.09, "triangle", 0.045, i * 0.025);
  }
  crate(count = 0): void {
    this.tone(520 + Math.min(count, 5) * 95, 0.12, "square", 0.07);
    this.tone(1040, 0.08, "sine", 0.03, 0.07);
  }
  penetrate(): void {
    this.boom(0.1, 0.22, 2.5);
    this.tone(110, 0.17, "sawtooth", 0.07);
  }
  explosion(weapon: WeaponId, radius: number, crate = false): void {
    const pitches: Record<WeaponId, number> = {
      standard: 1.3,
      heavy: 0.75,
      triple: 1.8,
      cluster: 1.6,
      bunker: 0.55,
      mega: 0.4,
    };
    this.boom(
      Math.min(0.85, radius / 110),
      0.2 + radius / 210,
      crate ? 1.1 : pitches[weapon],
    );
  }
  defeat(): void {
    for (const [i, note] of [330, 277, 220].entries())
      this.tone(note, 0.25, "triangle", 0.1, i * 0.14);
  }
  directHit(): void {
    this.tone(640, 0.09, "triangle", 0.08);
    this.tone(920, 0.06, "sine", 0.05, 0.035);
  }
  duel(): void {
    this.tone(196, 0.18, "triangle", 0.08);
    this.tone(294, 0.22, "triangle", 0.07, 0.15);
  }
  hit(): void {
    this.tone(330, 0.12, "sawtooth", 0.04);
  }
  boom(strength = 0.5, duration = 0.5, pitch = 1): void {
    const ctx = this.context;
    if (!ctx || !this.noise || !this.enabled || !this.volume) return;
    const now = ctx.currentTime,
      source = ctx.createBufferSource(),
      amp = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500 * pitch, now);
    filter.frequency.exponentialRampToValueAtTime(65 * pitch, now + duration);
    amp.gain.setValueAtTime(strength * this.volume, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(amp).connect(this.bus!);
    source.start(now);
    source.stop(now + duration);
    this.tone(65 * pitch, duration, "sine", strength * 0.25);
  }
  victory(): void {
    for (const [i, note] of [392, 494, 587, 784].entries())
      this.tone(note, 0.28, "triangle", 0.14, i * 0.13);
  }
}
