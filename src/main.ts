import './styles.css';
import * as PIXI from 'pixi.js';
import { AssetStore } from './core/AssetStore';
import { GameApp } from './core/GameApp';
import { CascadeSlotMachine } from './slot/CascadeSlotMachine';
import type { SlotState, SpinResult } from './slot/types';

const root = requireElement<HTMLElement>('#game-root');
const spinButton = requireElement<HTMLButtonElement>('#spin-button');
const statusText = requireElement<HTMLElement>('#status');
const balanceText = requireElement<HTMLElement>('#balance');
const winText = requireElement<HTMLElement>('#win');
const betText = requireElement<HTMLElement>('#bet');

let balance = 1000;
let bet = 20;

void bootstrap();

async function bootstrap(): Promise<void> {
  const assets = new AssetStore();
  await assets.load();

  bet = assets.paytable.bet;
  balanceText.textContent = money(balance);
  betText.textContent = money(bet);

  const game = new GameApp(root);
  const slot = new CascadeSlotMachine(assets, game.app.renderer as PIXI.Renderer, {
    onStateChange: updateState,
    onResult: applyResult,
  });

  game.setScene(slot);
  game.app.ticker.add(() => slot.update());

  spinButton.addEventListener('click', () => {
    if (spinButton.disabled) {
      return;
    }

    balance -= bet;
    balanceText.textContent = money(balance);
    winText.textContent = money(0);
    void slot.spin();
  });
}

function updateState(state: SlotState): void {
  const labels: Record<SlotState, string> = {
    idle: 'Ready',
    spinning: 'Drop In',
    clearing: 'Clearing',
    dropping: 'Dropping',
    result: 'Matched',
    payout: 'Payout',
  };

  statusText.textContent = labels[state];
  spinButton.disabled = state !== 'idle';
}

function applyResult(result: SpinResult): void {
  balance += result.win;
  balanceText.textContent = money(balance);
  winText.textContent = money(result.win);
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required DOM node "${selector}"`);
  }
  return element;
}
