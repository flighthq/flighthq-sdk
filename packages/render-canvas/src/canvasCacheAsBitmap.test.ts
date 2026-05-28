import { getDisplayObjectRenderNode } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';

import { updateCanvasCacheBitmap } from './canvasCacheAsBitmap';
import { createCanvasRenderState } from './canvasRenderState';

describe('updateCanvasCacheBitmap', () => {
  it('returns null when cacheAsBitmap is false and no filters', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);

    expect(updateCanvasCacheBitmap(state, data)).toBeNull();
  });

  it('does not throw when cacheAsBitmap is false', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);

    expect(() => updateCanvasCacheBitmap(state, data)).not.toThrow();
  });
});
