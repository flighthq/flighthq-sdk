export interface BitmapFilter {
  readonly passes: number;
}

export interface BlurFilter extends BitmapFilter {
  readonly type: 'blur';
  readonly blurX: number;
  readonly blurY: number;
}

export interface DropShadowFilter extends BitmapFilter {
  readonly type: 'dropShadow';
  readonly blurX: number;
  readonly blurY: number;
  readonly distance: number;
  readonly angle: number;
  readonly color: number;
  readonly alpha: number;
  readonly strength: number;
  readonly inner: boolean;
  readonly hideObject: boolean;
}

export interface GlowFilter extends BitmapFilter {
  readonly type: 'glow';
  readonly blurX: number;
  readonly blurY: number;
  readonly color: number;
  readonly alpha: number;
  readonly strength: number;
  readonly inner: boolean;
}

export interface ColorMatrixFilter extends BitmapFilter {
  readonly type: 'colorMatrix';
  readonly matrix: readonly number[];
}

export type Filter = BlurFilter | DropShadowFilter | GlowFilter | ColorMatrixFilter;
