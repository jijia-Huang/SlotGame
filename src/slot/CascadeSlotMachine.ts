import * as PIXI from 'pixi.js';
import type { AssetStore } from '../core/AssetStore';
import { CascadeSpinAdapter } from './CascadeSpinAdapter';
import { SymbolView } from './SymbolView';
import type { CascadeStep, FeatureEvent, PotFamilyId, SlotState, SpinResult } from './types';

type SlotEvents = {
  onStateChange?: (state: SlotState) => void;
  onResult?: (result: SpinResult) => void;
};

const CELL_W = 118;
const CELL_H = 96;
const GAP = 10;
const POT_W = 184;
const POT_H = 74;
const BOARD_OFFSET_Y = 72;
const POT_GAP_ABOVE_BOARD = 36;
const FAMILY_ASSET_ROOTS: Record<PotFamilyId, string> = {
  fire: 'fire-family',
  water: 'water-family-v3',
  grass: 'grass-family-v3',
};
const IDLE_FRAME_COUNT = 4;
const HIT_FRAME_COUNT = 4;
const EVOLUTION_FRAME_COUNT = 6;

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
  private readonly potViews = new Map<PotFamilyId, PIXI.Container>();
  private readonly potStages: Record<PotFamilyId, number> = {
    fire: 0,
    water: 0,
    grass: 0,
  };
  private readonly textureCache = new Map<string, PIXI.Texture[]>();
  private readonly jpOverlay = new PIXI.Container();
  private state: SlotState = 'idle';
  private spinning = false;

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
  }

  async spin(result?: SpinResult): Promise<void> {
    if (this.spinning) {
      return;
    }

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

    if (spinResult.featureEvents.length > 0) {
      this.setState('feature');
      await this.playFeatureEvents(spinResult.featureEvents);
    }

    this.events.onResult?.(spinResult);
    this.setState('payout');
    await delay(480);
    this.setState('idle');
    this.spinning = false;
  }

  update(): void {
    // Cascades are driven by explicit tweens, so the Pixi ticker stays available
    // for future effects without owning the main state machine.
  }

  private buildBoard(): void {
    const boardW = this.cols * CELL_W + (this.cols - 1) * GAP + 42;
    const boardH = this.rows * CELL_H + (this.rows - 1) * GAP + 42;
    const background = new PIXI.Graphics();
    background.beginFill(0x0f172a, 0.96);
    background.lineStyle(2, 0x334155, 1);
    background.drawRoundedRect(-boardW / 2, -boardH / 2 + BOARD_OFFSET_Y, boardW, boardH, 10);
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
    this.buildJpOverlay();
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
    const background = new PIXI.Graphics();
    const label = new PIXI.Text(`Stage ${stage + 1}/3`, {
      fill: 0xdbeafe,
      fontFamily: 'Arial, sans-serif',
      fontSize: 13,
      fontWeight: '600',
    });
    const fill = new PIXI.Graphics();

    background.beginFill(0x111827, 0.94);
    background.lineStyle(2, family.accent, 0.92);
    background.drawRoundedRect(-POT_W / 2, -POT_H / 2, POT_W, POT_H, 8);
    background.endFill();
    background.beginFill(family.color, 0.28);
    background.drawRoundedRect(-POT_W / 2 + 8, -POT_H / 2 + 8, POT_W - 16, POT_H - 16, 6);
    background.endFill();

    fill.beginFill(family.accent, 0.9);
    fill.drawRoundedRect(-POT_W / 2 + 12, POT_H / 2 - 17, ((POT_W - 24) * (stage + 1)) / 3, 7, 3);
    fill.endFill();

    label.anchor.set(0.5, 0.5);
    label.position.set(0, 16);
    view.addChild(background, fill);

    const sprite = this.createFamilySprite(familyId, 'idle', stage);
    sprite.name = `${familyId}-character`;
    label.position.set(0, 25);
    view.addChild(sprite, label);
  }

  private createFamilySprite(
    familyId: PotFamilyId,
    mode: 'idle' | 'hit',
    stage: number,
  ): PIXI.AnimatedSprite {
    const textures = this.getTextures(this.familyFramePaths(familyId, mode, stage));
    const sprite = new PIXI.AnimatedSprite(textures);
    sprite.anchor.set(0.5, 0.5);
    sprite.animationSpeed = mode === 'idle' ? 0.08 : 0.18;
    sprite.loop = mode === 'idle';
    const size = this.potSpriteSize(familyId, stage);
    sprite.width = size;
    sprite.height = size;
    sprite.position.set(0, -8);
    if (mode === 'idle') {
      sprite.play();
    }
    return sprite;
  }

  private createEvolutionSprite(familyId: PotFamilyId, fromStage: number, toStage: number): PIXI.AnimatedSprite {
    const textures = this.getTextures(this.evolutionFramePaths(familyId, fromStage, toStage));
    const sprite = new PIXI.AnimatedSprite(textures);
    sprite.anchor.set(0.5);
    sprite.loop = false;
    sprite.animationSpeed = 0.16;
    const size = this.evolutionSpriteSize(familyId, toStage);
    sprite.width = size;
    sprite.height = size;
    sprite.position.set(0, -8);
    return sprite;
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
      fire: [54, 54, 64],
      water: [56, 62, 68],
      grass: [56, 62, 68],
    };
    return sizes[familyId][stage] ?? sizes[familyId][0];
  }

  private evolutionSpriteSize(familyId: PotFamilyId, toStage: number): number {
    const sizes: Record<PotFamilyId, number[]> = {
      fire: [0, 68, 80],
      water: [0, 70, 82],
      grass: [0, 70, 82],
    };
    return sizes[familyId][toStage] ?? this.potSpriteSize(familyId, toStage);
  }

  private async playFeatureEvents(events: FeatureEvent[]): Promise<void> {
    for (const event of events) {
      await this.flyPokeball(event);
      await this.playPotHit(event.familyId);

      if (event.type === 'jp') {
        this.setState('jp');
        await this.playJp(event);
        this.setState('feature');
      } else if (event.type === 'evolve') {
        await this.playFamilyEvolution(event.familyId, event.fromStage, event.toStage);
      } else {
        await this.pulsePot(event.familyId, 1.08, 260);
      }
    }
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

    const currentSprite = view.getChildByName(`${familyId}-character`) as PIXI.AnimatedSprite | undefined;
    const hitSprite = this.createFamilySprite(familyId, 'hit', this.potStages[familyId]);
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
    const evolution = this.createEvolutionSprite(familyId, fromStage, toStage);
    evolution.name = `${familyId}-evolution`;

    if (currentSprite) {
      currentSprite.visible = false;
    }
    view.addChild(evolution);

    await new Promise<void>((resolve) => {
      evolution.onComplete = () => resolve();
      evolution.gotoAndPlay(0);
    });

    view.removeChild(evolution);
    evolution.destroy({ children: true, texture: false, baseTexture: false });
    this.potStages[familyId] = Math.max(fromStage, toStage);
    this.renderPot(familyId);
    await this.pulsePot(familyId, 1.16, 320);
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
