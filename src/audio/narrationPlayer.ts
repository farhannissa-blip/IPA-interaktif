import { WATER_CYCLE_STAGES, WaterCycleStageId } from '../data/waterCycleData';

export type NarrationPart = 'main' | 'extra';

export interface NarrationState {
  isPlaying: boolean;
  stageId: WaterCycleStageId | null;
  part: NarrationPart | null;
}

/**
 * Lightweight single-element audio narration player optimized for mobile phones (HP)
 * and Interactive Flat Panels (PID). Loads audio lazily on demand (preload="none")
 * so all 12 MP3 files never occupy RAM simultaneously.
 */
export class NarrationPlayer {
  private audio: HTMLAudioElement;
  private enabled = true;
  private currentStage: WaterCycleStageId | null = null;
  private currentPart: NarrationPart | null = null;
  private onEndedCallback: (() => void) | null = null;
  private onStateChange: (state: NarrationState) => void;

  constructor(onStateChange: (state: NarrationState) => void) {
    this.onStateChange = onStateChange;
    this.audio = new Audio();
    this.audio.preload = 'none';

    this.audio.addEventListener('play', this.emitState);
    this.audio.addEventListener('pause', this.emitState);
    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('error', this.handleError);
  }

  private emitState = (): void => {
    this.onStateChange({
      isPlaying: !this.audio.paused && !this.audio.ended,
      stageId: this.currentStage,
      part: this.currentPart,
    });
  };

  private handleEnded = (): void => {
    const cb = this.onEndedCallback;
    this.onEndedCallback = null;
    this.emitState();
    cb?.();
  };

  private handleError = (): void => {
    this.onEndedCallback = null;
    this.emitState();
  };

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      this.stop();
    }
  }

  public play(
    stageId: WaterCycleStageId,
    part: NarrationPart = 'main',
    onEnded?: () => void
  ): void {
    if (!this.enabled) {
      this.stop();
      return;
    }

    const stage = WATER_CYCLE_STAGES[stageId];
    const url = part === 'extra' ? stage.narrationExtraUrl : stage.narrationMainUrl;

    this.onEndedCallback = onEnded ?? null;
    this.currentStage = stageId;
    this.currentPart = part;

    this.audio.pause();
    this.audio.src = url;
    this.audio.currentTime = 0;

    const playPromise = this.audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Ignore browser autoplay block prior to first user interaction
        this.emitState();
      });
    }
  }

  public toggle(stageId: WaterCycleStageId, part: NarrationPart = 'main'): void {
    const isSameClip =
      this.currentStage === stageId && this.currentPart === part;

    if (isSameClip && !this.audio.paused && !this.audio.ended) {
      this.audio.pause();
      this.onEndedCallback = null;
      this.emitState();
      return;
    }

    // Re-enable narration if user explicitly taps Play on a clip
    this.enabled = true;
    this.play(stageId, part);
  }

  public stop(): void {
    this.onEndedCallback = null;
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      // Ignore if audio metadata not yet loaded
    }
    this.emitState();
  }

  public dispose(): void {
    this.onEndedCallback = null;
    this.audio.pause();
    this.audio.removeEventListener('play', this.emitState);
    this.audio.removeEventListener('pause', this.emitState);
    this.audio.removeEventListener('ended', this.handleEnded);
    this.audio.removeEventListener('error', this.handleError);
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
