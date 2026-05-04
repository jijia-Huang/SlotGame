export type SlotState =
  | 'idle'
  | 'spinning'
  | 'clearing'
  | 'dropping'
  | 'result'
  | 'feature'
  | 'jp'
  | 'payout'
  | 'transition'
  | 'battle'
  | 'capture'
  | 'battlePayout';

export type BattleAwardTier = 'MINI' | 'MINOR' | 'MAJOR' | 'GRAND';

export interface BattleAward {
  tier: BattleAwardTier;
  multiplier: number;
  amount: number;
}

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

export type PotFamilyId = 'fire' | 'water' | 'grass';

export type FeatureEventType = 'charge' | 'evolve' | 'jp';

export interface PokeballHit {
  position: GridPosition;
  familyId: PotFamilyId;
}

export interface FeatureEvent {
  type: FeatureEventType;
  familyId: PotFamilyId;
  fromStage: number;
  toStage: number;
  jpWin: number;
  position: GridPosition;
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
  baseWin: number;
  featureWin: number;
  totalWin: number;
  pokeballs: PokeballHit[];
  featureEvents: FeatureEvent[];
  lines: SpinLine[];
  cascades?: CascadeStep[];
}

export interface SymbolConfig {
  id: string;
  label: string;
  kind: 'pay' | 'special';
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
