import type { CascadeStep, CascadeWin, PaytableConfig, SpinResult, SymbolConfig } from './types';

export class CascadeSpinAdapter {
  private cursor = 0;

  constructor(
    private readonly symbols: SymbolConfig[],
    private readonly paytable: PaytableConfig,
  ) {}

  next(): SpinResult {
    let grid = this.createOpeningGrid();
    const cascades: CascadeStep[] = [];
    let totalWin = 0;

    for (let guard = 0; guard < 5; guard += 1) {
      const wins = this.evaluate(grid);
      if (wins.length === 0) {
        break;
      }

      const win = wins.reduce((sum, item) => sum + item.amount, 0);
      totalWin += win;
      cascades.push({ grid: cloneGrid(grid), wins, win });
      grid = this.collapseAndRefill(grid, wins);
    }

    cascades.push({ grid: cloneGrid(grid), wins: [], win: 0 });
    this.cursor += 1;

    return {
      grid,
      lines: [],
      cascades,
      win: totalWin,
    };
  }

  private createOpeningGrid(): string[][] {
    const symbolIds = this.symbols.map((symbol) => symbol.id);
    const grid = Array.from({ length: this.paytable.cols }, (_, col) =>
      Array.from({ length: this.paytable.rows }, (_, row) => symbolIds[(this.cursor + col * 2 + row) % symbolIds.length]),
    );

    const forcedSymbol = this.cursor % 2 === 0 ? 'eye' : 'gem_green';
    const forcedPositions = this.cursor % 2 === 0
      ? [
          [0, 0], [1, 0], [2, 0], [4, 0],
          [0, 2], [2, 2], [3, 2], [5, 2],
          [1, 4], [4, 4],
        ]
      : [
          [0, 1], [1, 1], [2, 1], [3, 1],
          [2, 3], [3, 3], [4, 3], [5, 3],
        ];

    forcedPositions.forEach(([col, row]) => {
      grid[col][row] = forcedSymbol;
    });

    return grid;
  }

  private evaluate(grid: string[][]): CascadeWin[] {
    const positionsBySymbol = new Map<string, Array<{ col: number; row: number }>>();

    grid.forEach((column, col) => {
      column.forEach((symbolId, row) => {
        const positions = positionsBySymbol.get(symbolId) ?? [];
        positions.push({ col, row });
        positionsBySymbol.set(symbolId, positions);
      });
    });

    return [...positionsBySymbol.entries()].flatMap(([symbolId, positions]) => {
      if (positions.length < this.paytable.minMatch) {
        return [];
      }

      const payoutKey = positions.length >= 12 ? '12' : positions.length >= 10 ? '10' : '8';
      const amount = (this.paytable.payouts[symbolId]?.[payoutKey] ?? 0) * this.paytable.bet;
      if (amount <= 0) {
        return [];
      }

      return [{ symbolId, count: positions.length, amount, positions }];
    });
  }

  private collapseAndRefill(grid: string[][], wins: CascadeWin[]): string[][] {
    const removed = new Set(wins.flatMap((win) => win.positions.map((position) => key(position.col, position.row))));
    const nextSymbolIds = this.symbols.map((symbol) => symbol.id);

    return grid.map((column, col) => {
      const survivors = column.filter((_symbolId, row) => !removed.has(key(col, row)));
      const refillCount = this.paytable.rows - survivors.length;
      const refill = Array.from({ length: refillCount }, (_, index) => {
        const pick = (this.cursor + col + index * 3 + refillCount) % nextSymbolIds.length;
        return nextSymbolIds[pick];
      });
      return [...refill, ...survivors];
    });
  }
}

function cloneGrid(grid: string[][]): string[][] {
  return grid.map((column) => [...column]);
}

function key(col: number, row: number): string {
  return `${col}:${row}`;
}
