import type { PaytableConfig, SpinLine, SpinResult, SymbolConfig } from './types';

export class MockSpinAdapter {
  private cursor = 0;

  constructor(
    private readonly symbols: SymbolConfig[],
    private readonly paytable: PaytableConfig,
  ) {}

  next(): SpinResult {
    const symbolIds = this.symbols.map((symbol) => symbol.id);
    const grid = Array.from({ length: 5 }, (_, reelIndex) =>
      Array.from({ length: 3 }, (_, rowIndex) => symbolIds[(this.cursor + reelIndex + rowIndex) % symbolIds.length]),
    );

    if (this.cursor % 2 === 0) {
      grid[0][1] = 'seven';
      grid[1][1] = 'seven';
      grid[2][1] = 'seven';
    }

    this.cursor += 1;
    const lines = this.evaluate(grid);
    return {
      grid,
      lines,
      win: lines.reduce((sum, line) => sum + line.amount, 0),
    };
  }

  private evaluate(grid: string[][]): SpinLine[] {
    return (this.paytable.paylines ?? []).flatMap((payline) => {
      const ids = payline.rows.map((row, reel) => grid[reel][row]);
      const symbolId = ids[0];
      const count = ids.findIndex((id) => id !== symbolId);
      const matchCount = count === -1 ? ids.length : count;
      const amount = this.paytable.payouts[symbolId]?.[String(matchCount)] ?? 0;

      if (amount <= 0) {
        return [];
      }

      return [{
        lineId: payline.id,
        symbolId,
        count: matchCount,
        amount: amount * this.paytable.bet,
      }];
    });
  }
}
