import type { AssetsManifest, PaytableConfig, SequenceSheetConfig, SymbolConfig } from '../slot/types';

export class AssetStore {
  readonly sequences = new Map<string, SequenceSheetConfig>();
  readonly symbols = new Map<string, SymbolConfig>();

  manifest!: AssetsManifest;
  paytable!: PaytableConfig;

  async load(): Promise<void> {
    const [manifest, symbols, paytable] = await Promise.all([
      this.fetchJson<AssetsManifest>('/assets/config/assets.manifest.json'),
      this.fetchJson<SymbolConfig[]>('/assets/config/symbols.json'),
      this.fetchJson<PaytableConfig>('/assets/config/paytable.json'),
    ]);

    this.manifest = manifest;
    this.paytable = paytable;
    symbols.forEach((symbol) => this.symbols.set(symbol.id, symbol));

    const sequenceConfigs = await Promise.all(
      manifest.sequences.map(async (entry) => [entry.id, await this.fetchJson<SequenceSheetConfig>(entry.src)] as const),
    );
    sequenceConfigs.forEach(([id, config]) => this.sequences.set(id, config));
  }

  getSymbol(id: string): SymbolConfig {
    const symbol = this.symbols.get(id);
    if (!symbol) {
      throw new Error(`Unknown symbol "${id}"`);
    }
    return symbol;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}
