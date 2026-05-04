import * as PIXI from 'pixi.js';
import { SoundManager } from '../audio/SoundManager';
import type { AssetStore } from '../core/AssetStore';
import { CascadeSpinAdapter } from './CascadeSpinAdapter';
import { SymbolView } from './SymbolView';
import type { BattleAward, BattleAwardTier, CascadeStep, FeatureEvent, PotFamilyId, SlotState, SpinResult } from './types';

type SlotEvents = {
  onStateChange?: (state: SlotState) => void;
  onResult?: (result: SpinResult) => void;
  onBattleAward?: (award: BattleAward) => void;
};

type BattleTarget = {
  familyId: PotFamilyId;
  stage: number;
};

const CELL_W = 108;
const CELL_H = 84;
const GAP = 9;
const POT_W = 184;
const POT_H = 92;
const BOARD_OFFSET_Y = 72;
const POT_GAP_ABOVE_BOARD = 0;
const SCENE_W = 1200;
const SCENE_H = 820;
const FAMILY_ASSET_ROOTS: Record<PotFamilyId, string> = {
  fire: 'fire-family',
  water: 'water-family-v3',
  grass: 'grass-family-v3',
};
const IDLE_FRAME_COUNT = 4;
const HIT_FRAME_COUNT = 4;
const EVOLUTION_FRAME_COUNT = 6;
const GENERATED_FRAME_SIZE = 1024;
const BATTLE_AWARDS: Record<BattleAwardTier, number> = {
  MINI: 10,
  MINOR: 50,
  MAJOR: 100,
  GRAND: 1000,
};
const BATTLE_AWARD_TIERS = Object.keys(BATTLE_AWARDS) as BattleAwardTier[];
const BATTLE_ASSETS = {
  background: '/assets/battle/background.png',
  platform: '/assets/battle/platform.png',
  pokeballFrames: [
    '/assets/battle/pokeball/closed.png',
    '/assets/battle/pokeball/throw-1.png',
    '/assets/battle/pokeball/open-1.png',
    '/assets/battle/pokeball/open-2.png',
    '/assets/battle/pokeball/shake-1.png',
    '/assets/battle/pokeball/shake-2.png',
    '/assets/battle/pokeball/shake-3.png',
    '/assets/battle/pokeball/success.png',
    '/assets/battle/pokeball/burst-1.png',
    '/assets/battle/pokeball/star-1.png',
    '/assets/battle/pokeball/star-2.png',
    '/assets/battle/pokeball/star-3.png',
    '/assets/battle/pokeball/smoke-1.png',
    '/assets/battle/pokeball/smoke-2.png',
    '/assets/battle/pokeball/smoke-3.png',
    '/assets/battle/pokeball/smoke-4.png',
  ],
  absorbFrames: Array.from(
    { length: 16 },
    (_, index) => `/assets/battle/effects/absorb-${index + 1}.png`,
  ),
  burstFrames: Array.from(
    { length: 3 },
    (_, index) => `/assets/battle/effects/burst-${index + 1}.png`,
  ),
  starFrames: Array.from(
    { length: 4 },
    (_, index) => `/assets/battle/effects/star-${index + 1}.png`,
  ),
};
const POKEBALL_FRAME = {
  closed: 0,
  throw: 1,
  open: 3,
  shakeStart: 4,
  success: 7,
  burst: 8,
};
const BATTLE_ENCOUNTER_INTRO_MS = 3630;
const BATTLE_TRANSITION_FLASH_COUNT = 6;
const BATTLE_TRANSITION_FLASH_MS = 180;
const BATTLE_POKEBALL_SIZE = 72;

const POT_FAMILIES: Record<PotFamilyId, { names: string[]; color: number; accent: number }> = {
  fire: {
    names: ['小火龍', '火恐龍', '噴火龍'],
    color: 0xb91c1c,
    accent: 0xf97316,
  },
  water: {
    names: ['傑尼龜', '卡咪龜', '水箭龜'],
    color: 0x0369a1,
    accent: 0x38bdf8,
  },
  grass: {
    names: ['妙蛙種子', '妙蛙草', '妙蛙花'],
    color: 0x15803d,
    accent: 0x22c55e,
  },
};

export class CascadeSlotMachine extends PIXI.Container {
  private readonly cells: SymbolView[][] = [];
  private readonly adapter: CascadeSpinAdapter;
  private readonly cols: number;
  private readonly rows: number;
  private readonly winOverlay = new PIXI.Graphics();
  private readonly featureLayer = new PIXI.Container();
  private readonly sound = SoundManager.shared();
  private readonly potViews = new Map<PotFamilyId, PIXI.Container>();
  private readonly potStages: Record<PotFamilyId, number> = {
    fire: 0,
    water: 0,
    grass: 0,
  };
  private readonly textureCache = new Map<string, PIXI.Texture[]>();
  private readonly jpOverlay = new PIXI.Container();
  private readonly battleLayer = new PIXI.Container();
  private state: SlotState = 'idle';
  private spinning = false;
  private battleTarget?: BattleTarget;
  private battleTargetSprite?: PIXI.AnimatedSprite;
  private battleCaptureCount = 0;

  constructor(
    private readonly assets: AssetStore,
    private readonly renderer: PIXI.Renderer,
    private readonly events: SlotEvents = {},
  ) {
    super();
    this.cols = assets.paytable.cols;
    this.rows = assets.paytable.rows;
    this.adapter = new CascadeSpinAdapter([...assets.symbols.values()], assets.paytable);
    this.buildBoard();
    this.preloadPotAnimationTextures();
    this.preloadBattleTextures();
    this.sound.preload();
    this.sound.requestMainGameAutoplay();
  }

  async spin(result?: SpinResult): Promise<void> {
    if (this.spinning) {
      return;
    }

    if (this.battleTarget) {
      await this.spinBattleCapture();
      return;
    }

    void this.sound.startMainGameLoop();
    const spinResult = result ?? this.adapter.next(this.potStages);
    this.spinning = true;
    this.setState('spinning');
    this.winOverlay.clear();

    const steps = spinResult.cascades ?? [{ grid: spinResult.grid, wins: [], win: spinResult.baseWin }];
    await this.dropGrid(steps[0].grid, true);

    for (const [index, step] of steps.entries()) {
      if (step.wins.length === 0) {
        break;
      }

      this.setState('result');
      this.drawWins(step);
      await delay(520);

      this.setState('clearing');
      await this.clearWins(step);
      this.winOverlay.clear();

      const nextStep = steps[index + 1];
      if (nextStep) {
        this.setState('dropping');
        await this.collapseAndRefill(step, nextStep.grid);
      }
    }

    let enteredBattle = false;
    if (spinResult.featureEvents.length > 0) {
      this.setState('feature');
      enteredBattle = await this.playFeatureEvents(spinResult.featureEvents);
    }

    this.events.onResult?.(enteredBattle ? this.withoutFeatureJpWin(spinResult) : spinResult);
    this.setState('payout');
    await delay(480);
    this.setState(this.battleTarget ? 'battle' : 'idle');
    this.spinning = false;
  }

  shouldChargeForNextSpin(): boolean {
    return !this.battleTarget;
  }

  private withoutFeatureJpWin(result: SpinResult): SpinResult {
    const featureWin = result.featureEvents
      .filter((event) => event.type !== 'jp')
      .reduce((sum, event) => sum + event.jpWin, 0);
    return {
      ...result,
      featureWin,
      totalWin: result.baseWin + featureWin,
      win: result.baseWin + featureWin,
    };
  }

  update(): void {
    // Cascades are driven by explicit tweens, so the Pixi ticker stays available
    // for future effects without owning the main state machine.
  }

  private buildBoard(): void {
    this.buildSceneBackdrop();

    const boardW = this.cols * CELL_W + (this.cols - 1) * GAP + 34;
    const boardH = this.rows * CELL_H + (this.rows - 1) * GAP + 34;
    const background = new PIXI.Graphics();
    background.beginFill(0x1f2937, 0.48);
    background.drawRoundedRect(-boardW / 2 - 10, -boardH / 2 + BOARD_OFFSET_Y + 12, boardW + 20, boardH + 14, 6);
    background.endFill();
    background.beginFill(0xffffff, 1);
    background.lineStyle(4, 0x26324a, 1);
    background.drawRoundedRect(-boardW / 2 - 8, -boardH / 2 + BOARD_OFFSET_Y - 8, boardW + 16, boardH + 16, 5);
    background.endFill();
    background.beginFill(0x8aa0b8, 1);
    background.lineStyle(3, 0x39465f, 1);
    background.drawRoundedRect(-boardW / 2 - 1, -boardH / 2 + BOARD_OFFSET_Y - 1, boardW + 2, boardH + 2, 3);
    background.endFill();
    background.beginFill(0xd9ecf8, 0.96);
    background.lineStyle(3, 0x26324a, 1);
    background.drawRoundedRect(-boardW / 2 + 9, -boardH / 2 + BOARD_OFFSET_Y + 9, boardW - 18, boardH - 18, 2);
    background.endFill();
    this.addChild(background);

    for (let col = 0; col < this.cols; col += 1) {
      const column: SymbolView[] = [];
      for (let row = 0; row < this.rows; row += 1) {
        const symbolId = [...this.assets.symbols.keys()][(col + row) % this.assets.symbols.size];
        const symbol = this.createCell(symbolId);
        symbol.position.set(this.xFor(col), this.yFor(row));
        column.push(symbol);
        this.addCell(symbol);
      }
      this.cells.push(column);
    }

    this.buildPots(-boardH / 2 + BOARD_OFFSET_Y - POT_H / 2 - POT_GAP_ABOVE_BOARD);
    this.addChild(this.winOverlay);
    this.addChild(this.featureLayer);
    this.battleLayer.visible = false;
    this.addChild(this.battleLayer);
    this.buildJpOverlay();
  }

  private buildSceneBackdrop(): void {
    const backdrop = new PIXI.Graphics();
    const left = -SCENE_W / 2;
    const top = -SCENE_H / 2 - 20;

    backdrop.beginFill(0x8fc7ff, 1);
    backdrop.drawRect(left, top, SCENE_W, SCENE_H);
    backdrop.endFill();

    for (let y = top + 12; y < top + SCENE_H; y += 8) {
      backdrop.lineStyle(2, 0x6da8f2, 0.28);
      backdrop.moveTo(left, y);
      backdrop.lineTo(left + SCENE_W, y);
    }

    backdrop.beginFill(0xffffff, 0.9);
    backdrop.drawRect(left, top, 54, SCENE_H);
    backdrop.drawRect(left + SCENE_W - 54, top, 54, SCENE_H);
    backdrop.endFill();

    backdrop.beginFill(0xcf7a32, 0.95);
    backdrop.drawPolygon([
      left, top + 70, left + 54, top + 92, left + 54, top + SCENE_H - 96,
      left, top + SCENE_H - 40,
    ]);
    backdrop.drawPolygon([
      left + SCENE_W, top + 60, left + SCENE_W - 54, top + 92,
      left + SCENE_W - 54, top + SCENE_H - 108, left + SCENE_W, top + SCENE_H - 38,
    ]);
    backdrop.endFill();

    this.drawMapLand(backdrop, -360, -265, 0.92);
    this.drawMapLand(backdrop, 135, -210, 1.18);
    this.drawMapLand(backdrop, -170, -40, 0.72);
    this.drawMapLand(backdrop, 360, -10, 0.78);

    this.drawRoute(backdrop, [
      [-460, -240], [-460, -125], [-345, -125], [-345, -15], [-190, -15],
      [-190, -128], [-20, -128], [-20, -242], [160, -242], [160, -124],
      [295, -124], [295, -15], [430, -15],
    ]);
    this.drawRoute(backdrop, [
      [-150, 115], [-25, 115], [-25, 20], [130, 20], [130, 120], [260, 120],
    ]);

    [
      [-460, -240], [-460, -125], [-345, -125], [-345, -15], [-20, -128],
      [160, -242], [160, -124], [295, -124], [295, -15], [430, -15],
      [-25, 20], [130, 120],
    ].forEach(([x, y]) => this.drawRouteNode(backdrop, x, y));

    [
      [-390, -180], [-390, -150], [-390, -120], [30, -240], [420, -200],
      [420, -160], [420, -88], [-520, 120], [300, 80],
    ].forEach(([x, y]) => this.drawBlueMarker(backdrop, x, y));

    backdrop.beginFill(0x000000, 0.16);
    backdrop.drawRect(left, 282, SCENE_W, 198);
    backdrop.endFill();
    this.addChild(backdrop);
  }

  private drawMapLand(graphics: PIXI.Graphics, x: number, y: number, scale: number): void {
    const points = [
      -160, -50, -96, -118, -18, -96, 42, -140, 132, -84, 178, -12,
      136, 80, 54, 108, -10, 156, -92, 92, -170, 116, -210, 20,
    ].map((point, index) => point * scale + (index % 2 === 0 ? x : y));

    graphics.lineStyle(5, 0x1f7a1f, 0.86);
    graphics.beginFill(0x36b51f, 0.98);
    graphics.drawPolygon(points);
    graphics.endFill();
    graphics.beginFill(0x68df13, 0.78);
    graphics.drawEllipse(x - 22 * scale, y - 22 * scale, 128 * scale, 76 * scale);
    graphics.endFill();
    graphics.beginFill(0x178d22, 0.52);
    graphics.drawEllipse(x - 84 * scale, y + 20 * scale, 88 * scale, 132 * scale);
    graphics.drawEllipse(x + 62 * scale, y - 72 * scale, 72 * scale, 92 * scale);
    graphics.endFill();
  }

  private drawRoute(graphics: PIXI.Graphics, points: Array<[number, number]>): void {
    graphics.lineStyle(28, 0xd6bf64, 0.98);
    points.forEach(([x, y], index) => {
      if (index === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    });
    graphics.lineStyle(10, 0xefe6a2, 0.82);
    points.forEach(([x, y], index) => {
      if (index === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    });
  }

  private drawRouteNode(graphics: PIXI.Graphics, x: number, y: number): void {
    graphics.lineStyle(4, 0xffffff, 1);
    graphics.beginFill(0xe75522, 1);
    graphics.drawCircle(x, y, 13);
    graphics.endFill();
    graphics.beginFill(0xf8fafc, 1);
    graphics.drawCircle(x, y - 2, 5);
    graphics.endFill();
  }

  private drawBlueMarker(graphics: PIXI.Graphics, x: number, y: number): void {
    graphics.lineStyle(3, 0xf8fafc, 0.95);
    graphics.beginFill(0x60a5fa, 1);
    graphics.drawRect(x - 8, y - 8, 16, 16);
    graphics.endFill();
  }

  private async dropGrid(grid: string[][], firstDrop: boolean): Promise<void> {
    const tweens: Array<Promise<void>> = [];

    grid.forEach((column, col) => {
      column.forEach((symbolId, row) => {
        const cell = this.cells[col][row];
        cell.setSymbol(symbolId, 'idle');
        cell.alpha = 1;
        cell.scale.set(0.84);

        const targetY = this.yFor(row);
        const startY = targetY - (firstDrop ? 560 : 260) - (this.rows - row) * 24;
        cell.x = this.xFor(col);
        cell.y = startY;
        tweens.push(animate(260 + row * 28 + col * 24, (t) => {
          const eased = easeOutBack(t);
          cell.y = lerp(startY, targetY, eased);
        }));
      });
    });

    await Promise.all(tweens);
    this.snapGrid();
  }

  private async collapseAndRefill(step: CascadeStep, nextGrid: string[][]): Promise<void> {
    const removedByColumn = new Map<number, Set<number>>();
    step.wins.forEach((win) => {
      win.positions.forEach((position) => {
        const rows = removedByColumn.get(position.col) ?? new Set<number>();
        rows.add(position.row);
        removedByColumn.set(position.col, rows);
      });
    });

    const tweens: Array<Promise<void>> = [];

    for (let col = 0; col < this.cols; col += 1) {
      const removedRows = removedByColumn.get(col) ?? new Set<number>();
      const oldColumn = this.cells[col];
      const removedCells = oldColumn.filter((_cell, row) => removedRows.has(row));
      const survivors = oldColumn.filter((_cell, row) => !removedRows.has(row));
      const refillCount = this.rows - survivors.length;
      const newCells = Array.from({ length: refillCount }, (_, row) => {
        const cell = this.createCell(nextGrid[col][row]);
        cell.position.set(this.xFor(col), this.yFor(row - refillCount) - 80);
        this.addCell(cell);
        return cell;
      });

      removedCells.forEach((cell) => {
        this.removeChild(cell);
        cell.destroy({ children: true, texture: false, baseTexture: false });
      });

      this.cells[col] = [...newCells, ...survivors];

      this.cells[col].forEach((cell, row) => {
        const startY = cell.y;
        const targetY = this.yFor(row);
        const duration = 260 + Math.abs(targetY - startY) * 0.42 + col * 18;
        tweens.push(animate(duration, (t) => {
          cell.x = this.xFor(col);
          cell.y = lerp(startY, targetY, easeOutBack(t));
          cell.alpha = 1;
          cell.scale.set(0.84);
        }));
      });
    }

    await Promise.all(tweens);
    this.snapGrid();
  }

  private async clearWins(step: CascadeStep): Promise<void> {
    const winningCells = step.wins.flatMap((win) => win.positions.map((position) => this.cells[position.col][position.row]));

    winningCells.forEach((cell) => cell.celebrate());

    await Promise.all(winningCells.map((cell) =>
      animate(280, (t) => {
        cell.alpha = 1 - t;
        cell.scale.set(0.84 + t * 0.24);
      }),
    ));
  }

  private drawWins(step: CascadeStep): void {
    this.winOverlay.clear();

    step.wins.forEach((win) => {
      win.positions.forEach((position) => {
        const x = this.xFor(position.col);
        const y = this.yFor(position.row);
        this.winOverlay.lineStyle(4, 0xfacc15, 0.88);
        this.winOverlay.drawRoundedRect(x - CELL_W / 2, y - CELL_H / 2, CELL_W, CELL_H, 8);
      });
    });
  }

  private buildPots(y: number): void {
    const families = Object.keys(POT_FAMILIES) as PotFamilyId[];
    families.forEach((familyId, index) => {
      const view = new PIXI.Container();
      view.position.set((index - 1) * (POT_W + 20), y);
      this.potViews.set(familyId, view);
      this.addChild(view);
      this.renderPot(familyId);
    });
  }

  private renderPot(familyId: PotFamilyId): void {
    const view = this.potViews.get(familyId);
    if (!view) {
      return;
    }

    view.removeChildren().forEach((child) => child.destroy({ children: true }));
    const family = POT_FAMILIES[familyId];
    const stage = this.potStages[familyId];
    const sprite = this.createFamilySprite(familyId, 'idle', stage);
    sprite.name = `${familyId}-character`;
    view.addChild(sprite);
  }

  private createFamilySprite(
    familyId: PotFamilyId,
    mode: 'idle' | 'hit',
    stage: number,
    textures = this.getTextures(this.familyFramePaths(familyId, mode, stage)),
  ): PIXI.AnimatedSprite {
    const sprite = new PIXI.AnimatedSprite(textures);
    sprite.anchor.set(0.5, 0.5);
    sprite.animationSpeed = mode === 'idle' ? 0.08 : 0.18;
    sprite.loop = mode === 'idle';
    const size = this.potSpriteSize(familyId, stage);
    this.fitAnimatedSprite(sprite, textures, size);
    sprite.position.set(0, -8);
    if (mode === 'idle') {
      sprite.play();
    }
    return sprite;
  }

  private createEvolutionSprite(
    familyId: PotFamilyId,
    fromStage: number,
    toStage: number,
    textures = this.getTextures(this.evolutionFramePaths(familyId, fromStage, toStage)),
  ): PIXI.AnimatedSprite {
    const sprite = new PIXI.AnimatedSprite(textures);
    sprite.anchor.set(0.5);
    sprite.loop = false;
    sprite.animationSpeed = 0.16;
    const size = this.evolutionSpriteSize(familyId, toStage);
    this.fitAnimatedSprite(sprite, textures, size);
    sprite.position.set(0, -8);
    return sprite;
  }

  private fitAnimatedSprite(sprite: PIXI.AnimatedSprite, textures: PIXI.Texture[], maxSize: number): void {
    const applyScale = (): void => {
      const texture = sprite.texture;
      const frameWidth = texture.valid ? texture.orig.width : GENERATED_FRAME_SIZE;
      const frameHeight = texture.valid ? texture.orig.height : GENERATED_FRAME_SIZE;
      const largestSide = Math.max(frameWidth, frameHeight, 1);

      sprite.scale.set(maxSize / largestSide);
    };

    sprite.onFrameChange = applyScale;
    applyScale();

    const baseTextures = new Set(textures.map((texture) => texture.baseTexture));
    baseTextures.forEach((baseTexture) => {
      if (!baseTexture.valid) {
        baseTexture.once('loaded', applyScale);
        baseTexture.once('update', applyScale);
      }
    });
  }

  private async waitForTextures(textures: PIXI.Texture[]): Promise<void> {
    const baseTextures = new Set(textures.map((texture) => texture.baseTexture));
    const pendingLoads = Array.from(baseTextures)
      .filter((baseTexture) => !baseTexture.valid)
      .map((baseTexture) => new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          baseTexture.off('loaded', onReady);
          baseTexture.off('update', onReady);
          baseTexture.off('error', onError);
        };
        const onReady = (): void => {
          cleanup();
          resolve();
        };
        const onError = (): void => {
          cleanup();
          reject(new Error('Failed to load pot animation texture.'));
        };

        baseTexture.once('loaded', onReady);
        baseTexture.once('update', onReady);
        baseTexture.once('error', onError);

        if (baseTexture.valid) {
          onReady();
        }
      }));

    await Promise.all(pendingLoads);
  }

  private getTextures(paths: string[]): PIXI.Texture[] {
    const key = paths.join('|');
    const cached = this.textureCache.get(key);
    if (cached) {
      return cached;
    }

    const textures = paths.map((path) => {
      const texture = PIXI.Texture.from(path);
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      return texture;
    });
    this.textureCache.set(key, textures);
    return textures;
  }

  private familyFramePaths(familyId: PotFamilyId, mode: 'idle' | 'hit', stage: number): string[] {
    const stageNumber = stage + 1;
    const root = FAMILY_ASSET_ROOTS[familyId];
    const folder = familyId === 'fire' && mode === 'hit' && stageNumber === 3
      ? 'stage3_hit_wingfix'
      : `stage${stageNumber}_${mode}`;
    const prefix = folder;
    const count = mode === 'idle' ? IDLE_FRAME_COUNT : HIT_FRAME_COUNT;

    return Array.from({ length: count }, (_item, index) =>
      `/assets/sprites/${root}/${folder}/${prefix}-${index + 1}.png`,
    );
  }

  private evolutionFramePaths(familyId: PotFamilyId, fromStage: number, toStage: number): string[] {
    const root = FAMILY_ASSET_ROOTS[familyId];
    const folder = `stage${fromStage + 1}_evolve_to_stage${toStage + 1}`;
    return Array.from({ length: EVOLUTION_FRAME_COUNT }, (_item, index) =>
      `/assets/sprites/${root}/${folder}/${folder}-${index + 1}.png`,
    );
  }

  private potSpriteSize(familyId: PotFamilyId, stage: number): number {
    const sizes: Record<PotFamilyId, number[]> = {
      fire: [104, 126, 150],
      water: [104, 126, 144],
      grass: [104, 126, 140],
    };
    return sizes[familyId][stage] ?? sizes[familyId][0];
  }

  private evolutionSpriteSize(familyId: PotFamilyId, toStage: number): number {
    return this.potSpriteSize(familyId, toStage);
  }

  private async playFeatureEvents(events: FeatureEvent[]): Promise<boolean> {
    for (const event of events) {
      const preload = this.preloadFeatureEventTextures(event);
      await this.flyPokeball(event);
      await preload;
      await this.playPotHit(event.familyId);

      if (event.type === 'jp') {
        await this.enterBattle(event);
        return true;
      } else if (event.type === 'evolve') {
        await this.playFamilyEvolution(event.familyId, event.fromStage, event.toStage);
      } else {
        await this.pulsePot(event.familyId, 1.08, 260);
      }
    }
    return false;
  }

  private preloadPotAnimationTextures(): void {
    const families = Object.keys(POT_FAMILIES) as PotFamilyId[];
    const textureGroups = families.flatMap((familyId) => [
      ...[0, 1, 2].map((stage) => this.getTextures(this.familyFramePaths(familyId, 'idle', stage))),
      ...[0, 1, 2].map((stage) => this.getTextures(this.familyFramePaths(familyId, 'hit', stage))),
      this.getTextures(this.evolutionFramePaths(familyId, 0, 1)),
      this.getTextures(this.evolutionFramePaths(familyId, 1, 2)),
    ]);

    void Promise.all(textureGroups.map((textures) => this.waitForTextures(textures))).catch(() => {
      // Individual feature playback still waits for its textures before swapping sprites.
    });
  }

  private preloadFeatureEventTextures(event: FeatureEvent): Promise<void> {
    const stage = this.potStages[event.familyId];
    const textureGroups = [this.getTextures(this.familyFramePaths(event.familyId, 'hit', stage))];

    if (event.type === 'evolve') {
      textureGroups.push(this.getTextures(this.evolutionFramePaths(event.familyId, event.fromStage, event.toStage)));
    }

    return Promise.all(textureGroups.map((textures) => this.waitForTextures(textures))).then(() => undefined);
  }

  private preloadBattleTextures(): void {
    const textures = [
      PIXI.Texture.from(BATTLE_ASSETS.background),
      PIXI.Texture.from(BATTLE_ASSETS.platform),
      ...BATTLE_ASSETS.pokeballFrames.map((path) => PIXI.Texture.from(path)),
      ...BATTLE_ASSETS.absorbFrames.map((path) => PIXI.Texture.from(path)),
      ...BATTLE_ASSETS.burstFrames.map((path) => PIXI.Texture.from(path)),
      ...BATTLE_ASSETS.starFrames.map((path) => PIXI.Texture.from(path)),
    ];

    void this.waitForTextures(textures).catch(() => {
      // Runtime creation still uses Pixi's normal texture loading path if a preload fails.
    });
  }

  private async flyPokeball(event: FeatureEvent): Promise<void> {
    const start = this.localCellPosition(event.position.col, event.position.row);
    const end = this.potPosition(event.familyId);
    const ball = new PIXI.Graphics();
    ball.beginFill(0xffffff);
    ball.lineStyle(4, 0x111827, 1);
    ball.drawCircle(0, 0, 20);
    ball.endFill();
    ball.beginFill(0xef4444);
    ball.drawRoundedRect(-17, -17, 34, 17, 9);
    ball.endFill();
    ball.lineStyle(3, 0x111827, 1);
    ball.moveTo(-18, 0);
    ball.lineTo(18, 0);
    ball.beginFill(0xffffff);
    ball.drawCircle(0, 0, 6);
    ball.endFill();
    ball.position.copyFrom(start);
    this.featureLayer.addChild(ball);

    await animate(560, (t) => {
      const eased = easeInOut(t);
      const arc = Math.sin(Math.PI * t) * 96;
      ball.x = lerp(start.x, end.x, eased);
      ball.y = lerp(start.y, end.y, eased) - arc;
      ball.rotation = t * Math.PI * 4;
      ball.scale.set(1 + Math.sin(Math.PI * t) * 0.2);
    });

    this.featureLayer.removeChild(ball);
    ball.destroy();
  }

  private async playPotHit(familyId: PotFamilyId): Promise<void> {
    const view = this.potViews.get(familyId);
    if (!view) {
      return;
    }

    this.sound.playCreatureHitDamage();
    const currentSprite = view.getChildByName(`${familyId}-character`) as PIXI.AnimatedSprite | undefined;
    const stage = this.potStages[familyId];
    const hitTextures = this.getTextures(this.familyFramePaths(familyId, 'hit', stage));
    await this.waitForTextures(hitTextures);
    const hitSprite = this.createFamilySprite(familyId, 'hit', stage, hitTextures);
    hitSprite.name = `${familyId}-hit`;
    hitSprite.alpha = 0;
    if (currentSprite) {
      currentSprite.visible = false;
    }
    view.addChild(hitSprite);

    const startX = view.x;
    const startY = view.y;
    const shake = animate(520, (t) => {
      const pulse = Math.sin(Math.PI * t);
      view.x = startX + Math.sin(t * Math.PI * 10) * (1 - t) * 7;
      view.y = startY - pulse * 3;
      view.scale.set(1 + pulse * 0.05);
    });
    const play = new Promise<void>((resolve) => {
      hitSprite.onComplete = () => resolve();
      hitSprite.alpha = 1;
      hitSprite.gotoAndPlay(0);
    });
    await Promise.all([shake, play]);

    view.position.set(startX, startY);
    view.scale.set(1);
    view.removeChild(hitSprite);
    hitSprite.destroy({ children: true, texture: false, baseTexture: false });
    if (currentSprite) {
      currentSprite.visible = true;
    }
  }

  private async playFamilyEvolution(familyId: PotFamilyId, fromStage: number, toStage: number): Promise<void> {
    const view = this.potViews.get(familyId);
    if (!view) {
      return;
    }

    const currentSprite = view.getChildByName(`${familyId}-character`) as PIXI.AnimatedSprite | undefined;
    const evolutionTextures = this.getTextures(this.evolutionFramePaths(familyId, fromStage, toStage));
    await this.waitForTextures(evolutionTextures);
    const evolution = this.createEvolutionSprite(familyId, fromStage, toStage, evolutionTextures);
    evolution.name = `${familyId}-evolution`;

    if (currentSprite) {
      currentSprite.visible = false;
    }
    view.addChild(evolution);
    const startX = view.x;
    const startY = view.y;

    try {
      await Promise.all([
        new Promise<void>((resolve) => {
          evolution.onComplete = () => resolve();
          evolution.gotoAndPlay(0);
        }),
        this.playEvolutionFocus(view, 680),
      ]);
    } finally {
      view.position.set(startX, startY);
      view.scale.set(1);
    }

    view.removeChild(evolution);
    evolution.destroy({ children: true, texture: false, baseTexture: false });
    this.potStages[familyId] = Math.max(fromStage, toStage);
    this.renderPot(familyId);
  }

  private async playEvolutionFocus(view: PIXI.Container, duration: number): Promise<void> {
    const startX = view.x;
    const startY = view.y;

    await animate(duration, (t) => {
      const focus = Math.sin(Math.PI * t);
      view.x = startX;
      view.y = startY - focus * 18;
      view.scale.set(1 + focus * 0.28);
    });

    view.position.set(startX, startY);
    view.scale.set(1);
  }

  private async enterBattle(event: FeatureEvent): Promise<void> {
    const stage = this.potStages[event.familyId];
    this.battleTarget = { familyId: event.familyId, stage };
    this.setState('transition');
    this.sound.stopMainGameLoop();
    void this.sound.playBattleEncounterIntro();
    await this.playBattleTransition(stage);
    const battleLoop = this.sound.startBattleLoop();
    await this.showBattleScene(this.battleTarget);
    await battleLoop;
    this.setState('battle');
  }

  private async playBattleTransition(stage: number): Promise<void> {
    const overlay = new PIXI.Graphics();
    const flashDuration = BATTLE_TRANSITION_FLASH_COUNT * BATTLE_TRANSITION_FLASH_MS;
    const wipeDuration = BATTLE_ENCOUNTER_INTRO_MS - flashDuration;
    this.battleLayer.visible = true;
    this.battleLayer.addChild(overlay);

    for (let index = 0; index < BATTLE_TRANSITION_FLASH_COUNT; index += 1) {
      overlay.clear();
      overlay.beginFill(index % 2 === 0 ? 0xffffff : 0x000000, 0.9);
      overlay.drawRect(-SCENE_W / 2, -SCENE_H / 2 - 20, SCENE_W, SCENE_H);
      overlay.endFill();
      await delay(BATTLE_TRANSITION_FLASH_MS);
    }

    if (stage >= 1) {
      await animate(wipeDuration, (t) => {
        overlay.clear();
        overlay.beginFill(0xffffff, 1);
        overlay.drawRect(-SCENE_W / 2, -SCENE_H / 2 - 20, SCENE_W, SCENE_H);
        overlay.endFill();
        overlay.lineStyle(8, 0x1f2937, 0.9);
        for (let y = -SCENE_H / 2; y < SCENE_H / 2; y += 28) {
          const inset = (1 - easeOutCubic(t)) * SCENE_W / 2;
          overlay.moveTo(-SCENE_W / 2 + inset, y);
          overlay.lineTo(SCENE_W / 2 - inset, y + 12);
        }
      });
    } else {
      await animate(wipeDuration, (t) => {
        overlay.clear();
        overlay.beginFill(0x000000, 1);
        const stripeH = 24;
        for (let y = -SCENE_H / 2 - 20; y < SCENE_H / 2; y += stripeH * 2) {
          const width = SCENE_W * easeOutCubic(t);
          overlay.drawRect(-SCENE_W / 2, y, width, stripeH);
          overlay.drawRect(SCENE_W / 2 - width, y + stripeH, width, stripeH);
        }
        overlay.endFill();
      });
    }

    this.battleLayer.removeChild(overlay);
    overlay.destroy();
  }

  private async showBattleScene(target: BattleTarget): Promise<void> {
    this.battleLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.battleLayer.visible = true;
    const background = this.createBattleBackground();
    const platform = this.createBattlePlatform();
    const sprite = this.createFamilySprite(target.familyId, 'idle', target.stage);
    const baseScale = sprite.scale.x;

    sprite.name = 'battle-target';
    sprite.scale.set(baseScale * 1.45);
    sprite.position.set(-260, 68);
    platform.position.set(210, 132);
    this.battleTargetSprite = sprite;
    this.battleLayer.addChild(background, platform, sprite);

    await animate(460, (t) => {
      sprite.x = lerp(-260, 210, easeOutCubic(t));
    });
  }

  private async spinBattleCapture(): Promise<void> {
    const target = this.battleTarget;
    if (!target || this.spinning) {
      return;
    }

    this.spinning = true;
    this.setState('capture');
    const success = this.nextCaptureSuccess();
    await this.playCaptureSequence(success);

    if (success) {
      const award = this.nextBattleAward();
      this.sound.stopBattleLoop();
      this.setState('battlePayout');
      await this.playBattleAward(award);
      this.events.onBattleAward?.(award);
      this.resetCapturedFamily(target.familyId);
      this.endBattle();
      this.setState('idle');
    } else {
      this.restoreBattleTarget();
      this.setState('battle');
    }

    this.spinning = false;
  }

  private async playCaptureSequence(success: boolean): Promise<void> {
    const target = this.battleTargetSprite;
    if (!target) {
      return;
    }

    const ball = this.createPokeball();
    const beam = new PIXI.Graphics();
    ball.position.set(430, 285);
    ball.scale.set(1);
    this.battleLayer.addChild(beam, ball);
    this.setPokeballFrame(ball, POKEBALL_FRAME.throw);
    playTone(880, 0.08, 'square', 0.05);

    await animate(520, (t) => {
      const eased = easeInOut(t);
      const arc = Math.sin(Math.PI * t) * 150;
      ball.x = lerp(430, target.x, eased);
      ball.y = lerp(285, target.y - 20, eased) - arc;
      ball.rotation = t * Math.PI * 5;
    });

    playTone(1180, 0.08, 'square', 0.06);
    ball.rotation = 0;
    this.setPokeballFrame(ball, POKEBALL_FRAME.open);
    await delay(80);
    await this.absorbBattleTarget(target, ball, beam);
    this.setPokeballFrame(ball, POKEBALL_FRAME.closed);
    await animate(260, (t) => {
      ball.x = lerp(target.x, 210, easeOutCubic(t));
      ball.y = lerp(target.y - 20, 142, easeOutCubic(t));
      ball.rotation = 0;
    });

    const shakes = success ? 3 : 1 + (this.battleCaptureCount % 3);
    for (let index = 0; index < shakes; index += 1) {
      await this.shakePokeball(ball, index);
    }

    if (success) {
      playTone(1568, 0.16, 'triangle', 0.06);
      this.setPokeballFrame(ball, POKEBALL_FRAME.success);
      await this.playCaptureStars(ball.x, ball.y - 26);
      ball.alpha = 0.74;
      await delay(320);
    } else {
      playTone(180, 0.18, 'sawtooth', 0.05);
      this.setPokeballFrame(ball, POKEBALL_FRAME.burst);
      await this.playCaptureBurst(ball.x, ball.y);
      ball.visible = false;
      await this.returnBattleTarget(target);
    }

    this.battleLayer.removeChild(ball, beam);
    ball.destroy({ children: true });
    beam.destroy();
  }

  private async absorbBattleTarget(target: PIXI.AnimatedSprite, ball: PIXI.Container, beam: PIXI.Graphics): Promise<void> {
    const startScale = target.scale.x;
    const effect = this.createAbsorbEffect();
    this.battleLayer.addChild(effect);
    effect.play();

    await animate(420, (t) => {
      const focus = 1 - t;
      target.tint = 0xff6aa2;
      target.alpha = Math.max(0.18, focus);
      target.scale.set(startScale * (1 - t * 0.76));
      effect.position.set(lerp(target.x, ball.x, t * 0.58), lerp(target.y, ball.y, t * 0.58));
      effect.scale.set(1.7 - t * 0.6);
      effect.alpha = 0.9 * focus;
      beam.clear();
      beam.beginFill(0xff5fa2, 0.42 * focus);
      beam.drawPolygon([
        target.x - 70 * focus, target.y - 60 * focus,
        ball.x, ball.y - 12,
        target.x + 70 * focus, target.y + 60 * focus,
        ball.x, ball.y + 12,
      ]);
      beam.endFill();
    });
    target.visible = false;
    target.alpha = 1;
    target.tint = 0xffffff;
    target.scale.set(startScale);
    beam.clear();
    this.battleLayer.removeChild(effect);
    effect.destroy({ children: true, texture: false, baseTexture: false });
  }

  private async returnBattleTarget(target: PIXI.AnimatedSprite): Promise<void> {
    const startY = target.y;
    target.visible = true;
    target.alpha = 0;
    target.tint = 0xffffff;
    await animate(280, (t) => {
      target.alpha = t;
      target.y = startY - 24 + Math.sin(Math.PI * t) * 18;
    });
    target.y = startY;
  }

  private restoreBattleTarget(): void {
    if (this.battleTargetSprite) {
      this.battleTargetSprite.visible = true;
      this.battleTargetSprite.alpha = 1;
      this.battleTargetSprite.tint = 0xffffff;
    }
  }

  private async shakePokeball(ball: PIXI.Container, index: number): Promise<void> {
    playTone(220 - index * 18, 0.08, 'square', 0.045);
    const startX = ball.x;
    await animate(280, (t) => {
      this.setPokeballFrame(ball, POKEBALL_FRAME.shakeStart + Math.floor(t * 3) % 3);
      ball.x = startX + Math.sin(t * Math.PI * 2) * 16;
      ball.rotation = Math.sin(t * Math.PI * 2) * 0.38;
    });
    this.setPokeballFrame(ball, POKEBALL_FRAME.closed);
    ball.x = startX;
    ball.rotation = 0;
    await delay(110);
  }

  private async playBattleAward(award: BattleAward): Promise<void> {
    const panel = this.jpOverlay.getChildByName('panel') as PIXI.Container | undefined;
    const target = this.battleTarget;
    if (!target) {
      return;
    }

    if (panel) {
      panel.visible = false;
    }

    const awardView = this.createBattleAwardView(award, target);
    const pokemon = awardView.getChildByName('pokemon') as PIXI.AnimatedSprite;
    const title = awardView.getChildByName('title') as PIXI.Text;
    const amount = awardView.getChildByName('amount') as PIXI.Text;
    const rays = awardView.getChildByName('rays') as PIXI.Graphics;
    const flash = awardView.getChildByName('flash') as PIXI.Graphics;

    this.jpOverlay.addChild(awardView);
    this.jpOverlay.visible = true;
    playTone(784, 0.1, 'triangle', 0.05);
    playTone(1175, 0.14, 'triangle', 0.04);

    const pokemonScale = pokemon.scale.x;
    await animate(420, (t) => {
      const eased = easeOutBack(t);
      awardView.alpha = t;
      title.scale.set(0.55 + eased * 0.45);
      pokemon.scale.set(pokemonScale * (0.58 + eased * 0.42));
      pokemon.y = lerp(-245, -155, easeOutCubic(t));
      flash.alpha = Math.max(0, 0.85 - t * 1.2);
    });

    const countUpDuration = this.sound.playJackpotCountUp(award.tier);
    await animate(countUpDuration, (t) => {
      rays.rotation = t * Math.PI * 0.85;
      pokemon.y = -155 + Math.sin(t * Math.PI * 22) * 8;
      pokemon.scale.set(pokemonScale * (1 + Math.sin(t * Math.PI * 16) * 0.04));
      title.scale.set(1 + Math.sin(t * Math.PI * 18) * 0.05);
      amount.text = money(Math.round(award.amount * easeOutCubic(t)));
    });

    this.sound.stopJackpotCountUp();
    playTone(1568, 0.18, 'triangle', 0.05);
    await delay(620);
    await animate(240, (t) => {
      awardView.alpha = 1 - t;
      awardView.scale.set(1 - t * 0.08);
    });

    this.jpOverlay.removeChild(awardView);
    awardView.destroy({ children: true, texture: false, baseTexture: false });
    if (panel) {
      panel.visible = true;
    }
    this.jpOverlay.visible = false;
  }

  private createBattleAwardView(award: BattleAward, target: BattleTarget): PIXI.Container {
    const tierColors: Record<BattleAwardTier, { fill: number; stroke: number }> = {
      MINI: { fill: 0x38bdf8, stroke: 0x0c4a6e },
      MINOR: { fill: 0x34d399, stroke: 0x14532d },
      MAJOR: { fill: 0xfacc15, stroke: 0x78350f },
      GRAND: { fill: 0xfb7185, stroke: 0x881337 },
    };
    const colors = tierColors[award.tier];
    const view = new PIXI.Container();
    const dim = new PIXI.Graphics();
    const rays = new PIXI.Graphics();
    const band = new PIXI.Graphics();
    const flash = new PIXI.Graphics();
    const pokemon = this.createFamilySprite(target.familyId, 'idle', target.stage);
    const title = new PIXI.Text(award.tier, {
      fill: colors.fill,
      fontFamily: 'Arial, sans-serif',
      fontSize: 86,
      fontWeight: '900',
      stroke: 0xffffff,
      strokeThickness: 8,
      dropShadow: true,
      dropShadowColor: colors.stroke,
      dropShadowDistance: 6,
      dropShadowBlur: 0,
    });
    const subtitle = new PIXI.Text('JACKPOT', {
      fill: 0xffffff,
      fontFamily: 'Arial, sans-serif',
      fontSize: 30,
      fontWeight: '900',
      stroke: colors.stroke,
      strokeThickness: 5,
    });
    const amount = new PIXI.Text('$0', {
      fill: 0xfef3c7,
      fontFamily: 'Arial, sans-serif',
      fontSize: 58,
      fontWeight: '900',
      stroke: 0x1f2937,
      strokeThickness: 7,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 5,
    });
    const pokemonScale = pokemon.scale.x;

    view.alpha = 0;
    dim.beginFill(0x020617, 0.78);
    dim.drawRect(-SCENE_W / 2, -SCENE_H / 2 - 20, SCENE_W, SCENE_H);
    dim.endFill();

    for (let index = 0; index < 28; index += 1) {
      const angle = (Math.PI * 2 * index) / 28;
      rays.beginFill(index % 2 === 0 ? 0xfef08a : 0xffffff, 0.18);
      rays.moveTo(0, -12);
      rays.lineTo(Math.cos(angle - 0.035) * 620, Math.sin(angle - 0.035) * 620 - 40);
      rays.lineTo(Math.cos(angle + 0.035) * 620, Math.sin(angle + 0.035) * 620 - 40);
      rays.lineTo(0, -12);
      rays.endFill();
    }
    rays.name = 'rays';
    rays.position.set(0, -28);

    band.beginFill(0x0f172a, 0.82);
    band.lineStyle(4, colors.fill, 0.95);
    band.drawRoundedRect(-330, -86, 660, 172, 10);
    band.endFill();
    band.beginFill(colors.stroke, 0.5);
    band.drawRoundedRect(-306, -63, 612, 126, 6);
    band.endFill();
    band.position.set(0, 8);

    pokemon.name = 'pokemon';
    pokemon.scale.set(pokemonScale * 2.25);
    pokemon.position.set(0, -245);
    title.name = 'title';
    title.anchor.set(0.5);
    title.position.set(0, -12);
    subtitle.anchor.set(0.5);
    subtitle.position.set(0, 58);
    amount.name = 'amount';
    amount.anchor.set(0.5);
    amount.position.set(0, 158);

    flash.name = 'flash';
    flash.beginFill(0xffffff, 0.9);
    flash.drawRect(-SCENE_W / 2, -SCENE_H / 2 - 20, SCENE_W, SCENE_H);
    flash.endFill();

    view.addChild(dim, rays, pokemon, band, title, subtitle, amount, flash);
    return view;
  }

  private endBattle(): void {
    this.sound.stopBattleLoop();
    this.battleLayer.visible = false;
    this.battleLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.battleTarget = undefined;
    this.battleTargetSprite = undefined;
    void this.sound.startMainGameLoop();
  }

  private resetCapturedFamily(familyId: PotFamilyId): void {
    this.potStages[familyId] = 0;
    this.renderPot(familyId);
  }

  private nextCaptureSuccess(): boolean {
    this.battleCaptureCount += 1;
    return Math.random() < 0.5;
  }

  private nextBattleAward(): BattleAward {
    const tier = BATTLE_AWARD_TIERS[Math.floor(Math.random() * BATTLE_AWARD_TIERS.length)];
    const multiplier = BATTLE_AWARDS[tier];
    return {
      tier,
      multiplier,
      amount: multiplier * this.assets.paytable.bet,
    };
  }

  private createBattleBackground(): PIXI.Container {
    const layer = new PIXI.Container();
    const fallback = new PIXI.Graphics();
    fallback.beginFill(0x8fd4ff, 1);
    fallback.drawRect(-SCENE_W / 2, -SCENE_H / 2 - 20, SCENE_W, SCENE_H);
    fallback.endFill();
    fallback.beginFill(0xc7f58a, 1);
    fallback.drawRect(-SCENE_W / 2, 0, SCENE_W, SCENE_H / 2);
    fallback.endFill();

    const background = PIXI.Sprite.from(BATTLE_ASSETS.background);
    background.anchor.set(0.5);
    background.position.set(0, -20);
    fitSpriteCover(background, SCENE_W, SCENE_H);
    layer.addChild(fallback, background);
    return layer;
  }

  private createBattlePlatform(): PIXI.Container {
    const platform = new PIXI.Container();
    const base = PIXI.Sprite.from(BATTLE_ASSETS.platform);
    base.anchor.set(0.5);
    fitSpriteContain(base, 430, 260);
    platform.addChild(base);
    return platform;
  }

  private createPokeball(): PIXI.Container {
    const ball = new PIXI.Container();
    const sprite = PIXI.Sprite.from(BATTLE_ASSETS.pokeballFrames[0]);
    sprite.name = 'pokeball-frame';
    sprite.anchor.set(0.5);
    fitSpriteContain(sprite, BATTLE_POKEBALL_SIZE, BATTLE_POKEBALL_SIZE);
    ball.addChild(sprite);
    return ball;
  }

  private setPokeballFrame(ball: PIXI.Container, frameIndex: number): void {
    const sprite = ball.getChildByName('pokeball-frame') as PIXI.Sprite | undefined;
    if (!sprite) {
      return;
    }

    const index = Math.max(0, Math.min(frameIndex, BATTLE_ASSETS.pokeballFrames.length - 1));
    sprite.texture = PIXI.Texture.from(BATTLE_ASSETS.pokeballFrames[index]);
  }

  private createAbsorbEffect(): PIXI.AnimatedSprite {
    return this.createFrameEffect(BATTLE_ASSETS.absorbFrames, 150, 0.45);
  }

  private async playCaptureStars(x: number, y: number): Promise<void> {
    const stars = this.createFrameEffect(BATTLE_ASSETS.starFrames, 118, 0.28);
    stars.position.set(x, y);
    this.battleLayer.addChild(stars);
    stars.play();
    await animate(420, (t) => {
      stars.scale.set((118 / 96) * (0.86 + t * 0.46));
      stars.alpha = 1 - t * 0.28;
    });
    this.battleLayer.removeChild(stars);
    stars.destroy({ children: true, texture: false, baseTexture: false });
  }

  private async playCaptureBurst(x: number, y: number): Promise<void> {
    const burst = this.createFrameEffect(BATTLE_ASSETS.burstFrames, 150, 0.35);
    burst.position.set(x, y);
    this.battleLayer.addChild(burst);
    burst.play();
    await animate(300, (t) => {
      burst.scale.set((150 / 96) * (0.8 + t * 0.45));
      burst.alpha = 1 - t * 0.18;
    });
    this.battleLayer.removeChild(burst);
    burst.destroy({ children: true, texture: false, baseTexture: false });
  }

  private createFrameEffect(paths: string[], maxSize: number, animationSpeed: number): PIXI.AnimatedSprite {
    const effect = new PIXI.AnimatedSprite(paths.map((path) => PIXI.Texture.from(path)));
    effect.anchor.set(0.5);
    effect.loop = false;
    effect.animationSpeed = animationSpeed;
    effect.blendMode = PIXI.BLEND_MODES.ADD;
    fitAnimatedEffect(effect, maxSize);
    return effect;
  }

  private async playJp(event: FeatureEvent): Promise<void> {
    const panel = this.jpOverlay.getChildByName('panel') as PIXI.Container | undefined;
    const amount = this.jpOverlay.getChildByName('amount') as PIXI.Text | undefined;
    const title = this.jpOverlay.getChildByName('title') as PIXI.Text | undefined;
    if (!panel || !amount || !title) {
      return;
    }

    const family = POT_FAMILIES[event.familyId];
    title.text = `${family.names[this.potStages[event.familyId]]} JP`;
    amount.text = '$0';
    this.jpOverlay.visible = true;
    panel.scale.set(0.72);
    panel.alpha = 0;

    await animate(220, (t) => {
      panel.alpha = t;
      panel.scale.set(0.72 + easeOutBack(t) * 0.28);
    });

    await animate(820, (t) => {
      amount.text = money(Math.round(event.jpWin * easeOutCubic(t)));
    });
    await delay(420);
    await animate(180, (t) => {
      panel.alpha = 1 - t;
      panel.scale.set(1 - t * 0.12);
    });
    this.jpOverlay.visible = false;
  }

  private buildJpOverlay(): void {
    const panel = new PIXI.Container();
    panel.name = 'panel';
    const background = new PIXI.Graphics();
    const title = new PIXI.Text('JP', {
      fill: 0xfef3c7,
      fontFamily: 'Arial, sans-serif',
      fontSize: 30,
      fontWeight: '800',
    });
    const amount = new PIXI.Text('$0', {
      fill: 0xffffff,
      fontFamily: 'Arial, sans-serif',
      fontSize: 42,
      fontWeight: '900',
    });

    title.name = 'title';
    amount.name = 'amount';
    background.beginFill(0x020617, 0.94);
    background.lineStyle(3, 0xfacc15, 1);
    background.drawRoundedRect(-190, -86, 380, 172, 10);
    background.endFill();
    title.anchor.set(0.5);
    title.position.set(0, -30);
    amount.anchor.set(0.5);
    amount.position.set(0, 28);
    panel.addChild(background, title, amount);
    this.jpOverlay.visible = false;
    this.jpOverlay.addChild(panel);
    this.addChild(this.jpOverlay);
  }

  private async pulsePot(familyId: PotFamilyId, scale: number, duration: number): Promise<void> {
    const view = this.potViews.get(familyId);
    if (!view) {
      return;
    }

    await animate(duration, (t) => {
      const pulse = Math.sin(Math.PI * t);
      view.scale.set(1 + (scale - 1) * pulse);
    });
    view.scale.set(1);
  }

  private snapGrid(): void {
    this.cells.forEach((column, col) => {
      column.forEach((cell, row) => {
        cell.position.set(this.xFor(col), this.yFor(row));
        cell.alpha = 1;
        cell.scale.set(0.84);
      });
    });
  }

  private createCell(symbolId: string): SymbolView {
    const cell = new SymbolView(this.assets, this.renderer);
    cell.setSymbol(symbolId, 'idle');
    cell.alpha = 1;
    cell.scale.set(0.84);
    return cell;
  }

  private addCell(cell: SymbolView): void {
    const overlayIndex = this.children.indexOf(this.winOverlay);
    if (overlayIndex >= 0) {
      this.addChildAt(cell, overlayIndex);
      return;
    }
    this.addChild(cell);
  }

  private xFor(col: number): number {
    return (col - (this.cols - 1) / 2) * (CELL_W + GAP);
  }

  private yFor(row: number): number {
    return (row - (this.rows - 1) / 2) * (CELL_H + GAP) + BOARD_OFFSET_Y;
  }

  private localCellPosition(col: number, row: number): PIXI.Point {
    return new PIXI.Point(this.xFor(col), this.yFor(row));
  }

  private potPosition(familyId: PotFamilyId): PIXI.Point {
    const view = this.potViews.get(familyId);
    if (!view) {
      return new PIXI.Point(0, 0);
    }
    return new PIXI.Point(view.x, view.y);
  }

  private setState(state: SlotState): void {
    this.state = state;
    this.events.onStateChange?.(state);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function animate(ms: number, frame: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      frame(t);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

function fitSpriteCover(sprite: PIXI.Sprite, width: number, height: number): void {
  fitSprite(sprite, width, height, Math.max);
}

function fitSpriteContain(sprite: PIXI.Sprite, width: number, height: number): void {
  fitSprite(sprite, width, height, Math.min);
}

function fitAnimatedEffect(sprite: PIXI.AnimatedSprite, maxSize: number): void {
  const applyScale = (): void => {
    const texture = sprite.texture;
    const frameWidth = texture.valid ? texture.orig.width : GENERATED_FRAME_SIZE;
    const frameHeight = texture.valid ? texture.orig.height : GENERATED_FRAME_SIZE;
    const largestSide = Math.max(frameWidth, frameHeight, 1);
    sprite.scale.set(maxSize / largestSide);
  };

  sprite.onFrameChange = applyScale;
  applyScale();
}

function fitSprite(
  sprite: PIXI.Sprite,
  width: number,
  height: number,
  strategy: (...values: number[]) => number,
): void {
  const applyScale = (): void => {
    const texture = sprite.texture;
    const frameWidth = texture.valid ? texture.orig.width : GENERATED_FRAME_SIZE;
    const frameHeight = texture.valid ? texture.orig.height : GENERATED_FRAME_SIZE;
    sprite.scale.set(strategy(width / frameWidth, height / frameHeight));
  };

  applyScale();

  const baseTexture = sprite.texture.baseTexture;
  if (!baseTexture.valid) {
    baseTexture.once('loaded', applyScale);
    baseTexture.once('update', applyScale);
  }
}

function playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number): void {
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(gainValue, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => {
    void context.close();
  };
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
