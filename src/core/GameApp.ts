import * as PIXI from 'pixi.js';

export class GameApp {
  readonly app: PIXI.Application;
  readonly stage: PIXI.Container;

  private readonly root: HTMLElement;
  private resizeObserver?: ResizeObserver;

  constructor(root: HTMLElement) {
    this.root = root;
    this.app = new PIXI.Application({
      backgroundColor: 0x111827,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: root,
    });

    this.stage = this.app.stage;
    this.root.appendChild(this.app.view as HTMLCanvasElement);
    this.watchResize();
  }

  setScene(scene: PIXI.Container): void {
    this.stage.removeChildren();
    this.stage.addChild(scene);
    this.layoutScene(scene);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
  }

  private watchResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      const scene = this.stage.children[0];
      if (scene instanceof PIXI.Container) {
        this.layoutScene(scene);
      }
    });
    this.resizeObserver.observe(this.root);
  }

  private layoutScene(scene: PIXI.Container): void {
    const width = this.app.renderer.width / this.app.renderer.resolution;
    const height = this.app.renderer.height / this.app.renderer.resolution;
    scene.position.set(width / 2, height / 2 - 24);
  }
}
