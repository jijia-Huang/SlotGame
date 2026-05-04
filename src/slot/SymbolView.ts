import * as PIXI from 'pixi.js';
import { SequenceAnimation } from '../animation/SequenceAnimation';
import type { AssetStore } from '../core/AssetStore';
import type { SymbolConfig } from './types';

export class SymbolView extends PIXI.Container {
  readonly size = { width: 108, height: 88 };

  private current?: PIXI.Container;
  private symbol?: SymbolConfig;

  get symbolId(): string | undefined {
    return this.symbol?.id;
  }

  constructor(
    private readonly assets: AssetStore,
    private readonly renderer: PIXI.Renderer,
  ) {
    super();
  }

  setSymbol(symbolId: string, mode: 'idle' | 'stop' = 'idle'): void {
    this.symbol = this.assets.getSymbol(symbolId);
    const sheet = this.assets.sequences.get(this.symbol.assetId);
    if (!sheet) {
      throw new Error(`Symbol "${symbolId}" references missing sequence asset "${this.symbol.assetId}"`);
    }

    const animationName = mode === 'stop' ? this.symbol.stopAnimation : this.symbol.idleAnimation;
    const animation = SequenceAnimation.create(this.renderer, sheet, animationName);
    this.replaceVisual(animation);
  }

  randomize(symbolIds: string[]): void {
    const next = symbolIds[Math.floor(Math.random() * symbolIds.length)];
    this.setSymbol(next, 'idle');
  }

  celebrate(): void {
    if (!this.symbol) {
      return;
    }
    this.setSymbol(this.symbol.id, 'stop');
  }

  private replaceVisual(display: PIXI.Container): void {
    if (this.current) {
      this.removeChild(this.current);
      this.current.destroy({ children: true, texture: false, baseTexture: false });
    }

    display.width = this.size.width;
    display.height = this.size.height;
    this.current = display;
    this.addChild(display);
  }
}
