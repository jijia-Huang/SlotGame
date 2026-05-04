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
    if (animationName.endsWith('_idle')) {
      sprite.gotoAndStop(0);
    } else {
      sprite.play();
    }
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
    const icon = createSymbolTile(sheet, animationName, frame.fill, frame.accent, index);

    container.addChild(icon);
    return renderer.generateTexture(container, PIXI.SCALE_MODES.LINEAR, 1);
  });
}

function createSymbolTile(
  sheet: SequenceSheetConfig,
  animationName: string,
  fill: string,
  accent: string,
  frameIndex: number,
): PIXI.Container {
  const tile = new PIXI.Container();
  const background = new PIXI.Graphics();
  const bevel = new PIXI.Graphics();
  const icon = new PIXI.Graphics();
  const width = sheet.frameWidth;
  const height = sheet.frameHeight;
  const fillColor = PIXI.utils.string2hex(fill);
  const accentColor = PIXI.utils.string2hex(accent);
  const pulse = frameIndex % 2 === 0 ? 0 : 2;

  background.beginFill(0x24314a, 0.86);
  background.drawRoundedRect(1, 5, width - 2, height - 4, 5);
  background.endFill();
  background.beginFill(0xf8fafc, 0.96);
  background.drawRoundedRect(3, 1, width - 6, height - 9, 5);
  background.endFill();
  background.beginFill(fillColor);
  background.drawRoundedRect(8, 6, width - 16, height - 18, 4);
  background.endFill();

  bevel.lineStyle(4, lighten(fillColor, 0.42), 0.92);
  bevel.moveTo(13, 12);
  bevel.lineTo(width - 13, 12);
  bevel.moveTo(13, 12);
  bevel.lineTo(13, height - 19);
  bevel.lineStyle(4, darken(fillColor, 0.36), 0.84);
  bevel.moveTo(13, height - 18);
  bevel.lineTo(width - 13, height - 18);
  bevel.lineTo(width - 13, 13);

  icon.position.set(width / 2, height / 2 - 4 + pulse);
  drawSymbolIcon(icon, animationName, accentColor);

  tile.addChild(background, bevel, icon);
  return tile;
}

function drawSymbolIcon(icon: PIXI.Graphics, animationName: string, accentColor: number): void {
  if (animationName.startsWith('fire_emblem')) {
    drawFireIcon(icon);
  } else if (animationName.startsWith('water_shell')) {
    drawWaterIcon(icon);
  } else if (animationName.startsWith('grass_leaf')) {
    drawLeafIcon(icon);
  } else if (animationName.startsWith('berry')) {
    drawBerryIcon(icon);
  } else if (animationName.startsWith('potion')) {
    drawPotionIcon(icon);
  } else if (animationName.startsWith('pokeball')) {
    drawPokeballIcon(icon, accentColor);
  }
}

function drawFireIcon(g: PIXI.Graphics): void {
  g.lineStyle(4, 0x5b1a08, 0.95);
  g.beginFill(0xfff1a6);
  g.moveTo(1, 28);
  g.bezierCurveTo(-34, 8, -18, -12, -6, -26);
  g.bezierCurveTo(-4, -11, 12, -10, 10, -36);
  g.bezierCurveTo(34, -13, 30, 14, 1, 28);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(0xf97316);
  g.moveTo(1, 20);
  g.bezierCurveTo(-17, 8, -8, -8, 0, -17);
  g.bezierCurveTo(4, -8, 14, -6, 12, -22);
  g.bezierCurveTo(24, -8, 21, 10, 1, 20);
  g.endFill();
}

function drawWaterIcon(g: PIXI.Graphics): void {
  g.lineStyle(4, 0x064e7a, 0.96);
  g.beginFill(0xcffafe);
  g.moveTo(0, -34);
  g.bezierCurveTo(-25, -4, -30, 18, 0, 31);
  g.bezierCurveTo(30, 18, 25, -4, 0, -34);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(0x38bdf8, 0.84);
  g.drawEllipse(6, 11, 15, 18);
  g.endFill();
}

function drawLeafIcon(g: PIXI.Graphics): void {
  g.lineStyle(4, 0x14532d, 0.96);
  g.beginFill(0xbbf7d0);
  g.moveTo(-31, 18);
  g.bezierCurveTo(-13, -31, 24, -30, 34, -23);
  g.bezierCurveTo(30, 7, 9, 25, -31, 18);
  g.endFill();
  g.lineStyle(3, 0x166534, 0.82);
  g.moveTo(-24, 15);
  g.lineTo(27, -20);
  g.moveTo(-3, 1);
  g.lineTo(1, -17);
  g.moveTo(8, -7);
  g.lineTo(23, -4);
}

function drawBerryIcon(g: PIXI.Graphics): void {
  g.lineStyle(4, 0x7f1d1d, 0.96);
  g.beginFill(0xff5f74);
  g.drawCircle(-6, 2, 26);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(0xbe123c);
  g.drawCircle(5, 9, 18);
  g.endFill();
  g.beginFill(0xfef08a);
  g.drawCircle(-16, -9, 5);
  g.endFill();
  g.lineStyle(3, 0x14532d, 0.9);
  g.beginFill(0x86efac);
  g.drawEllipse(5, -28, 9, 17);
  g.drawEllipse(19, -21, 13, 7);
  g.endFill();
}

function drawPotionIcon(g: PIXI.Graphics): void {
  g.lineStyle(4, 0x3b0764, 0.95);
  g.beginFill(0xf5f3ff);
  g.drawRoundedRect(-15, -34, 30, 13, 3);
  g.drawRoundedRect(-24, -22, 48, 52, 13);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(0xa78bfa);
  g.drawRoundedRect(-17, -6, 34, 27, 9);
  g.endFill();
  g.beginFill(0xffffff, 0.85);
  g.drawEllipse(-8, -13, 7, 11);
  g.endFill();
}

function drawPokeballIcon(g: PIXI.Graphics, accentColor: number): void {
  g.lineStyle(4, 0x111827, 0.96);
  g.beginFill(0xf8fafc);
  g.drawCircle(0, 0, 32);
  g.endFill();
  g.beginFill(accentColor === 0xffffff ? 0xef4444 : accentColor);
  g.arc(0, 0, 32, Math.PI, 0);
  g.lineTo(32, 0);
  g.lineTo(-32, 0);
  g.endFill();
  g.lineStyle(4, 0x111827, 0.96);
  g.moveTo(-31, 0);
  g.lineTo(31, 0);
  g.beginFill(0xf8fafc);
  g.drawCircle(0, 0, 10);
  g.endFill();
}

function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (color & 0xff) + Math.round(255 * amount));
  return (r << 16) + (g << 8) + b;
}

function darken(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((color >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (color & 0xff) - Math.round(255 * amount));
  return (r << 16) + (g << 8) + b;
}
