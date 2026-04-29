export type SlotState = 'idle' | 'spinning' | 'clearing' | 'dropping' | 'result' | 'payout';

export interface SpinLine {
  lineId: string;
  symbolId: string;
  count: number;
  amount: number;
}

export interface GridPosition {
  col: number;
  row: number;
}

export interface CascadeWin {
  symbolId: string;
  count: number;
  amount: number;
  positions: GridPosition[];
}

export interface CascadeStep {
  grid: string[][];
  wins: CascadeWin[];
  win: number;
}

export interface SpinResult {
  grid: string[][];
  win: number;
  lines: SpinLine[];
  cascades?: CascadeStep[];
}

export interface SymbolConfig {
  id: string;
  label: string;
  assetId: string;
  idleAnimation: string;
  stopAnimation: string;
  weight: number;
}

export interface PaylineConfig {
  id: string;
  rows: number[];
}

export interface PaytableConfig {
  bet: number;
  cols: number;
  rows: number;
  minMatch: number;
  paylines?: PaylineConfig[];
  payouts: Record<string, Record<string, number>>;
}

export interface SequenceFrameConfig {
  label: string;
  fill: string;
  accent: string;
}

export interface SequenceAnimationConfig {
  fps: number;
  loop: boolean;
  frames: SequenceFrameConfig[];
}

export interface SequenceSheetConfig {
  id: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, SequenceAnimationConfig>;
}

export interface AssetsManifest {
  sequences: Array<{
    id: string;
    type: 'sequence';
    src: string;
  }>;
  spines: Array<{
    id: string;
    type: 'spine';
    skeleton: string;
    atlas: string;
  }>;
}
