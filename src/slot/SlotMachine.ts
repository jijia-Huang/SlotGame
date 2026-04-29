import * as PIXI from 'pixi.js';
import type { AssetStore } from '../core/AssetStore';
import { MockSpinAdapter } from './MockSpinAdapter';
import { Reel } from './Reel';
import type { SlotState, SpinResult } from './types';

type SlotEvents = {
  onStateChange?: (state: SlotState) => void;
  onResult?: (result: SpinResult) => void;
};

export class SlotMachine extends PIXI.Container {
  readonly reels: Reel[] = [];

  private readonly adapter: MockSpinAdapter;
  private state: SlotState = 'idle';
  private spinning = false;
  private winOverlay = new PIXI.Graphics();

  constructor(
    private readonly assets: AssetStore,
    renderer: PIXI.Renderer,
    private readonly events: SlotEvents = {},
  ) {
    super();

    this.adapter = new MockSpinAdapter([...assets.symbols.values()], assets.paytable);
    this.buildBoard(renderer);
  }

  async spin(result = this.adapter.next()): Promise<void> {
    if (this.spinning) {
      return;
    }

    this.spinning = true;
    this.setState('spinning');
    this.winOverlay.clear();
    this.reels.forEach((reel) => reel.start());

    for (const [index, reel] of this.reels.entries()) {
      await delay(480 + index * 170);
      this.setState('dropping');
      await reel.stopWith(result.grid[index]);
    }

    this.setState('result');
    this.drawWins(result);
    this.events.onResult?.(result);

    await delay(650);
    this.setState('payout');
    await delay(450);
    this.setState('idle');
    this.spinning = false;
  }

  update(): void {
    this.reels.forEach((reel) => reel.update());
  }

  private buildBoard(renderer: PIXI.Renderer): void {
    const background = new PIXI.Graphics();
    background.beginFill(0x0f172a, 0.96);
    background.lineStyle(2, 0x334155, 1);
    background.drawRoundedRect(-452, -270, 904, 520, 10);
    background.endFill();
    this.addChild(background);

    for (let reelIndex = 0; reelIndex < 5; reelIndex += 1) {
      const reel = new Reel(this.assets, renderer, reelIndex);
      reel.position.set(-320 + reelIndex * 160, 0);
      this.reels.push(reel);
      this.addChild(reel);
    }

    this.addChild(this.winOverlay);
  }

  private drawWins(result: SpinResult): void {
    const payline = this.assets.paytable.paylines?.find((line) => line.id === result.lines[0]?.lineId);
    if (!payline) {
      return;
    }

    this.winOverlay.lineStyle(8, 0xfacc15, 0.86);
    payline.rows.forEach((row, reelIndex) => {
      const x = -320 + reelIndex * 160;
      const y = (row - 1) * 138;
      if (reelIndex === 0) {
        this.winOverlay.moveTo(x, y);
      } else {
        this.winOverlay.lineTo(x, y);
      }
    });

    result.lines.forEach((line) => {
      const rows = payline.rows.slice(0, line.count);
      rows.forEach((row, reelIndex) => this.reels[reelIndex]?.highlightRows([row]));
    });
  }

  private setState(state: SlotState): void {
    this.state = state;
    this.events.onStateChange?.(state);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
