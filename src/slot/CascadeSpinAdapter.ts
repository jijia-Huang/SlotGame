import type { CascadeStep, CascadeWin, FeatureEvent, PaytableConfig, PokeballHit, PotFamilyId, SpinResult, SymbolConfig } from './types';

const POT_FAMILIES: PotFamilyId[] = ['fire', 'water', 'grass'];
const JP_MULTIPLIERS = [25, 50, 100];

export class CascadeSpinAdapter {
  private cursor = 0;

  constructor(
    private readonly symbols: SymbolConfig[],
    private readonly paytable: PaytableConfig,
  ) {}

  next(potStages: Record<PotFamilyId, number> = { fire: 0, water: 0, grass: 0 }): SpinResult {
    let grid = this.createOpeningGrid();
    const cascades: CascadeStep[] = [];
    let baseWin = 0;

    for (let guard = 0; guard < 5; guard += 1) {
      const wins = this.evaluate(grid);
      if (wins.length === 0) {
        break;
      }

      const win = wins.reduce((sum, item) => sum + item.amount, 0);
      baseWin += win;
      cascades.push({ grid: cloneGrid(grid), wins, win });
      grid = this.collapseAndRefill(grid, wins);
    }

    cascades.push({ grid: cloneGrid(grid), wins: [], win: 0 });
    const pokeballs = this.collectPokeballs(grid);
    const featureEvents = this.createFeatureEvents(pokeballs, potStages);
    const featureWin = featureEvents.reduce((sum, event) => sum + event.jpWin, 0);
    const totalWin = baseWin + featureWin;
    this.cursor += 1;

    return {
      grid,
      lines: [],
      cascades,
      win: totalWin,
      baseWin,
      featureWin,
      totalWin,
      pokeballs,
      featureEvents,
    };
  }

  private createOpeningGrid(): string[][] {
    const symbolIds = this.symbols.map((symbol) => symbol.id);
    const grid = Array.from({ length: this.paytable.cols }, (_, col) =>
      Array.from({ length: this.paytable.rows }, (_, row) => symbolIds[(this.cursor + col * 2 + row) % symbolIds.length]),
    );

    const forcedSymbol = this.cursor % 2 === 0 ? 'fire_emblem' : 'potion';
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

    const ballPositions = [
      [this.cursor % this.paytable.cols, (this.cursor + 2) % this.paytable.rows],
      [(this.cursor + 3) % this.paytable.cols, (this.cursor + 4) % this.paytable.rows],
    ];

    ballPositions.forEach(([col, row], index) => {
      if ((this.cursor + index) % 3 !== 1) {
        grid[col][row] = 'pokeball';
      }
    });

    return grid;
  }

  private evaluate(grid: string[][]): CascadeWin[] {
    const positionsBySymbol = new Map<string, Array<{ col: number; row: number }>>();
    const paySymbolIds = new Set(this.symbols.filter((symbol) => symbol.kind === 'pay').map((symbol) => symbol.id));

    grid.forEach((column, col) => {
      column.forEach((symbolId, row) => {
        if (!paySymbolIds.has(symbolId)) {
          return;
        }
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

  private collectPokeballs(grid: string[][]): PokeballHit[] {
    const hits: PokeballHit[] = [];

    grid.forEach((column, col) => {
      column.forEach((symbolId, row) => {
        if (symbolId !== 'pokeball') {
          return;
        }

        const familyId = POT_FAMILIES[(this.cursor + col + row + hits.length) % POT_FAMILIES.length];
        hits.push({ position: { col, row }, familyId });
      });
    });

    return hits;
  }

  private createFeatureEvents(pokeballs: PokeballHit[], potStages: Record<PotFamilyId, number>): FeatureEvent[] {
    const simulatedStages: Record<PotFamilyId, number> = { ...potStages };

    return pokeballs.map((hit, index) => {
      const roll = pseudoRoll(this.cursor, hit.position.col, hit.position.row, index);
      const fromStage = simulatedStages[hit.familyId];

      if (roll < 0.2) {
        return {
          type: 'jp',
          familyId: hit.familyId,
          fromStage,
          toStage: fromStage,
          jpWin: this.paytable.bet * JP_MULTIPLIERS[fromStage],
          position: hit.position,
        };
      }

      if (roll < 0.55 && fromStage < 2) {
        simulatedStages[hit.familyId] = fromStage + 1;
        return {
          type: 'evolve',
          familyId: hit.familyId,
          fromStage,
          toStage: fromStage + 1,
          jpWin: 0,
          position: hit.position,
        };
      }

      return {
        type: 'charge',
        familyId: hit.familyId,
        fromStage,
        toStage: fromStage,
        jpWin: 0,
        position: hit.position,
      };
    });
  }
}

function cloneGrid(grid: string[][]): string[][] {
  return grid.map((column) => [...column]);
}

function key(col: number, row: number): string {
  return `${col}:${row}`;
}

function pseudoRoll(cursor: number, col: number, row: number, index: number): number {
  const value = Math.sin((cursor + 1) * 91.17 + col * 13.53 + row * 41.91 + index * 7.31) * 10000;
  return value - Math.floor(value);
}
