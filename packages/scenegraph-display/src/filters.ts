import type { BlurFilter, DropShadowFilter, GlowFilter, ColorMatrixFilter } from '@flighthq/types';

export function createBlurFilter(blurX: number, blurY: number, passes: number = 1): BlurFilter {
  return { type: 'blur', blurX, blurY, passes };
}

export function createDropShadowFilter(
  distance: number = 4,
  angle: number = 45,
  color: number = 0x000000,
  alpha: number = 1,
  blurX: number = 4,
  blurY: number = 4,
  strength: number = 1,
  inner: boolean = false,
  hideObject: boolean = false,
  passes: number = 1,
): DropShadowFilter {
  return { type: 'dropShadow', distance, angle, color, alpha, blurX, blurY, strength, inner, hideObject, passes };
}

export function createGlowFilter(
  color: number = 0xff0000,
  alpha: number = 1,
  blurX: number = 6,
  blurY: number = 6,
  strength: number = 2,
  inner: boolean = false,
  passes: number = 1,
): GlowFilter {
  return { type: 'glow', color, alpha, blurX, blurY, strength, inner, passes };
}

export function createColorMatrixFilter(matrix: readonly number[]): ColorMatrixFilter {
  return { type: 'colorMatrix', matrix, passes: 1 };
}
