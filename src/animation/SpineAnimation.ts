import * as PIXI from 'pixi.js';
import '@pixi-spine/all-3.8';

export interface SpineAssetConfig {
  id: string;
  skeleton: string;
  atlas: string;
}

export class SpineAnimation extends PIXI.Container {
  private spine?: PIXI.Container & {
    state?: {
      setAnimation: (trackIndex: number, animationName: string, loop: boolean) => unknown;
    };
  };

  static async load(config: SpineAssetConfig, animationName = 'idle'): Promise<SpineAnimation> {
    const view = new SpineAnimation();
    await view.loadInto(config, animationName);
    return view;
  }

  play(animationName: string, loop = true): void {
    this.spine?.state?.setAnimation(0, animationName, loop);
  }

  private async loadInto(config: SpineAssetConfig, animationName: string): Promise<void> {
    const resource = await loadSpineResource(config);
    const SpineCtor = (PIXI as unknown as { spine?: { Spine?: new (data: unknown) => PIXI.Container } }).spine?.Spine;

    if (!SpineCtor || !resource.spineData) {
      throw new Error(`Spine runtime could not create "${config.id}". Check Pixi/Spine 3.8 compatibility and assets.`);
    }

    const spine = new SpineCtor(resource.spineData) as PIXI.Container & {
      state?: {
        setAnimation: (trackIndex: number, animationName: string, loop: boolean) => unknown;
      };
    };
    spine.scale.set(0.55);
    this.spine = spine;
    this.addChild(spine);
    this.play(animationName, true);
  }
}

function loadSpineResource(config: SpineAssetConfig): Promise<{ spineData?: unknown }> {
  return new Promise((resolve, reject) => {
    const loader = new PIXI.Loader();
    const addSpineResource = loader.add as unknown as (
      name: string,
      url: string,
      options: { metadata: PIXI.IResourceMetadata },
    ) => PIXI.Loader;
    addSpineResource(config.id, config.skeleton, {
      metadata: { spineAtlasFile: config.atlas } as PIXI.IResourceMetadata,
    });
    loader.load((_loader, resources) => resolve(resources[config.id] as { spineData?: unknown }));
    loader.onError.once((_error, _loader, resource) => {
      reject(new Error(`Failed to load Spine asset "${config.id}" from ${resource?.url ?? config.skeleton}`));
    });
  });
}
