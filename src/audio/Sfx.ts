type SfxCue = 'arcane-nova' | 'boss-slam' | 'chest' | 'hit-magic' | 'hit-physical' | 'miss' | 'pickup' | 'potion' | 'ui';

type AudioContextConstructor = typeof AudioContext;

const SFX_MUTED_KEY = 'aranna:sfx-muted:v1';

export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = this.readMuted();
  private lastHitAt = 0;

  constructor() {
    window.addEventListener('pointerdown', this.unlock, { passive: true });
    window.addEventListener('keydown', this.unlock);
  }

  readonly unlock = (): void => {
    if (this.muted) return;
    const context = this.ensureContext();
    if (!context || context.state !== 'suspended') return;
    void context.resume().catch(() => undefined);
  };

  toggleMuted(): boolean {
    this.muted = !this.muted;
    this.persistMuted();
    if (!this.muted) {
      this.unlock();
      this.play('ui');
    }
    return this.muted;
  }

  play(cue: SfxCue): void {
    if (this.muted) return;
    const context = this.ensureContext();
    const master = this.master;
    if (!context || !master) return;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);

    const now = context.currentTime;
    switch (cue) {
      case 'pickup':
        this.tone(720, now, 0.08, 'sine', 0.06);
        this.tone(980, now + 0.045, 0.09, 'sine', 0.055);
        this.tone(1320, now + 0.09, 0.08, 'triangle', 0.04);
        break;
      case 'chest':
        this.noise(now, 0.18, 0.09, 1300);
        this.tone(120, now, 0.13, 'square', 0.035);
        this.tone(185, now + 0.08, 0.17, 'triangle', 0.045);
        break;
      case 'potion':
        this.tone(420, now, 0.08, 'triangle', 0.045);
        this.tone(560, now + 0.055, 0.1, 'sine', 0.045);
        this.tone(720, now + 0.12, 0.1, 'sine', 0.035);
        break;
      case 'arcane-nova':
        this.sweep(210, 82, now, 0.34, 'sawtooth', 0.055);
        this.tone(880, now + 0.04, 0.16, 'triangle', 0.045);
        this.noise(now + 0.02, 0.2, 0.045, 4200);
        break;
      case 'boss-slam':
        this.sweep(92, 38, now, 0.26, 'sawtooth', 0.075);
        this.noise(now, 0.2, 0.09, 520);
        this.tone(54, now + 0.04, 0.24, 'square', 0.035);
        break;
      case 'hit-magic':
        this.playHit(now, 360, 0.055, 2400);
        break;
      case 'hit-physical':
        this.playHit(now, 118, 0.07, 900);
        break;
      case 'miss':
        this.noise(now, 0.08, 0.035, 2200);
        this.tone(260, now, 0.08, 'sine', 0.025);
        break;
      case 'ui':
        this.tone(540, now, 0.06, 'sine', 0.035);
        this.tone(740, now + 0.045, 0.07, 'sine', 0.03);
        break;
    }
  }

  private playHit(now: number, toneFrequency: number, gain: number, noiseFilter: number): void {
    if (now - this.lastHitAt < 0.08) return;
    this.lastHitAt = now;
    this.noise(now, 0.07, gain, noiseFilter);
    this.tone(toneFrequency, now, 0.08, 'triangle', gain * 0.7);
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    peakGain: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private sweep(
    from: number,
    to: number,
    start: number,
    duration: number,
    type: OscillatorType,
    peakGain: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }

  private noise(start: number, duration: number, peakGain: number, filterFrequency: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const decay = 1 - i / sampleCount;
      data[i] = (Math.random() * 2 - 1) * decay;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;

    const audioWindow = window as Window & {
      webkitAudioContext?: AudioContextConstructor;
    };
    const AudioCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioCtor) return null;

    const context = new AudioCtor();
    const master = context.createGain();
    master.gain.value = 0.18;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    return context;
  }

  private readMuted(): boolean {
    try {
      return window.localStorage.getItem(SFX_MUTED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private persistMuted(): void {
    try {
      window.localStorage.setItem(SFX_MUTED_KEY, this.muted ? '1' : '0');
    } catch {
      // Audio continua funcionando mesmo sem persistencia de preferencia.
    }
  }
}
