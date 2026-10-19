import test from "node:test";
import assert from "node:assert/strict";
import { getImageCrop, moveImageCrop } from "./imageCrop.js";

test("original-ratio coupons retain the entire source", () => {
  assert.deepEqual(getImageCrop(1200, 1600, 3 / 4), { x: 0, y: 0, width: 1200, height: 1600 });
});

test("portrait source can be framed as a banner without stretching", () => {
  const crop = getImageCrop(1200, 1600, 2.5);
  assert.deepEqual(crop, { x: 0, y: 560, width: 1200, height: 480 });
  const center = moveImageCrop(1200, 1600, crop, 0, -10000);
  assert.equal(getImageCrop(1200, 1600, 2.5, 1, center).y, 0);
});

test("dragging and zooming never expose pixels outside the source", () => {
  for (const [w, h] of [[1200, 1600], [2400, 600], [300, 300]]) {
    for (const ratio of [0.75, 1, 16 / 9, 240 / 95]) {
      for (const zoom of [1, 1.3, 4]) {
        const crop = getImageCrop(w, h, ratio, zoom);
        for (const dx of [-10000, 10000]) {
          for (const dy of [-10000, 10000]) {
            const center = moveImageCrop(w, h, crop, dx, dy);
            const moved = getImageCrop(w, h, ratio, zoom, center);
            assert.ok(moved.x >= 0 && moved.y >= 0);
            assert.ok(moved.x + moved.width <= w + 1e-8);
            assert.ok(moved.y + moved.height <= h + 1e-8);
            assert.ok(Math.abs(moved.width / moved.height - ratio) < 1e-8);
          }
        }
      }
    }
  }
});

test("zoomed selection retains the intended center and resets to full image", () => {
  const crop = getImageCrop(1200, 1600, 0.75, 2, { x: .75, y: .75 });
  assert.deepEqual(crop, { x: 600, y: 800, width: 600, height: 800 });
  assert.deepEqual(getImageCrop(1200, 1600, 0.75, 1, { x: .75, y: .75 }), { x: 0, y: 0, width: 1200, height: 1600 });
});
