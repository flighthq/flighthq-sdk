import { getDisplayObjectRenderNode } from '@flighthq/render-core';
import { getWorldBoundsRect } from '@flighthq/scenegraph-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type {
  BlurFilter,
  CanvasRenderState,
  DisplayObject,
  DisplayObjectRenderNode,
  DropShadowFilter,
  Filter,
  GlowFilter,
} from '@flighthq/types';

import type { CanvasRenderStateInternal } from './internal';
import { setCanvasBlendMode } from './canvasMaterials';

export interface CacheRenderResult {
  canvas: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
}

interface CacheRecord {
  contentCanvas: HTMLCanvasElement;
  contentCtx: CanvasRenderingContext2D;
  filteredCanvas: HTMLCanvasElement;
  filteredCtx: CanvasRenderingContext2D;
  result: CacheRenderResult;
}

const _cacheMap = new WeakMap<DisplayObjectRenderNode, CacheRecord>();

// Module-level scratch arrays — safe because caching is not reentrant (allowCacheAsBitmap = false in sub-pass)
const _walkStack: DisplayObject[] = [];
const _patchedNodes: DisplayObjectRenderNode[] = [];
const _patchedTx: number[] = [];
const _patchedTy: number[] = [];

export function drawCanvasCacheResult(
  state: CanvasRenderState,
  data: DisplayObjectRenderNode,
  result: CacheRenderResult,
): void {
  const ctx = state.context;
  setCanvasBlendMode(state, data.blendMode);
  ctx.globalAlpha = data.alpha;
  ctx.setTransform(1, 0, 0, 1, result.offsetX, result.offsetY);
  ctx.drawImage(result.canvas, 0, 0);
}

export function updateCanvasCacheBitmap(
  state: CanvasRenderState,
  data: DisplayObjectRenderNode,
): CacheRenderResult | null {
  const source = data.source;
  const hasFilters = source.filters !== null && source.filters.length > 0;
  if (!source.cacheAsBitmap && !hasFilters) return null;

  const wBounds = getWorldBoundsRect(source);
  if (wBounds.width <= 0 || wBounds.height <= 0) return null;

  const { padL, padR, padT, padB } = computeFilterPadding(source.filters as Filter[] | null);

  const contentW = Math.ceil(wBounds.width);
  const contentH = Math.ceil(wBounds.height);
  const filteredW = contentW + padL + padR;
  const filteredH = contentH + padT + padB;

  let record = _cacheMap.get(data);
  if (!record) {
    const contentCanvas = document.createElement('canvas');
    const filteredCanvas = document.createElement('canvas');
    record = {
      contentCanvas,
      contentCtx: contentCanvas.getContext('2d')!,
      filteredCanvas,
      filteredCtx: filteredCanvas.getContext('2d')!,
      result: { canvas: filteredCanvas, offsetX: 0, offsetY: 0 },
    };
    _cacheMap.set(data, record);
  }

  if (record.contentCanvas.width !== contentW) record.contentCanvas.width = contentW;
  if (record.contentCanvas.height !== contentH) record.contentCanvas.height = contentH;
  if (record.filteredCanvas.width !== filteredW) record.filteredCanvas.width = filteredW;
  if (record.filteredCanvas.height !== filteredH) record.filteredCanvas.height = filteredH;
  record.contentCtx.clearRect(0, 0, contentW, contentH);
  record.filteredCtx.clearRect(0, 0, filteredW, filteredH);

  // Shift world-space transforms so content starts at (0,0) on contentCanvas
  const dx = -wBounds.x;
  const dy = -wBounds.y;

  // Collect render nodes and offset transforms
  let patchCount = 0;
  let walkLen = 0;
  _walkStack[walkLen++] = source;
  while (walkLen > 0) {
    const obj = _walkStack[--walkLen] as DisplayObject;
    if (!obj.enabled) continue;
    const n = getDisplayObjectRenderNode(state, obj);
    _patchedNodes[patchCount] = n;
    _patchedTx[patchCount] = n.transform2D.tx;
    _patchedTy[patchCount] = n.transform2D.ty;
    n.transform2D.tx += dx;
    n.transform2D.ty += dy;
    patchCount++;
    const children = getDisplayObjectRuntime(obj).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        _walkStack[walkLen++] = children[i] as DisplayObject;
      }
    }
  }

  // Swap context to content canvas, disable caching to prevent recursion
  const internal = state as CanvasRenderStateInternal;
  const prevCtx = internal.context;
  const prevAllowCache = state.allowCacheAsBitmap;
  internal.context = record.contentCtx;
  state.allowCacheAsBitmap = false;

  // Draw pass: render each visible node directly (no mask or nested cache support)
  walkLen = 0;
  _walkStack[walkLen++] = source;
  const currentFrameID = state.currentFrameID;
  while (walkLen > 0) {
    const obj = _walkStack[--walkLen] as DisplayObject;
    if (!obj.enabled) continue;
    const n = getDisplayObjectRenderNode(state, obj);
    if (
      n.isMaskFrameID !== currentFrameID &&
      n.visible &&
      n.alpha > 0 &&
      (n.transform2D.a !== 0 || n.transform2D.d !== 0) &&
      n.renderer !== null
    ) {
      n.renderer.draw(state, n);
    }
    const children = getDisplayObjectRuntime(obj).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        _walkStack[walkLen++] = children[i] as DisplayObject;
      }
    }
  }

  // Restore context and caching flag
  internal.context = prevCtx;
  state.allowCacheAsBitmap = prevAllowCache;

  // Restore transform offsets
  for (let i = 0; i < patchCount; i++) {
    _patchedNodes[i].transform2D.tx = _patchedTx[i];
    _patchedNodes[i].transform2D.ty = _patchedTy[i];
  }

  // Apply filters: draw contentCanvas into filteredCanvas with CSS filter
  if (hasFilters) {
    const cssFilter = computeCSSFilter(source.filters as Filter[]);
    if (cssFilter !== 'none') record.filteredCtx.filter = cssFilter;
    record.filteredCtx.drawImage(record.contentCanvas, padL, padT);
    if (cssFilter !== 'none') record.filteredCtx.filter = 'none';
    record.result.canvas = record.filteredCanvas;
    record.result.offsetX = Math.round(wBounds.x) - padL;
    record.result.offsetY = Math.round(wBounds.y) - padT;
  } else {
    record.result.canvas = record.contentCanvas;
    record.result.offsetX = Math.round(wBounds.x);
    record.result.offsetY = Math.round(wBounds.y);
  }

  return record.result;
}

function computeFilterPadding(
  filters: readonly Filter[] | null,
): { padL: number; padR: number; padT: number; padB: number } {
  let padL = 0,
    padR = 0,
    padT = 0,
    padB = 0;
  if (!filters) return { padL, padR, padT, padB };
  for (const f of filters) {
    switch (f.type) {
      case 'blur': {
        const bf = f as BlurFilter;
        const px = Math.ceil(bf.blurX * bf.passes);
        const py = Math.ceil(bf.blurY * bf.passes);
        if (px > padL) padL = px;
        if (px > padR) padR = px;
        if (py > padT) padT = py;
        if (py > padB) padB = py;
        break;
      }
      case 'dropShadow': {
        const df = f as DropShadowFilter;
        const radians = df.angle * (Math.PI / 180);
        const odx = df.distance * Math.cos(radians);
        const ody = df.distance * Math.sin(radians);
        const blur = Math.ceil(Math.max(df.blurX, df.blurY) * df.passes);
        const l = blur + Math.ceil(Math.max(0, -odx));
        const r = blur + Math.ceil(Math.max(0, odx));
        const t = blur + Math.ceil(Math.max(0, -ody));
        const b = blur + Math.ceil(Math.max(0, ody));
        if (l > padL) padL = l;
        if (r > padR) padR = r;
        if (t > padT) padT = t;
        if (b > padB) padB = b;
        break;
      }
      case 'glow': {
        const gf = f as GlowFilter;
        const blur = Math.ceil(Math.max(gf.blurX, gf.blurY) * gf.passes);
        if (blur > padL) padL = blur;
        if (blur > padR) padR = blur;
        if (blur > padT) padT = blur;
        if (blur > padB) padB = blur;
        break;
      }
    }
  }
  return { padL, padR, padT, padB };
}

function computeCSSFilter(filters: readonly Filter[]): string {
  const parts: string[] = [];
  for (const f of filters) {
    switch (f.type) {
      case 'blur': {
        const bf = f as BlurFilter;
        const blur = Math.max(bf.blurX, bf.blurY);
        if (blur > 0) parts.push(`blur(${blur}px)`);
        break;
      }
      case 'dropShadow': {
        const df = f as DropShadowFilter;
        if (df.inner) break;
        const radians = df.angle * (Math.PI / 180);
        const odx = df.distance * Math.cos(radians);
        const ody = df.distance * Math.sin(radians);
        const blur = Math.max(df.blurX, df.blurY);
        const r = (df.color >> 16) & 0xff;
        const g = (df.color >> 8) & 0xff;
        const b = df.color & 0xff;
        parts.push(
          `drop-shadow(${odx.toFixed(1)}px ${ody.toFixed(1)}px ${blur}px rgba(${r},${g},${b},${df.alpha}))`,
        );
        break;
      }
      case 'glow': {
        const gf = f as GlowFilter;
        const blur = Math.max(gf.blurX, gf.blurY);
        const r = (gf.color >> 16) & 0xff;
        const g = (gf.color >> 8) & 0xff;
        const b = gf.color & 0xff;
        parts.push(`drop-shadow(0px 0px ${blur}px rgba(${r},${g},${b},${gf.alpha}))`);
        break;
      }
    }
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}
