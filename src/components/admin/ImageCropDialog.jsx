import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { drawImageCrop, getImageCrop, moveImageCrop } from "../../utils/imageCrop";
import AdAssetPreview from "./AdAssetPreview";
import "./ImageCropDialog.css";

export default function ImageCropDialog({ file, slot, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const dragRef = useRef(null);
  const headingId = useId();
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ratioChoice, setRatioChoice] = useState(slot.key === "bottomSheetExample" ? "banner" : "original");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [preview, setPreview] = useState("");
  const [device, setDevice] = useState("mobile");
  const ratios = { original: image ? image.naturalWidth / image.naturalHeight : 1, banner: 240 / 95, landscape: 16 / 9, square: 1, portrait: 3 / 4 };
  const ratio = ratios[ratioChoice];
  const crop = image ? getImageCrop(image.naturalWidth, image.naturalHeight, ratio, zoom, center) : null;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus?.(); };
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > 80_000_000) {
        setError("圖片超過 8000 萬像素，請先縮小後再選擇。");
      } else {
        setImage(img);
      }
    };
    img.onerror = () => setError("無法讀取圖片，請使用 JPEG、PNG 或 WebP 圖片。");
    img.src = url;
    return () => { img.onload = null; img.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  const cropX = crop?.x, cropY = crop?.y, cropWidth = crop?.width, cropHeight = crop?.height;
  useEffect(() => {
    if (!image) return;
    const timer = setTimeout(() => {
      try {
        const canvas = drawImageCrop(image, { x: cropX, y: cropY, width: cropWidth, height: cropHeight });
        setPreview(canvas.toDataURL("image/webp", 0.9));
      } catch (e) { setError(e.message); }
    }, 100);
    return () => clearTimeout(timer);
  }, [image, cropX, cropY, cropWidth, cropHeight]);

  function reset() {
    setZoom(1);
    setCenter({ x: 0.5, y: 0.5 });
  }

  function move(dx, dy) {
    setCenter(moveImageCrop(image.naturalWidth, image.naturalHeight, crop, dx, dy));
  }

  async function confirm() {
    if (!image || busy) return;
    setBusy(true);
    setError("");
    try {
      const canvas = drawImageCrop(image, crop, slot.key === "entrancePhoto" ? 1200 : 1600);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (!blob) throw new Error("圖片處理失敗，請再試一次");
      if (blob.size > 8 * 1024 * 1024) throw new Error("調整後圖片仍超過 8 MB，請縮小裁切範圍後再試");
      const ext = blob.type === "image/webp" ? "webp" : "png";
      const output = new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type });
      await onConfirm(output);
    } catch (e) {
      setError(e.message || "上傳失敗，請再試一次");
    } finally { setBusy(false); }
  }

  return createPortal(
    <dialog ref={dialogRef} className="image-crop-dialog" aria-labelledby={headingId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <header className="image-crop-header">
        <div><h2 id={headingId}>調整{slot.title}</h2><p>拖曳移動圖片，調整縮放；右側會顯示前台實際可見的範圍。</p></div>
        <button type="button" className="image-crop-close" aria-label="關閉圖片調整" disabled={busy} onClick={onCancel}>×</button>
      </header>
      <div className="image-crop-layout">
        <section className="image-crop-editor" aria-label="裁切與縮放">
          <div className="image-crop-controls">
            <label>裁切比例 <select value={ratioChoice} disabled={busy || !image} onChange={(e) => { setRatioChoice(e.target.value); reset(); }}>
              <option value="original">原圖比例</option>
              <option value="banner">資訊卡橫幅</option>
              <option value="landscape">橫式 16:9</option>
              <option value="square">正方形 1:1</option>
              <option value="portrait">直式 3:4</option>
            </select></label>
            <button type="button" disabled={busy || !image} onClick={reset}>重設位置與縮放</button>
          </div>
          <div className="image-crop-workspace">
            {image ? <div className="image-crop-stage" role="group" tabIndex={busy ? -1 : 0}
              aria-label="圖片裁切區，可拖曳或使用方向鍵移動圖片" style={{ aspectRatio: ratio, maxWidth: `${Math.min(520, 360 * ratio)}px` }}
              onKeyDown={(event) => {
                if (busy) return;
                const direction = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
                if (!direction) return;
                event.preventDefault();
                const step = event.shiftKey ? 0.1 : 0.02;
                move(direction[0] * crop.width * step, direction[1] * crop.height * step);
              }}
              onPointerDown={(event) => {
                if (busy || event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = { x: event.clientX, y: event.clientY, crop, pointerId: event.pointerId };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || busy || drag.pointerId !== event.pointerId) return;
                const rect = event.currentTarget.getBoundingClientRect();
                setCenter(moveImageCrop(image.naturalWidth, image.naturalHeight, drag.crop,
                  -(event.clientX - drag.x) / rect.width * drag.crop.width,
                  -(event.clientY - drag.y) / rect.height * drag.crop.height));
              }}
              onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onLostPointerCapture={() => { dragRef.current = null; }}>
              <img src={image.src} alt="待裁切圖片" draggable={false} style={{ width: `${image.naturalWidth / crop.width * 100}%`, height: `${image.naturalHeight / crop.height * 100}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` }} />
              <div className="image-crop-grid" aria-hidden="true" />
            </div> : <p>{error ? "請取消後重新選擇圖片" : "正在讀取圖片…"}</p>}
          </div>
          <label className="image-crop-zoom">縮放 <input aria-label="圖片縮放" type="range" min="1" max="4" step="0.01" value={zoom} disabled={busy || !image}
            onChange={(event) => {
              const next = Number(event.target.value);
              // Preserve the visible center when zooming away from a clamped edge.
              setCenter({ x: (crop.x + crop.width / 2) / image.naturalWidth, y: (crop.y + crop.height / 2) / image.naturalHeight });
              setZoom(next);
            }} /><output>{Math.round(zoom * 100)}%</output></label>
          <p className="image-crop-note">框外內容不會上傳。優惠券建議保留原圖比例，確認文字與 QR Code 完整可見。</p>
        </section>
        <aside className="image-crop-preview"><AdAssetPreview src={preview} slot={slot.key} title={slot.title} device={device} onDeviceChange={setDevice} /><p className="image-crop-note">手機以 375 px 畫面示意；不同螢幕寬度可能略有差異，可切換電腦預覽檢查。</p></aside>
      </div>
      {error && <div role="alert" className="image-crop-error">{error}</div>}
      <footer className="image-crop-footer"><span>確認前不會更換已上傳的圖片</span><button type="button" disabled={busy} onClick={onCancel}>取消</button><button type="button" className="image-crop-confirm" disabled={busy || !image} onClick={confirm}>{busy ? "處理並上傳中…" : "確認並上傳"}</button></footer>
    </dialog>, document.body,
  );
}
