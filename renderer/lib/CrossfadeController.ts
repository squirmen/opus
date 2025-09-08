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

  constructor() {
    // HTML Audio approach - no AudioContext needed
  }

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
    console.log("Completing crossfade handoff");

    // Switch active voices
    const currentActive = this.getActiveVoice();
    const currentInactive = this.getInactiveVoice();

    // Stop current voice
    if (currentActive.audio) {
      currentActive.audio.pause();
      currentActive.isPlaying = false;
    }

    // Make inactive voice the new active voice
    currentInactive.isActive = true;
    currentActive.isActive = false;

    // Ensure new active voice is at full volume
    if (currentInactive.audio) {
      currentInactive.audio.volume = this.isMuted ? 0 : this.volume;
    }

    // Reset crossfade state
    this.crossfadeInProgress = false;
    this.crossfadePhase = "none";
    this.crossfadeStartTime = null;

    // Notify completion (if callback is provided)
    if (this.onCrossfadeComplete) {
      this.onCrossfadeComplete();
    }

    console.log("Crossfade handoff completed successfully");
  }

  async loadTrack(
    track: CrossfadeTrack,
    options: CrossfadeOptions,
  ): Promise<void> {
    if (this.isDestroyed) {
      console.warn(
        "Attempted to load track on destroyed CrossfadeController, ignoring",
      );
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
          console.log("Track ended naturally");
          this.onTrackEnd?.();
        }
      });

      this.voice1.audio = audio;
      this.voice1.isActive = true;
      this.voice1.isPlaying = false;
      this.voice2.isActive = false;

      console.log("Track loaded successfully:", track.filePath);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  async scheduleCrossfade(nextTrack: CrossfadeTrack): Promise<void> {
    if (this.isDestroyed || this.crossfadeInProgress) {
      throw new Error("Cannot start crossfade in current state");
    }

    try {
      console.log("Starting seamless crossfade to:", nextTrack.filePath);
      this.crossfadeInProgress = true;

      const inactiveVoice = this.getInactiveVoice();

      // Create next track audio element
      const nextAudio = this.createAudioElement(nextTrack.filePath);
      nextAudio.volume = 0; // Start silent

      inactiveVoice.audio = nextAudio;

      // Set up next track event listeners
      nextAudio.addEventListener("ended", () => {
        if (inactiveVoice.isActive && !this.crossfadeInProgress) {
          inactiveVoice.isPlaying = false;
          console.log("Next track ended naturally");
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
        // Mark the real start of the crossfade now that both tracks are playing
        this.crossfadePhase = "active";
        this.crossfadeStartTime = Date.now();
        // Notify UI that crossfade is starting at the actual overlap
        this.onCrossfadeStart?.(nextTrack);
        console.log("Next track started playing during crossfade");
      } catch (playError) {
        console.error("Failed to play next track:", playError);
        throw new Error(`Next track playback failed: ${playError.message}`);
      }

      // The crossfade volume adjustment happens in the time update interval
      console.log("Crossfade scheduled successfully");
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
            console.log("Playback started");
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
      console.log("Playback paused");
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

  // Abort any in-progress crossfade and clean up state
  abortCrossfade(): void {
    if (!this.crossfadeInProgress) return;

    console.log("Aborting crossfade operation");
    this.crossfadeInProgress = false;
    this.crossfadePhase = "none";
    this.crossfadeStartTime = null;

    // Keep only the active voice, cleanup the inactive one
    const activeVoice = this.getActiveVoice();
    const inactiveVoice = this.getInactiveVoice();

    if (inactiveVoice.audio) {
      inactiveVoice.audio.pause();
      inactiveVoice.audio = null;
    }
    inactiveVoice.isPlaying = false;

    // Ensure active voice volume is restored
    if (activeVoice.audio) {
      activeVoice.audio.volume = this.isMuted ? 0 : this.volume;
    }

    console.log("Crossfade aborted, active voice restored");
  }

  destroy(): void {
    this.isDestroyed = true;

    // Stop all audio and clear intervals/timeouts
    this.stop();

    // Clear callback references to prevent memory leaks
    this.onTrackEnd = undefined;
    this.onTimeUpdate = undefined;
    this.onError = undefined;
    this.onCrossfadeStart = undefined;
    this.onCrossfadeComplete = undefined;

    console.log("CrossfadeController destroyed and cleaned up");
  }
}
