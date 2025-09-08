export interface CrossfadeTrack {
  id: number;
  filePath: string;
  duration: number;
}

export interface CrossfadeOptions {
  crossfadeDuration: number;
  volume: number;
  onTrackEnd: () => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onError: (error: Error) => void;
  onCrossfadeStart?: (nextTrack: CrossfadeTrack) => void;
  onCrossfadeComplete?: () => void;
}

export class CrossfadeController {
  private voice1: {
    audio: HTMLAudioElement | null;
    isActive: boolean;
    isPlaying: boolean;
  } = {
    audio: null,
    isActive: true,
    isPlaying: false,
  };

  private voice2: {
    audio: HTMLAudioElement | null;
    isActive: boolean;
    isPlaying: boolean;
  } = {
    audio: null,
    isActive: false,
    isPlaying: false,
  };

  private crossfadeDuration: number = 5;
  private volume: number = 1;
  private isMuted: boolean = false;
  private isDestroyed: boolean = false;

  private timeUpdateInterval: NodeJS.Timeout | null = null;
  private crossfadeInProgress: boolean = false;
  private crossfadeStartTime: number | null = null;
  private crossfadePhase: "none" | "active" | "handoff" = "none";

  private onTrackEnd?: () => void;
  private onTimeUpdate?: (currentTime: number, duration: number) => void;
  private onError?: (error: Error) => void;
  private onCrossfadeStart?: (nextTrack: CrossfadeTrack) => void;
  private onCrossfadeComplete?: () => void;

  constructor() {}

  private handleError(error: Error): void {
    console.error("CrossfadeController error:", error);
    this.crossfadeInProgress = false;
    this.crossfadePhase = "none";

    if (this.onError) {
      this.onError(error);
    }
  }

  private createAudioElement(filePath: string): HTMLAudioElement {
    const audio = new Audio();
    const audioUrl = `wora://${encodeURIComponent(filePath)}`;
    audio.src = audioUrl;
    audio.preload = "auto";
    audio.volume = this.isMuted ? 0 : this.volume;

    return audio;
  }

  private getActiveVoice() {
    return this.voice1.isActive ? this.voice1 : this.voice2;
  }

  private getInactiveVoice() {
    return this.voice1.isActive ? this.voice2 : this.voice1;
  }

  private startTimeUpdates(): void {
    this.stopTimeUpdates();

    this.timeUpdateInterval = setInterval(() => {
      if (this.isDestroyed) return;

      const activeVoice = this.getActiveVoice();
      if (activeVoice.audio && activeVoice.isPlaying) {
        const currentTime = activeVoice.audio.currentTime;
        const duration = activeVoice.audio.duration;

        // Handle crossfade volume adjustments during active crossfade
        if (
          this.crossfadeInProgress &&
          this.crossfadeStartTime &&
          this.crossfadePhase === "active"
        ) {
          const elapsed = (Date.now() - this.crossfadeStartTime) / 1000;
          const progress = Math.min(elapsed / this.crossfadeDuration, 1);

          // Equal power crossfade
          const currentGain = Math.cos((progress * Math.PI) / 2);
          const nextGain = Math.sin((progress * Math.PI) / 2);

          const inactiveVoice = this.getInactiveVoice();
          if (activeVoice.audio) {
            activeVoice.audio.volume = Math.max(
              0,
              Math.min(1, currentGain * (this.isMuted ? 0 : this.volume)),
            );
          }
          if (inactiveVoice.audio && inactiveVoice.isPlaying) {
            inactiveVoice.audio.volume = Math.max(
              0,
              Math.min(1, nextGain * (this.isMuted ? 0 : this.volume)),
            );
          }

          // Check if crossfade is complete
          if (progress >= 1) {
            this.completeCrossfade();
          }
        }

        // Validate time values to prevent NaN or invalid updates
        if (
          currentTime >= 0 &&
          duration > 0 &&
          !isNaN(currentTime) &&
          !isNaN(duration) &&
          isFinite(currentTime) &&
          isFinite(duration)
        ) {
          this.onTimeUpdate?.(currentTime, duration);
        }
      }
    }, 100);
  }

  private stopTimeUpdates(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  private completeCrossfade(): void {
    const currentActive = this.getActiveVoice();
    const currentInactive = this.getInactiveVoice();
    if (currentActive.audio) {
      currentActive.audio.pause();
      currentActive.isPlaying = false;
    }

    currentInactive.isActive = true;
    currentActive.isActive = false;

    if (currentInactive.audio) {
      currentInactive.audio.volume = this.isMuted ? 0 : this.volume;
    }

    this.crossfadeInProgress = false;
    this.crossfadePhase = "none";
    this.crossfadeStartTime = null;

    if (this.onCrossfadeComplete) {
      this.onCrossfadeComplete();
    }
  }

  async loadTrack(
    track: CrossfadeTrack,
    options: CrossfadeOptions,
  ): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    try {
      this.crossfadeDuration = options.crossfadeDuration;
      this.volume = options.volume;
      this.onTrackEnd = options.onTrackEnd;
      this.onTimeUpdate = options.onTimeUpdate;
      this.onError = options.onError;
      this.onCrossfadeStart = options.onCrossfadeStart;
      this.onCrossfadeComplete = options.onCrossfadeComplete;

      this.stop();

      // Create new audio element for voice1
      const audio = this.createAudioElement(track.filePath);

      audio.addEventListener("error", (e) => {
        const errorMsg =
          e.target?.error?.message || e.message || "Unknown error";
        console.error("Audio loading error for:", track.filePath, errorMsg);
        this.handleError(new Error(`Failed to load audio: ${errorMsg}`));
      });

      audio.addEventListener("ended", () => {
        if (this.voice1.isActive && !this.crossfadeInProgress) {
          this.voice1.isPlaying = false;
          this.onTrackEnd?.();
        }
      });

      this.voice1.audio = audio;
      this.voice1.isActive = true;
      this.voice1.isPlaying = false;
      this.voice2.isActive = false;

    } catch (error) {
      this.handleError(error as Error);
    }
  }

  async scheduleCrossfade(nextTrack: CrossfadeTrack): Promise<void> {
    if (this.isDestroyed || this.crossfadeInProgress) {
      throw new Error("Cannot start crossfade in current state");
    }

    try {
      this.crossfadeInProgress = true;
      this.crossfadePhase = "active";
      this.crossfadeStartTime = Date.now();

      const inactiveVoice = this.getInactiveVoice();

      // Create next track audio element
      const nextAudio = this.createAudioElement(nextTrack.filePath);
      nextAudio.volume = 0; // Start silent

      inactiveVoice.audio = nextAudio;

      // Set up next track event listeners
      nextAudio.addEventListener("ended", () => {
        if (inactiveVoice.isActive && !this.crossfadeInProgress) {
          inactiveVoice.isPlaying = false;
          this.onTrackEnd?.();
        }
      });

      nextAudio.addEventListener("error", (e) => {
        const errorMsg =
          e.target?.error?.message || e.message || "Unknown error";
        console.error("Next track error:", errorMsg);
        this.crossfadeInProgress = false;
        this.crossfadePhase = "none";
        this.handleError(new Error(`Next track failed: ${errorMsg}`));
      });

      // Wait for next track to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Next track loading timeout"));
        }, 5000);

        if (nextAudio.readyState >= 2) {
          clearTimeout(timeout);
          resolve();
        } else {
          nextAudio.addEventListener(
            "canplay",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
        }
      });

      // Start playing next track and begin crossfade
      try {
        await nextAudio.play();
        inactiveVoice.isPlaying = true;
        this.onCrossfadeStart?.(nextTrack);
      } catch (playError) {
        console.error("Failed to play next track:", playError);
        throw new Error(`Next track playback failed: ${playError.message}`);
      }

    } catch (error) {
      this.crossfadeInProgress = false;
      this.crossfadePhase = "none";
      throw error;
    }
  }

  play(): void {
    if (this.isDestroyed) return;

    const activeVoice = this.getActiveVoice();

    if (activeVoice.audio && !activeVoice.isPlaying) {
      try {
        activeVoice.audio
          .play()
          .then(() => {
            activeVoice.isPlaying = true;
            this.startTimeUpdates();
          })
          .catch((error) => {
            this.handleError(error);
          });
      } catch (error) {
        this.handleError(error as Error);
      }
    }
  }

  pause(): void {
    if (this.isDestroyed) return;

    const activeVoice = this.getActiveVoice();

    if (activeVoice.audio && activeVoice.isPlaying) {
      activeVoice.audio.pause();
      activeVoice.isPlaying = false;

      this.stopTimeUpdates();
    }
  }

  stop(): void {
    if (this.voice1.audio) {
      this.voice1.audio.pause();
      this.voice1.audio = null;
    }
    if (this.voice2.audio) {
      this.voice2.audio.pause();
      this.voice2.audio = null;
    }

    this.voice1.isPlaying = false;
    this.voice2.isPlaying = false;

    this.stopTimeUpdates();
    this.crossfadeInProgress = false;
    this.crossfadePhase = "none";
    this.crossfadeStartTime = null;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));

    const activeVoice = this.getActiveVoice();
    if (activeVoice.audio && !this.crossfadeInProgress) {
      activeVoice.audio.volume = this.isMuted ? 0 : this.volume;
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;

    const activeVoice = this.getActiveVoice();
    if (activeVoice.audio && !this.crossfadeInProgress) {
      activeVoice.audio.volume = muted ? 0 : this.volume;
    }
  }

  seek(time: number): void {
    if (this.isDestroyed) return;

    const activeVoice = this.getActiveVoice();

    if (activeVoice.audio) {
      activeVoice.audio.currentTime = Math.max(
        0,
        Math.min(time, activeVoice.audio.duration || 0),
      );
    }
  }

  getCurrentTime(): number {
    const activeVoice = this.getActiveVoice();
    return activeVoice.audio?.currentTime || 0;
  }

  getCurrentDuration(): number {
    const activeVoice = this.getActiveVoice();
    return activeVoice.audio?.duration || 0;
  }

  isPlaying(): boolean {
    const activeVoice = this.getActiveVoice();
    return activeVoice.isPlaying;
  }

  abortCrossfade(): void {
    if (!this.crossfadeInProgress) return;

    this.crossfadeInProgress = false;
    this.crossfadePhase = "none";
    this.crossfadeStartTime = null;

    const activeVoice = this.getActiveVoice();
    const inactiveVoice = this.getInactiveVoice();

    if (inactiveVoice.audio) {
      inactiveVoice.audio.pause();
      inactiveVoice.audio = null;
    }
    inactiveVoice.isPlaying = false;

    if (activeVoice.audio) {
      activeVoice.audio.volume = this.isMuted ? 0 : this.volume;
    }
  }

  destroy(): void {
    this.isDestroyed = true;

    this.stop();

    this.onTrackEnd = undefined;
    this.onTimeUpdate = undefined;
    this.onError = undefined;
    this.onCrossfadeStart = undefined;
    this.onCrossfadeComplete = undefined;
  }
}
