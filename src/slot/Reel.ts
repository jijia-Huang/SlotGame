import * as PIXI from 'pixi.js';
import type { AssetStore } from '../core/AssetStore';
import { SymbolView } from './SymbolView';

const ROWS = 3;
const ROW_GAP = 18;
const SYMBOL_HEIGHT = 120;
const STEP_Y = SYMBOL_HEIGHT + ROW_GAP;

export class Reel extends PIXI.Container {
  readonly symbols: SymbolView[] = [];

  private readonly symbolIds: string[];
  private speed = 0;
  private spinning = false;
  private targetSymbols: string[] = [];

  constructor(
    assets: AssetStore,
    renderer: PIXI.Renderer,
    index: number,
  ) {
    super();
    this.symbolIds = [...assets.symbols.keys()];

    const frame = new PIXI.Graphics();
    frame.beginFill(index % 2 === 0 ? 0x192235 : 0x202a3f, 0.92);
    frame.drawRoundedRect(-78, -220, 156, 440, 8);
    frame.endFill();
    this.addChild(frame);

    for (let row = 0; row < ROWS; row += 1) {
      const symbol = new SymbolView(assets, renderer);
      symbol.position.set(0, (row - 1) * STEP_Y);
      symbol.setSymbol(this.symbolIds[(index + row) % this.symbolIds.length]);
      this.symbols.push(symbol);
      this.addChild(symbol);
    }
  }

  start(): void {
    this.spinning = true;
    this.speed = 42;
  }

  stopWith(targetSymbols: string[]): Promise<void> {
    this.targetSymbols = targetSymbols;
    return new Promise((resolve) => {
      const slowDown = () => {
        this.speed *= 0.78;
        if (this.speed <= 4) {
          this.spinning = false;
          this.snapToTarget();
          resolve();
          return;
        }
        window.setTimeout(slowDown, 60);
      };
      slowDown();
    });
  }

  update(): void {
    if (!this.spinning) {
      return;
    }

    for (const symbol of this.symbols) {
      symbol.y += this.speed;
      if (symbol.y > STEP_Y * 1.5) {
        symbol.y -= STEP_Y * ROWS;
        symbol.randomize(this.symbolIds);
      }
    }
  }

  highlightRows(rows: number[]): void {
    rows.forEach((row) => this.symbols[row]?.celebrate());
  }

  private snapToTarget(): void {
    this.symbols.forEach((symbol, row) => {
      symbol.position.set(0, (row - 1) * STEP_Y);
      symbol.setSymbol(this.targetSymbols[row], 'stop');
    });
  }
}
