// frontend/src/pages/DigitOcrTest.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function padBox(box, pad, W, H) {
  const x0 = clamp(Math.floor(box.x - pad), 0, W - 1);
  const y0 = clamp(Math.floor(box.y - pad), 0, H - 1);
  const x1 = clamp(Math.ceil(box.x + box.w + pad), 1, W);
  const y1 = clamp(Math.ceil(box.y + box.h + pad), 1, H);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

// Draw image region -> canvas (optionally scale)
function drawCropToCanvas(img, sx, sy, sw, sh, canvas, scale = 1) {
  const w = Math.max(1, Math.floor(sw * scale));
  const h = Math.max(1, Math.floor(sh * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return ctx;
}

function blur3x3BinaryMask(mask, w, h, iterations = 1) {
  // For binary masks only (0/1). Light smoothing to remove speckles.
  // This is NOT a real gaussian blur; it’s just neighbor counting.
  let cur = mask.slice();
  let nxt = new Uint8Array(w * h);

  const idx = (x, y) => y * w + x;

  for (let it = 0; it < iterations; it++) {
    nxt.fill(0);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sum = 0;
        sum += cur[idx(x - 1, y - 1)];
        sum += cur[idx(x, y - 1)];
        sum += cur[idx(x + 1, y - 1)];
        sum += cur[idx(x - 1, y)];
        sum += cur[idx(x, y)];
        sum += cur[idx(x + 1, y)];
        sum += cur[idx(x - 1, y + 1)];
        sum += cur[idx(x, y + 1)];
        sum += cur[idx(x + 1, y + 1)];
        // keep if majority neighbors are on
        nxt[idx(x, y)] = sum >= 5 ? 1 : 0;
      }
    }
    cur = nxt.slice();
  }
  return cur;
}

function connectedComponents(mask, w, h) {
  // mask: Uint8Array of 0/1
  const visited = new Uint8Array(w * h);
  const comps = [];

  const idx = (x, y) => y * w + x;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = idx(x, y);
      if (!mask[p] || visited[p]) continue;

      let q = [p];
      visited[p] = 1;

      let minX = x,
        minY = y,
        maxX = x,
        maxY = y,
        area = 0;

      while (q.length) {
        const cur = q.pop();
        const cx = cur % w;
        const cy = (cur / w) | 0;
        area++;

        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        // 4-neighborhood
        const nbs = [];
        if (cx > 0) nbs.push(cur - 1);
        if (cx + 1 < w) nbs.push(cur + 1);
        if (cy > 0) nbs.push(cur - w);
        if (cy + 1 < h) nbs.push(cur + w);

        for (const nb of nbs) {
          if (mask[nb] && !visited[nb]) {
            visited[nb] = 1;
            q.push(nb);
          }
        }
      }

      comps.push({
        minX,
        minY,
        maxX,
        maxY,
        bw: maxX - minX + 1,
        bh: maxY - minY + 1,
        area,
      });
    }
  }

  return comps;
}

function pickBestDigitComponent(comps, w, h, opts) {
  const {
    minAreaFrac,
    maxAreaFrac,
    minFill,
    maxFill,
    minAR,
    maxAR,
    preferCenter,
  } = opts;

  const total = w * h;
  let best = null;
  let bestScore = -Infinity;

  for (const c of comps) {
    const areaFrac = c.area / total;
    if (areaFrac < minAreaFrac || areaFrac > maxAreaFrac) continue;

    const fill = c.area / (c.bw * c.bh);
    if (fill < minFill || fill > maxFill) continue;

    const ar = c.bw / c.bh;
    if (ar < minAR || ar > maxAR) continue;

    // Score: area + fill, penalize too large width; optionally prefer center
    let score = c.area * 1.0 + fill * 2000 - c.bw * 5;

    if (preferCenter) {
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;
      const dx = Math.abs(cx - w / 2) / (w / 2);
      const dy = Math.abs(cy - h / 2) / (h / 2);
      score -= (dx + dy) * 500;
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

function canvasToDataURL(canvas) {
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export default function DigitOcrTest() {
  const [file, setFile] = useState(null);
  const [imgUrl, setImgUrl] = useState(null);

  const imgRef = useRef(null);
  const fullCanvasRef = useRef(null);

  // Step canvases
  const roiCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const tightCanvasRef = useRef(null);
  const ocrCanvasRef = useRef(null);

  // UI previews (img tags)
  const [roiUrl, setRoiUrl] = useState(null);
  const [maskUrl, setMaskUrl] = useState(null);
  const [tightUrl, setTightUrl] = useState(null);
  const [ocrPrepUrl, setOcrPrepUrl] = useState(null);

  const [imgWH, setImgWH] = useState({ W: 0, H: 0 });

  // ROI
  const [roi, setRoi] = useState({ x: 0, y: 0, w: 240, h: 160 });

  // Parameters (sliders)
  const [scale, setScale] = useState(4);
  const [pad, setPad] = useState(10);
  const [step, setStep] = useState(2);

  // HSV threshold controls
  const [hueCenter, setHueCenter] = useState(0); // 0 = red
  const [hueRange, setHueRange] = useState(18);
  const [satMin, setSatMin] = useState(0.45);
  const [valMin, setValMin] = useState(0.22);

  // Mask cleanup
  const [speckleFilterIters, setSpeckleFilterIters] = useState(0);

  // Component picking
  const [minAreaFrac, setMinAreaFrac] = useState(0.002);
  const [maxAreaFrac, setMaxAreaFrac] = useState(0.45);
  const [minFill, setMinFill] = useState(0.06);
  const [maxFill, setMaxFill] = useState(0.8);
  const [minAR, setMinAR] = useState(0.15);
  const [maxAR, setMaxAR] = useState(2.5);
  const [preferCenter, setPreferCenter] = useState(true);

  const [invertForOcr, setInvertForOcr] = useState(true);
  const [psm, setPsm] = useState(10); // 10 single char, 7 single line

  const [debugInfo, setDebugInfo] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const digitsOnly = useMemo(() => (ocrText || "").replace(/\D/g, ""), [ocrText]);

  // object url for image
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onImgLoad() {
    const img = imgRef.current;
    const fullCanvas = fullCanvasRef.current;
    if (!img || !fullCanvas) return;

    const W = img.naturalWidth;
    const H = img.naturalHeight;
    setImgWH({ W, H });

    fullCanvas.width = W;
    fullCanvas.height = H;
    const ctx = fullCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);

    // default ROI: center-ish
    const defW = Math.min(280, W);
    const defH = Math.min(200, H);
    setRoi({
      x: Math.floor((W - defW) * 0.35),
      y: Math.floor((H - defH) * 0.35),
      w: defW,
      h: defH,
    });

    setOcrText("");
    setDebugInfo("");
  }

  function hsvIsRedish(h, s, v) {
    // center/range in degrees
    const d = Math.min(
      Math.abs(h - hueCenter),
      Math.abs(h - hueCenter + 360),
      Math.abs(h - hueCenter - 360)
    );
    return d <= hueRange && s >= satMin && v >= valMin;
  }

  function processAll() {
    const img = imgRef.current;
    const fullCanvas = fullCanvasRef.current;
    const roiCanvas = roiCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const tightCanvas = tightCanvasRef.current;
    const ocrCanvas = ocrCanvasRef.current;

    if (!img || !fullCanvas || !roiCanvas || !maskCanvas || !tightCanvas || !ocrCanvas) return;

    const { W, H } = imgWH;
    if (!W || !H) return;

    // clamp ROI
    const rx = clamp(roi.x, 0, W - 1);
    const ry = clamp(roi.y, 0, H - 1);
    const rw = clamp(roi.w, 1, W - rx);
    const rh = clamp(roi.h, 1, H - ry);
    const safeRoi = { x: rx, y: ry, w: rw, h: rh };

    // Step 1: ROI crop preview (scaled for easier viewing)
    drawCropToCanvas(img, safeRoi.x, safeRoi.y, safeRoi.w, safeRoi.h, roiCanvas, 1);
    setRoiUrl(canvasToDataURL(roiCanvas));

    // Step 2: Build mask at downsample step, then upscale for display
    const roiCtx = roiCanvas.getContext("2d", { willReadFrequently: true });
    const id = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
    const data = id.data;

    const s = Math.max(1, step | 0);
    const mw = Math.max(1, Math.floor(roiCanvas.width / s));
    const mh = Math.max(1, Math.floor(roiCanvas.height / s));
    let mask = new Uint8Array(mw * mh);

    let idx = 0;
    for (let yy = 0; yy < mh; yy++) {
      for (let xx = 0; xx < mw; xx++) {
        const srcX = xx * s;
        const srcY = yy * s;
        const i = (srcY * roiCanvas.width + srcX) * 4;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];

        const { h, s: ss, v } = rgbToHsv(r, g, b);
        mask[idx++] = hsvIsRedish(h, ss, v) ? 1 : 0;
      }
    }

    if (speckleFilterIters > 0) {
      mask = blur3x3BinaryMask(mask, mw, mh, speckleFilterIters);
    }

    // Draw mask to maskCanvas at a display scale (scale param)
    const dispScale = Math.max(1, scale | 0);
    maskCanvas.width = mw * dispScale;
    maskCanvas.height = mh * dispScale;
    const mctx = maskCanvas.getContext("2d", { willReadFrequently: true });
    mctx.imageSmoothingEnabled = false;

    // paint mask pixels
    const out = mctx.createImageData(maskCanvas.width, maskCanvas.height);
    const od = out.data;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const v = mask[y * mw + x] ? 255 : 0;
        // fill block of dispScale x dispScale
        for (let yy = 0; yy < dispScale; yy++) {
          for (let xx = 0; xx < dispScale; xx++) {
            const dx = x * dispScale + xx;
            const dy = y * dispScale + yy;
            const p = (dy * maskCanvas.width + dx) * 4;
            od[p] = od[p + 1] = od[p + 2] = v;
            od[p + 3] = 255;
          }
        }
      }
    }
    mctx.putImageData(out, 0, 0);
    setMaskUrl(canvasToDataURL(maskCanvas));

    // Step 3: connected components on downsampled mask
    const comps = connectedComponents(mask, mw, mh);
    const best = pickBestDigitComponent(comps, mw, mh, {
      minAreaFrac,
      maxAreaFrac,
      minFill,
      maxFill,
      minAR,
      maxAR,
      preferCenter,
    });

    let tightBox = null;
    if (best) {
      // convert from mask coords -> ROI coords
      tightBox = {
        x: safeRoi.x + best.minX * s,
        y: safeRoi.y + best.minY * s,
        w: best.bw * s,
        h: best.bh * s,
      };
      tightBox = padBox(tightBox, pad, W, H);
    }

    // Step 4: Tight crop preview (original colors)
    if (tightBox) {
      drawCropToCanvas(img, tightBox.x, tightBox.y, tightBox.w, tightBox.h, tightCanvas, 1);
      setTightUrl(canvasToDataURL(tightCanvas));
    } else {
      // fallback: use ROI
      drawCropToCanvas(img, safeRoi.x, safeRoi.y, safeRoi.w, safeRoi.h, tightCanvas, 1);
      setTightUrl(canvasToDataURL(tightCanvas));
    }

    // Step 5: OCR-prep canvas (binary mask inside tight crop)
    const useBox = tightBox || safeRoi;
    // Create OCR canvas at higher resolution
    const ocrScale = 4; // separate from display scale; fixed for OCR stability
    const octx = drawCropToCanvas(img, useBox.x, useBox.y, useBox.w, useBox.h, ocrCanvas, ocrScale);

    // Convert to HSV mask at OCR resolution directly
    const oid = octx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
    const od2 = oid.data;
    for (let i = 0; i < od2.length; i += 4) {
      const r = od2[i],
        g = od2[i + 1],
        b = od2[i + 2];
      const { h, s: ss, v } = rgbToHsv(r, g, b);
      const on = hsvIsRedish(h, ss, v);

      // white digit on black background
      let vout = on ? 255 : 0;
      if (invertForOcr) vout = 255 - vout; // black digit on white background
      od2[i] = od2[i + 1] = od2[i + 2] = vout;
      od2[i + 3] = 255;
    }
    octx.putImageData(oid, 0, 0);
    setOcrPrepUrl(canvasToDataURL(ocrCanvas));

    // debug
    const dbg = [
      `ROI: x=${safeRoi.x},y=${safeRoi.y},w=${safeRoi.w},h=${safeRoi.h}`,
      `mask: step=${s}, mw=${mw}, mh=${mh}, comps=${comps.length}`,
      best
        ? `best: area=${best.area}, bw=${best.bw}, bh=${best.bh}, fill=${(
            best.area /
            (best.bw * best.bh)
          ).toFixed(3)}, ar=${(best.bw / best.bh).toFixed(3)}`
        : `best: (none)`,
      tightBox ? `tight: x=${tightBox.x},y=${tightBox.y},w=${tightBox.w},h=${tightBox.h}` : `tight: (none)`,
      `HSV: center=${hueCenter}°, range=±${hueRange}°, satMin=${satMin.toFixed(2)}, valMin=${valMin.toFixed(2)}`,
      `OCR: invert=${invertForOcr}, psm=${psm}`,
    ].join("\n");
    setDebugInfo(dbg);
  }

  // Re-run pipeline when parameters change
  useEffect(() => {
    if (!imgUrl) return;
    if (!imgWH.W || !imgWH.H) return;
    processAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    imgUrl,
    imgWH.W,
    imgWH.H,
    roi.x,
    roi.y,
    roi.w,
    roi.h,
    scale,
    pad,
    step,
    hueCenter,
    hueRange,
    satMin,
    valMin,
    speckleFilterIters,
    minAreaFrac,
    maxAreaFrac,
    minFill,
    maxFill,
    minAR,
    maxAR,
    preferCenter,
    invertForOcr,
    psm,
  ]);

  async function runOcr() {
    const ocrCanvas = ocrCanvasRef.current;
    if (!ocrCanvas) return;

    setOcrBusy(true);
    setOcrText("");

    try {
      const { data } = await Tesseract.recognize(ocrCanvas, "eng", {
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: String(psm),
      });

      const cleaned = (data?.text || "").replace(/\D/g, "");
      setOcrText(cleaned);
    } catch (e) {
      console.error(e);
      setOcrText("");
      alert("OCR failed. Check console.");
    } finally {
      setOcrBusy(false);
    }
  }

  const { W, H } = imgWH;

  // ROI overlay (on displayed image, percentage-based)
  const roiStyle =
    W && H
      ? {
          position: "absolute",
          left: `${(roi.x / W) * 100}%`,
          top: `${(roi.y / H) * 100}%`,
          width: `${(roi.w / W) * 100}%`,
          height: `${(roi.h / H) * 100}%`,
          border: "2px solid #00A3FF",
          borderRadius: 6,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.08)",
          pointerEvents: "none",
        }
      : null;

  function resetRoiDefault() {
    if (!W || !H) return;
    const defW = Math.min(280, W);
    const defH = Math.min(200, H);
    setRoi({
      x: Math.floor((W - defW) * 0.35),
      y: Math.floor((H - defH) * 0.35),
      w: defW,
      h: defH,
    });
  }

  // Simple “auto move ROI near strongest red” (coarse scan on full image)
  function autoFindRoiOnFullImage() {
    const fullCanvas = fullCanvasRef.current;
    const img = imgRef.current;
    if (!fullCanvas || !img) return;
    const ctx = fullCanvas.getContext("2d", { willReadFrequently: true });

    const W0 = fullCanvas.width;
    const H0 = fullCanvas.height;

    // scan coarse grid
    const grid = 14; // coarse
    const winW = Math.floor(W0 / 4);
    const winH = Math.floor(H0 / 4);

    let bestScore = -Infinity;
    let best = null;

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const x = Math.floor((gx / (grid - 1)) * (W0 - winW));
        const y = Math.floor((gy / (grid - 1)) * (H0 - winH));
        const id = ctx.getImageData(x, y, winW, winH);
        const data = id.data;

        let hit = 0;
        // sample every 6 pixels
        for (let i = 0; i < data.length; i += 4 * 6) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const { h, s, v } = rgbToHsv(r, g, b);
          if (hsvIsRedish(h, s, v)) hit++;
        }

        if (hit > bestScore) {
          bestScore = hit;
          best = { x, y, w: winW, h: winH };
        }
      }
    }

    if (best) setRoi(best);
  }

  return (
    <div style={{ padding: 16, maxWidth: 1180, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>Digit OCR Test (Debug Mode)</h2>
      <div style={{ opacity: 0.7, marginBottom: 12 }}>
        Upload a photo → set ROI → inspect each step → tune thresholds → OCR.
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="button" onClick={resetRoiDefault} disabled={!imgUrl}>
          Reset ROI
        </button>
        <button type="button" onClick={autoFindRoiOnFullImage} disabled={!imgUrl}>
          Auto-find ROI (coarse)
        </button>
        <button type="button" onClick={processAll} disabled={!imgUrl}>
          Re-run pipeline
        </button>
      </div>

      {imgUrl && (
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* LEFT */}
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Original (with ROI)</div>
            <div style={{ position: "relative" }}>
              <img
                ref={imgRef}
                src={imgUrl}
                alt=""
                onLoad={onImgLoad}
                style={{
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  display: "block",
                }}
              />
              {roiStyle && <div style={roiStyle} />}
            </div>

            <canvas ref={fullCanvasRef} style={{ display: "none" }} />

            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>ROI sliders</div>
              {W > 0 && H > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    x: {roi.x}
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, W - 1)}
                      value={roi.x}
                      onChange={(e) => setRoi((r) => ({ ...r, x: Number(e.target.value) }))}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label>
                    y: {roi.y}
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, H - 1)}
                      value={roi.y}
                      onChange={(e) => setRoi((r) => ({ ...r, y: Number(e.target.value) }))}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label>
                    w: {roi.w}
                    <input
                      type="range"
                      min={10}
                      max={Math.max(10, W - roi.x)}
                      value={roi.w}
                      onChange={(e) => setRoi((r) => ({ ...r, w: Number(e.target.value) }))}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label>
                    h: {roi.h}
                    <input
                      type="range"
                      min={10}
                      max={Math.max(10, H - roi.y)}
                      value={roi.h}
                      onChange={(e) => setRoi((r) => ({ ...r, h: Number(e.target.value) }))}
                      style={{ width: "100%" }}
                    />
                  </label>
                </div>
              ) : (
                <div style={{ opacity: 0.7 }}>Waiting for image…</div>
              )}
            </div>

            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Parameters</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  display scale: {scale}
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>
                <label>
                  padding: {pad}px
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={pad}
                    onChange={(e) => setPad(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  mask downsample step: {step}
                  <input
                    type="range"
                    min={1}
                    max={6}
                    value={step}
                    onChange={(e) => setStep(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  speckle filter iters: {speckleFilterIters}
                  <input
                    type="range"
                    min={0}
                    max={3}
                    value={speckleFilterIters}
                    onChange={(e) => setSpeckleFilterIters(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  HSV hue center: {hueCenter}°
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={hueCenter}
                    onChange={(e) => setHueCenter(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  hue range: ±{hueRange}°
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={hueRange}
                    onChange={(e) => setHueRange(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  sat min: {satMin.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={satMin}
                    onChange={(e) => setSatMin(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  val min: {valMin.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={valMin}
                    onChange={(e) => setValMin(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  min area frac: {minAreaFrac.toFixed(4)}
                  <input
                    type="range"
                    min={0.0005}
                    max={0.05}
                    step={0.0005}
                    value={minAreaFrac}
                    onChange={(e) => setMinAreaFrac(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  max area frac: {maxAreaFrac.toFixed(2)}
                  <input
                    type="range"
                    min={0.05}
                    max={0.95}
                    step={0.01}
                    value={maxAreaFrac}
                    onChange={(e) => setMaxAreaFrac(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  min fill: {minFill.toFixed(2)}
                  <input
                    type="range"
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={minFill}
                    onChange={(e) => setMinFill(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  max fill: {maxFill.toFixed(2)}
                  <input
                    type="range"
                    min={0.2}
                    max={0.98}
                    step={0.01}
                    value={maxFill}
                    onChange={(e) => setMaxFill(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  min AR: {minAR.toFixed(2)}
                  <input
                    type="range"
                    min={0.05}
                    max={1.5}
                    step={0.05}
                    value={minAR}
                    onChange={(e) => setMinAR(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  max AR: {maxAR.toFixed(2)}
                  <input
                    type="range"
                    min={0.5}
                    max={6}
                    step={0.1}
                    value={maxAR}
                    onChange={(e) => setMaxAR(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={preferCenter}
                    onChange={(e) => setPreferCenter(e.target.checked)}
                  />
                  Prefer center component
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={invertForOcr}
                    onChange={(e) => setInvertForOcr(e.target.checked)}
                  />
                  Invert for OCR (black on white)
                </label>

                <label>
                  Tesseract PSM: {psm}
                  <input
                    type="range"
                    min={6}
                    max={13}
                    step={1}
                    value={psm}
                    onChange={(e) => setPsm(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Common: 10=single char, 7=single line
                  </div>
                </label>
              </div>
            </div>

            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Debug</div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.35,
                  opacity: 0.9,
                }}
              >
                {debugInfo || "(no debug yet)"}
              </pre>
            </div>
          </div>

          {/* RIGHT */}
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Step outputs</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <StepCard title="1) ROI crop (original)" src={roiUrl} />
              <StepCard title="2) HSV red mask (binary)" src={maskUrl} />
              <StepCard title="3) Tight crop (original)" src={tightUrl} />
              <StepCard title="4) OCR prep (binary)" src={ocrPrepUrl} />
            </div>

            {/* hidden canvases backing the steps */}
            <canvas ref={roiCanvasRef} style={{ display: "none" }} />
            <canvas ref={maskCanvasRef} style={{ display: "none" }} />
            <canvas ref={tightCanvasRef} style={{ display: "none" }} />
            <canvas ref={ocrCanvasRef} style={{ display: "none" }} />

            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={runOcr} type="button" disabled={ocrBusy || !ocrPrepUrl}>
                {ocrBusy ? "Reading..." : "Read digit"}
              </button>

              <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 10, flex: 1 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>OCR result:</div>
                <div style={{ fontFamily: "monospace", fontSize: 18 }}>{ocrText || "-"}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Digits only:</div>
                <div style={{ fontSize: 32, fontWeight: 900 }}>{digitsOnly || "-"}</div>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              Tuning tips:
              <ul style={{ marginTop: 6 }}>
                <li>
                  If mask is mostly white → increase <b>satMin</b> or <b>valMin</b>, or reduce <b>hueRange</b>.
                </li>
                <li>
                  If mask misses the digit → lower <b>satMin</b>/<b>valMin</b>, widen <b>hueRange</b>.
                </li>
                <li>
                  If tight crop locks onto wrong blob → adjust <b>min/max area frac</b>, <b>minFill</b>, and AR limits.
                </li>
                <li>
                  For single digit counters: keep <b>PSM=10</b>. For multi-digit: try <b>PSM=7</b>.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({ title, src }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {src ? (
        <img src={src} alt="" style={{ width: "100%", borderRadius: 8, border: "1px solid #ddd" }} />
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14, opacity: 0.7 }}>
          (no output yet)
        </div>
      )}
    </div>
  );
}
