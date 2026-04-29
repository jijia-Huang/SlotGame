import * as PIXI from 'pixi.js';
import type { SequenceAnimationConfig, SequenceSheetConfig } from '../slot/types';

const textureCache = new Map<string, PIXI.Texture[]>();

export class SequenceAnimation extends PIXI.AnimatedSprite {
  static create(renderer: PIXI.Renderer, sheet: SequenceSheetConfig, animationName: string): SequenceAnimation {
    const animation = sheet.animations[animationName];
    if (!animation) {
      throw new Error(`Sequence "${sheet.id}" is missing animation "${animationName}"`);
    }

    const cacheKey = `${sheet.id}:${animationName}`;
    let textures = textureCache.get(cacheKey);
    if (!textures) {
      textures = buildTextures(renderer, sheet, animationName, animation);
      textureCache.set(cacheKey, textures);
    }

    const sprite = new SequenceAnimation(textures);
    sprite.animationSpeed = animation.fps / 60;
    sprite.loop = animation.loop;
    sprite.anchor.set(0.5);
    sprite.play();
    return sprite;
  }
}

function buildTextures(
  renderer: PIXI.Renderer,
  sheet: SequenceSheetConfig,
  animationName: string,
  animation: SequenceAnimationConfig,
): PIXI.Texture[] {
  return animation.frames.map((frame, index) => {
    const container = new PIXI.Container();
    const background = new PIXI.Graphics();
    const accent = new PIXI.Graphics();
    const label = new PIXI.Text(frame.label, {
      fill: 0xffffff,
      fontFamily: 'Arial, sans-serif',
      fontSize: 34,
      fontWeight: '700',
      align: 'center',
    });

    background.beginFill(PIXI.utils.string2hex(frame.fill));
    background.drawRoundedRect(0, 0, sheet.frameWidth, sheet.frameHeight, 16);
    background.endFill();

    accent.lineStyle(6, PIXI.utils.string2hex(frame.accent), 0.92);
    accent.drawRoundedRect(10 + index * 2, 10, sheet.frameWidth - 20, sheet.frameHeight - 20, 12);

    label.anchor.set(0.5);
    label.position.set(sheet.frameWidth / 2, sheet.frameHeight / 2);

    container.addChild(background, accent, label);
    return renderer.generateTexture(container, PIXI.SCALE_MODES.LINEAR, 1);
  });
}
