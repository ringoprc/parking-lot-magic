import { useEffect, useId, useMemo, useRef, useState } from "react";
import sheetCss from "../LotBottomSheet.css?inline";
import infoCss from "../ParkingLotInfoWindow.css?inline";
import "./AdAssetPreview.css";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Isolate the real frontend styles so media queries use the preview viewport,
// not the admin operator's monitor. Never crop with an admin-only aspect ratio.
export default function AdAssetPreview({ src, slot, title, device: controlledDevice, onDeviceChange }) {
  const [localDevice, setLocalDevice] = useState("mobile");
  const device = controlledDevice || localDevice;
  const selectId = useId();
  const containerRef = useRef(null);
  const [available, setAvailable] = useState(300);
  const [measurement, setMeasurement] = useState(null);
  const viewportWidth = device === "mobile" ? 375 : 1024;
  const viewportHeight = device === "mobile" ? 667 : 768;
  const prefix = device === "mobile" ? "vl" : "iw";
  const html = useMemo(() => {
    const image = `<img data-focus class="${prefix}-${slot === "bottomSheetExample" ? "sheet-sponsor" : "sheet-hero"}-img" src="${escapeHtml(src || "")}" alt="${escapeHtml(title)}" style="${slot === "bottomSheetExample" ? "opacity:1" : ""}">`;
    let content;
    if (slot === "bottomSheetExample" || slot === "entrancePhoto") {
      const entrance = slot === "entrancePhoto" ? image : '<div style="width:100%;height:116px;background:#eee"></div>';
      const sponsor = slot === "bottomSheetExample" ? image : '<div style="width:100%;height:95px;background:#eee"></div>';
      content = `<div style="${device === "desktop" ? "width:350px;padding:1px 20px 20px;" : "width:100%;"}"><div class="${prefix}-sheet-hero"><div class="${prefix}-sheet-hero-img-div">${entrance}</div><div class="${prefix}-sheet-sponsor-img-div">${sponsor}</div></div></div>`;
    } else {
      const coupon = slot === "coupon";
      content = `<div class="${prefix}-nav-ad-layer"><div class="${prefix}-nav-ad-modal ${coupon ? "preview" : ""}" style="padding-top:24px;padding-bottom:24px"><img data-focus class="${prefix}-nav-ad-img" src="${escapeHtml(src || "")}" alt="${escapeHtml(title)}"><div class="${prefix}-nav-ad-choiceRow ${coupon ? "single" : ""}"><button class="${prefix}-nav-ad-choiceBtn">導航至廣告店家</button>${coupon ? "" : `<button class="${prefix}-nav-ad-choiceBtn">繼續導航至停車場</button>`}</div></div></div>`;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui}${sheetCss}\n${infoCss}</style></head><body>${content}</body></html>`;
  }, [device, prefix, slot, src, title]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const bounds = measurement?.html === html ? measurement.bounds : { x: 0, y: 0, width: 240, height: 150 };
  const scale = Math.min(1, available / Math.max(1, bounds.width));
  return (
    <div className="ad-asset-preview" ref={containerRef}>
      <div className="ad-asset-preview-toolbar">
        <label htmlFor={selectId}>前台預覽</label>
        <select id={selectId} value={device} onChange={(e) => (onDeviceChange || setLocalDevice)(e.target.value)}>
          <option value="mobile">手機（375 px）</option>
          <option value="desktop">電腦</option>
        </select>
      </div>
      {src ? <>
        <div className="ad-asset-preview-window" style={{ width: bounds.width * scale, height: bounds.height * scale }}>
          <iframe title={`${title}前台顯示範圍`} sandbox="allow-same-origin" tabIndex={-1} srcDoc={html}
            width={viewportWidth} height={viewportHeight}
            style={{ transform: `scale(${scale})`, left: -bounds.x * scale, top: -bounds.y * scale, visibility: measurement?.html === html ? "visible" : "hidden" }}
            onLoad={(event) => {
              const img = event.currentTarget.contentDocument?.querySelector("[data-focus]");
              if (!img) return;
              const rect = img.getBoundingClientRect();
              setMeasurement({ html, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
            }} />
        </div>
        <div className="ad-asset-preview-caption">顯示框 {Math.round(bounds.width)} × {Math.round(bounds.height)} px{scale < 0.99 ? " · 等比例縮小預覽" : " · 原尺寸預覽"}</div>
      </> : <div className="ad-asset-preview-empty">尚未上傳圖片</div>}
    </div>
  );
}
