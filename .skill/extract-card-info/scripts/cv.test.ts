import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { avgRGB, dist, nearestSwatch, type RGB } from './cv.ts';

/** A solid w×h image of one color. */
function solid(w: number, h: number, [r, g, b]: RGB): PNG {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

test('avgRGB averages a uniform region', () => {
  const png = solid(10, 10, [100, 150, 200]);
  assert.deepEqual(avgRGB(png, [0, 0, 10, 10]), [100, 150, 200]);
});

test('avgRGB respects the rectangle bounds', () => {
  const png = solid(10, 10, [10, 20, 30]);
  // paint a 2×2 patch at (0,0) a different color
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const i = (10 * y + x) << 2;
    png.data[i] = 200; png.data[i + 1] = 200; png.data[i + 2] = 200;
  }
  assert.deepEqual(avgRGB(png, [0, 0, 2, 2]), [200, 200, 200]);
  assert.deepEqual(avgRGB(png, [5, 5, 2, 2]), [10, 20, 30]);
});

test('dist is euclidean', () => {
  assert.equal(dist([0, 0, 0], [0, 0, 0]), 0);
  assert.equal(dist([0, 0, 0], [3, 4, 0]), 5);
});

test('nearestSwatch picks the closest palette entry, high confidence', () => {
  const palette: Record<string, RGB> = { red: [200, 0, 0], blue: [0, 0, 200] };
  const m = nearestSwatch([195, 5, 5], palette, 55, 30);
  assert.equal(m.value, 'red');
  assert.equal(m.confidence, 'high');
});

test('nearestSwatch flags low confidence when far from every swatch', () => {
  const palette: Record<string, RGB> = { red: [200, 0, 0], blue: [0, 0, 200] };
  const m = nearestSwatch([120, 120, 120], palette, 55, 30);
  assert.equal(m.confidence, 'low');
});
