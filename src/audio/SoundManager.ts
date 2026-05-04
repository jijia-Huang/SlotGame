const MAIN_GAME_BGM_SRC = '/assets/audio/main_game_bgm.wav';
const MAIN_GAME_BGM_ELEMENT_ID = 'main-game-bgm';
const BATTLE_INTRO_SRC = '/assets/audio/battle_encounter_intro.wav';
const BATTLE_BGM_SRC = '/assets/audio/battle_bgm.wav';
const JP_COUNTUP_SRC = '/assets/audio/jp_countup_victory.wav';
const CAPTURE_HIT_DAMAGE_SRC = '/assets/audio/capture_hit_damage.wav';
const CREATURE_HIT_VOLUME = 0.24;
const JP_COUNTUP_MS = {
  MINI: 8000,
  MINOR: 10000,
  MAJOR: 12000,
  GRAND: 15000,
} as const;

type JackpotTier = keyof typeof JP_COUNTUP_MS;

export class SoundManager {
  private static instance?: SoundManager;

  private readonly mainGameBgm = this.createAudio(MAIN_GAME_BGM_SRC, 0.34, true, MAIN_GAME_BGM_ELEMENT_ID);
  private readonly battleIntro = this.createAudio(BATTLE_INTRO_SRC, 0.82, false);
  private readonly battleBgm = this.createAudio(BATTLE_BGM_SRC, 0.38, true);
  private readonly jpCountUp = this.createAudio(JP_COUNTUP_SRC, 0.78, false);
  private readonly captureHitDamage = this.createAudio(CAPTURE_HIT_DAMAGE_SRC, CREATURE_HIT_VOLUME, false);
  private mainFadeTimer?: number;
  private bgmFadeTimer?: number;
  private jpFadeTimer?: number;

  static shared(): SoundManager {
    this.instance ??= new SoundManager();
    return this.instance;
  }

  preload(): void {
    this.mainGameBgm.load();
    this.battleIntro.load();
    this.battleBgm.load();
    this.jpCountUp.load();
    this.captureHitDamage.load();
  }

  async startMainGameLoop(): Promise<void> {
    this.clearMainFade();
    if (!this.mainGameBgm.paused) {
      return;
    }

    this.mainGameBgm.volume = 0.34;
    await this.safePlay(this.mainGameBgm);
  }

  requestMainGameAutoplay(): void {
    this.mainGameBgm.autoplay = true;
    this.mainGameBgm.loop = true;
    this.mainGameBgm.volume = 0.34;
    void this.startMainGameLoop();

    [250, 1000, 2500].forEach((ms) => {
      window.setTimeout(() => {
        if (this.mainGameBgm.paused) {
          void this.startMainGameLoop();
        }
      }, ms);
    });
  }

  stopMainGameLoop(fadeMs = 420): void {
    this.clearMainFade();
    if (this.mainGameBgm.paused) {
      return;
    }

    const startVolume = this.mainGameBgm.volume;
    const startedAt = performance.now();
    this.mainFadeTimer = window.setInterval(() => {
      const t = Math.min((performance.now() - startedAt) / fadeMs, 1);
      this.mainGameBgm.volume = startVolume * (1 - t);
      if (t >= 1) {
        this.clearMainFade();
        this.mainGameBgm.pause();
        this.mainGameBgm.volume = startVolume;
      }
    }, 33);
  }

  async playBattleEncounterIntro(): Promise<void> {
    this.stopBattleEncounterIntro();
    this.battleIntro.currentTime = 0;
    this.battleIntro.volume = 0.82;
    await this.safePlay(this.battleIntro);
  }

  stopBattleEncounterIntro(): void {
    this.battleIntro.pause();
    this.battleIntro.currentTime = 0;
  }

  async startBattleLoop(): Promise<void> {
    this.clearBgmFade();
    if (!this.battleBgm.paused) {
      return;
    }

    this.battleBgm.currentTime = 0;
    this.battleBgm.volume = 0.38;
    await this.safePlay(this.battleBgm);
  }

  stopBattleLoop(fadeMs = 360): void {
    this.clearBgmFade();
    if (this.battleBgm.paused) {
      this.battleBgm.currentTime = 0;
      return;
    }

    const startVolume = this.battleBgm.volume;
    const startedAt = performance.now();
    this.bgmFadeTimer = window.setInterval(() => {
      const t = Math.min((performance.now() - startedAt) / fadeMs, 1);
      this.battleBgm.volume = startVolume * (1 - t);
      if (t >= 1) {
        this.clearBgmFade();
        this.battleBgm.pause();
        this.battleBgm.currentTime = 0;
        this.battleBgm.volume = startVolume;
      }
    }, 33);
  }

  playJackpotCountUp(tier: JackpotTier): number {
    const durationMs = JP_COUNTUP_MS[tier];
    this.stopJackpotCountUp(0);
    this.jpCountUp.currentTime = 0;
    this.jpCountUp.volume = 0.78;
    void this.safePlay(this.jpCountUp);
    return durationMs;
  }

  stopJackpotCountUp(fadeMs = 320): void {
    this.clearJpFade();
    if (this.jpCountUp.paused) {
      this.jpCountUp.currentTime = 0;
      return;
    }

    if (fadeMs <= 0) {
      this.jpCountUp.pause();
      this.jpCountUp.currentTime = 0;
      return;
    }

    const startVolume = this.jpCountUp.volume;
    const startedAt = performance.now();
    this.jpFadeTimer = window.setInterval(() => {
      const t = Math.min((performance.now() - startedAt) / fadeMs, 1);
      this.jpCountUp.volume = startVolume * (1 - t);
      if (t >= 1) {
        this.clearJpFade();
        this.jpCountUp.pause();
        this.jpCountUp.currentTime = 0;
        this.jpCountUp.volume = startVolume;
      }
    }, 33);
  }

  playCreatureHitDamage(): void {
    this.captureHitDamage.currentTime = 0;
    this.captureHitDamage.volume = CREATURE_HIT_VOLUME;
    void this.safePlay(this.captureHitDamage);
  }

  private createAudio(src: string, volume: number, loop: boolean, elementId?: string): HTMLAudioElement {
    const existingAudio = elementId ? document.getElementById(elementId) : undefined;
    const audio = existingAudio instanceof HTMLAudioElement ? existingAudio : new Audio(src);
    audio.src = src;
    audio.preload = 'auto';
    audio.volume = volume;
    audio.loop = loop;
    return audio;
  }

  private async safePlay(audio: HTMLAudioElement): Promise<void> {
    try {
      await audio.play();
    } catch {
      // Browser autoplay rules can reject if no user gesture reached this call.
    }
  }

  private clearBgmFade(): void {
    if (this.bgmFadeTimer !== undefined) {
      window.clearInterval(this.bgmFadeTimer);
      this.bgmFadeTimer = undefined;
    }
  }

  private clearMainFade(): void {
    if (this.mainFadeTimer !== undefined) {
      window.clearInterval(this.mainFadeTimer);
      this.mainFadeTimer = undefined;
    }
  }

  private clearJpFade(): void {
    if (this.jpFadeTimer !== undefined) {
      window.clearInterval(this.jpFadeTimer);
      this.jpFadeTimer = undefined;
    }
  }
}
