import { WaterCycleStageId } from '../data/waterCycleData';

interface StageMix {
  windGain: number;
  windFreq: number;
  windQ: number;
  windLfoRate: number;
  windLfoDepth: number;
  rainGain: number;
  rainFreq: number;
  waterGain: number;
  waterFreq: number;
  birdChance: number;
  dropletChance: number;
  thunderChance: number;
}

const STAGE_AMBIENT_MIX: Record<WaterCycleStageId, StageMix> = {
  overview: {
    windGain: 0.055,
    windFreq: 360,
    windQ: 0.7,
    windLfoRate: 0.16,
    windLfoDepth: 110,
    rainGain: 0.012,
    rainFreq: 1650,
    waterGain: 0.055,
    waterFreq: 760,
    birdChance: 0.32,
    dropletChance: 0.2,
    thunderChance: 0,
  },
  evaporasi: {
    // Rhythmic sunlit ocean waves & warm coastal breeze
    windGain: 0.115,
    windFreq: 280,
    windQ: 0.55,
    windLfoRate: 0.13,
    windLfoDepth: 150,
    rainGain: 0.015,
    rainFreq: 2100,
    waterGain: 0.035,
    waterFreq: 520,
    birdChance: 0.12,
    dropletChance: 0,
    thunderChance: 0,
  },
  transpirasi: {
    // Lush forest rustle & lively tropical birdsong
    windGain: 0.068,
    windFreq: 520,
    windQ: 0.9,
    windLfoRate: 0.22,
    windLfoDepth: 140,
    rainGain: 0.008,
    rainFreq: 1900,
    waterGain: 0.03,
    waterFreq: 700,
    birdChance: 0.78,
    dropletChance: 0.08,
    thunderChance: 0,
  },
  kondensasi: {
    // Airy, sweeping high-altitude cloud wind
    windGain: 0.105,
    windFreq: 680,
    windQ: 1.85,
    windLfoRate: 0.18,
    windLfoDepth: 230,
    rainGain: 0.022,
    rainFreq: 2350,
    waterGain: 0.008,
    waterFreq: 600,
    birdChance: 0,
    dropletChance: 0,
    thunderChance: 0,
  },
  presipitasi: {
    // Full steady mountain rain shower & soft distant thunder
    windGain: 0.075,
    windFreq: 310,
    windQ: 0.6,
    windLfoRate: 0.25,
    windLfoDepth: 95,
    rainGain: 0.165,
    rainFreq: 1750,
    waterGain: 0.06,
    waterFreq: 950,
    birdChance: 0,
    dropletChance: 0.35,
    thunderChance: 0.28,
  },
  infiltrasi: {
    // Clear babbling river brook & subterranean groundwater droplets
    windGain: 0.025,
    windFreq: 260,
    windQ: 0.7,
    windLfoRate: 0.14,
    windLfoDepth: 60,
    rainGain: 0.01,
    rainFreq: 1600,
    waterGain: 0.145,
    waterFreq: 860,
    birdChance: 0.15,
    dropletChance: 0.82,
    thunderChance: 0,
  },
};

export const STAGE_AMBIENT_LABELS: Record<WaterCycleStageId, string> = {
  overview: 'Ombak, Sungai & Burung',
  evaporasi: 'Debur Ombak & Angin Pantai',
  transpirasi: 'Angin Hutan & Kicauan Burung',
  kondensasi: 'Hembusan Angin Awan',
  presipitasi: 'Derai Hujan & Guntur Halus',
  infiltrasi: 'Gemericik Sungai & Tetes Air Tanah',
};

/**
 * 100% Procedural Web Audio API Nature Soundscape Engine (zero external .mp3 downloads).
 * Synthesizes stage-adaptive wind, ocean surf, rain, babbling brook, forest birdsong,
 * water droplets, and soft distant thunder — with automatic ducking during voice narration
 * and background-tab auto-suspend for low battery/CPU usage on HP & PID.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private ducked = false;
  private initialized = false;
  private activeStage: WaterCycleStageId = 'overview';

  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windLfo: OscillatorNode | null = null;
  private windLfoGain: GainNode | null = null;

  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;

  private waterGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private waterLfo: OscillatorNode | null = null;

  private noiseSources: AudioBufferSourceNode[] = [];
  private pinkBuffer: AudioBuffer | null = null;
  private accentTimerId: number | null = null;

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onVisibilityChange = (): void => {
    if (!this.ctx) return;
    if (document.hidden) {
      if (this.ctx.state === 'running') {
        void this.ctx.suspend();
      }
    } else if (this.enabled && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  };

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (next) {
      this.unlockAndStart();
      this.applyStageMix(this.activeStage);
    } else {
      this.stopAccentLoop();
      this.updateMasterGain();
    }
  }

  public setDucked(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.updateMasterGain();
  }

  /**
   * Call on any user gesture (touch/click) so Web Audio unlocks cleanly on mobile browsers.
   */
  public unlockAndStart(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.initialized) {
      this.buildGraph();
      this.applyStageMix(this.activeStage);
    }
    this.updateMasterGain();
    this.startAccentLoop();
  }

  public setStage(stageId: WaterCycleStageId): void {
    this.activeStage = stageId;
    if (!this.enabled) return;
    this.unlockAndStart();
    this.applyStageMix(stageId);
  }

  private createNoiseBuffer(ctx: AudioContext, type: 'pink' | 'white'): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.45;
      }
      return buffer;
    }

    // Smooth pink/brown hybrid noise for natural ocean, wind, and brook textures
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      b3 = 0.85 * b3 + white * 0.06;
      data[i] = (b0 + b1 + b2 + b3 + white * 0.012) * 0.65;
    }
    return buffer;
  }

  private buildGraph(): void {
    if (!this.ctx || this.initialized) return;
    const ctx = this.ctx;
    this.initialized = true;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this.masterGain = master;

    this.pinkBuffer = this.createNoiseBuffer(ctx, 'pink');
    const whiteBuffer = this.createNoiseBuffer(ctx, 'white');

    // 1. Wind / Ocean Surf Layer (modulated bandpass over pink noise)
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.pinkBuffer;
    windSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 360;
    windFilter.Q.value = 0.7;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.0001;

    const windLfo = ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.16;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 110;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);
    windLfo.start();

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();

    this.windFilter = windFilter;
    this.windGain = windGain;
    this.windLfo = windLfo;
    this.windLfoGain = windLfoGain;
    this.noiseSources.push(windSrc);

    // 2. Rain Shower Layer (bandpass + soft high-shelf on white noise)
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = whiteBuffer;
    rainSrc.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1750;
    rainFilter.Q.value = 0.55;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.0001;

    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();

    this.rainFilter = rainFilter;
    this.rainGain = rainGain;
    this.noiseSources.push(rainSrc);

    // 3. Babbling Brook / Flowing River Layer (gently modulated pink noise)
    const waterSrc = ctx.createBufferSource();
    waterSrc.buffer = this.pinkBuffer;
    waterSrc.loop = true;
    waterSrc.playbackRate.value = 1.18;

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 780;
    waterFilter.Q.value = 1.35;

    const waterGain = ctx.createGain();
    waterGain.gain.value = 0.0001;

    const waterLfo = ctx.createOscillator();
    waterLfo.type = 'sine';
    waterLfo.frequency.value = 1.85;
    const waterLfoGain = ctx.createGain();
    waterLfoGain.gain.value = 165;
    waterLfo.connect(waterLfoGain);
    waterLfoGain.connect(waterFilter.frequency);
    waterLfo.start();

    waterSrc.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(master);
    waterSrc.start();

    this.waterFilter = waterFilter;
    this.waterGain = waterGain;
    this.waterLfo = waterLfo;
    this.noiseSources.push(waterSrc);
  }

  private updateMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target = !this.enabled ? 0.0001 : this.ducked ? 0.28 : 0.85;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(target, now, 0.35);
  }

  private applyStageMix(stageId: WaterCycleStageId): void {
    if (!this.ctx || !this.initialized) return;
    const mix = STAGE_AMBIENT_MIX[stageId];
    const now = this.ctx.currentTime;

    if (this.windGain && this.windFilter && this.windLfo && this.windLfoGain) {
      this.windGain.gain.cancelScheduledValues(now);
      this.windGain.gain.setTargetAtTime(mix.windGain, now, 0.55);
      this.windFilter.frequency.cancelScheduledValues(now);
      this.windFilter.frequency.setTargetAtTime(mix.windFreq, now, 0.55);
      this.windFilter.Q.setTargetAtTime(mix.windQ, now, 0.55);
      this.windLfo.frequency.setTargetAtTime(mix.windLfoRate, now, 0.55);
      this.windLfoGain.gain.setTargetAtTime(mix.windLfoDepth, now, 0.55);
    }

    if (this.rainGain && this.rainFilter) {
      this.rainGain.gain.cancelScheduledValues(now);
      this.rainGain.gain.setTargetAtTime(mix.rainGain, now, 0.55);
      this.rainFilter.frequency.setTargetAtTime(mix.rainFreq, now, 0.55);
    }

    if (this.waterGain && this.waterFilter) {
      this.waterGain.gain.cancelScheduledValues(now);
      this.waterGain.gain.setTargetAtTime(mix.waterGain, now, 0.55);
      this.waterFilter.frequency.setTargetAtTime(mix.waterFreq, now, 0.55);
    }
  }

  private startAccentLoop(): void {
    if (this.accentTimerId !== null) return;
    const scheduleNext = () => {
      if (!this.enabled) {
        this.accentTimerId = null;
        return;
      }
      const delayMs = 1500 + Math.random() * 2100;
      this.accentTimerId = window.setTimeout(() => {
        this.triggerStageOrganicAccent();
        scheduleNext();
      }, delayMs);
    };
    scheduleNext();
  }

  private stopAccentLoop(): void {
    if (this.accentTimerId !== null) {
      window.clearTimeout(this.accentTimerId);
      this.accentTimerId = null;
    }
  }

  private triggerStageOrganicAccent(): void {
    if (!this.enabled || !this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const mix = STAGE_AMBIENT_MIX[this.activeStage];

    if (mix.birdChance > 0 && Math.random() < mix.birdChance) {
      this.playBirdChirp();
    }
    if (mix.dropletChance > 0 && Math.random() < mix.dropletChance) {
      this.playWaterDroplet();
    }
    if (mix.thunderChance > 0 && Math.random() < mix.thunderChance) {
      this.playSoftThunder();
    }
  }

  /**
   * Synthesizes a delicate, naturalistic tropical songbird chirp (2-3 gentle frequency-swept notes).
   */
  private playBirdChirp(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = Math.random() < 0.5 ? 2 : 3;
    const baseFreq = 2400 + Math.random() * 1100;

    for (let i = 0; i < notes; i++) {
      const start = now + i * (0.11 + Math.random() * 0.045);
      const dur = 0.085 + Math.random() * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';

      const f0 = baseFreq * (0.92 + Math.random() * 0.2);
      const fPeak = f0 * (1.16 + Math.random() * 0.18);
      const fEnd = f0 * (0.96 + Math.random() * 0.12);

      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(fPeak, start + dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(fEnd, start + dur);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.022, start + dur * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
  }

  /**
   * Synthesizes a crisp resonant water droplet plink (typical of babbling streams & groundwater).
   */
  private playWaterDroplet(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const startFreq = 540 + Math.random() * 420;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.95, now + 0.065);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.032, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  /**
   * Synthesizes a very gentle, distant low-frequency thunder rumble during Presipitasi.
   */
  private playSoftThunder(): void {
    if (!this.ctx || !this.masterGain || !this.pinkBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.pinkBuffer;
    src.playbackRate.value = 0.55;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(115, now);
    filter.frequency.exponentialRampToValueAtTime(52, now + 2.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 2.5);
  }

  public dispose(): void {
    this.stopAccentLoop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    try {
      this.windLfo?.stop();
      this.waterLfo?.stop();
      this.noiseSources.forEach((s) => s.stop());
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors on already closed AudioContext
    }
    this.noiseSources = [];
    this.ctx = null;
    this.initialized = false;
  }
}
