import * as PIXI from 'pixi.js';
import type { AssetStore } from '../core/AssetStore';
import { CascadeSpinAdapter } from './CascadeSpinAdapter';
import { SymbolView } from './SymbolView';
import type { CascadeStep, SlotState, SpinResult } from './types';

type SlotEvents = {
  onStateChange?: (state: SlotState) => void;
  onResult?: (result: SpinResult) => void;
};

const CELL_W = 118;
const CELL_H = 96;
const GAP = 10;

export class CascadeSlotMachine extends PIXI.Container {
  private readonly cells: SymbolView[][] = [];
  private readonly adapter: CascadeSpinAdapter;
  private readonly cols: number;
  private readonly rows: number;
  private readonly winOverlay = new PIXI.Graphics();
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

  async spin(result = this.adapter.next()): Promise<void> {
    if (this.spinning) {
      return;
    }

    this.spinning = true;
    this.setState('spinning');
    this.winOverlay.clear();

    const steps = result.cascades ?? [{ grid: result.grid, wins: [], win: result.win }];
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

    this.events.onResult?.(result);
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
    background.drawRoundedRect(-boardW / 2, -boardH / 2, boardW, boardH, 10);
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

    this.addChild(this.winOverlay);
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
    return (row - (this.rows - 1) / 2) * (CELL_H + GAP);
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

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
