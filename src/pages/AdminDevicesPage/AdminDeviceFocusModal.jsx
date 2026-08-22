import { useEffect, useState } from "react";

function validPoint(point) {
  return !!(
    point?.enabled === true &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)) &&
    Number(point.x) >= 0 &&
    Number(point.x) <= 1 &&
    Number(point.y) >= 0 &&
    Number(point.y) <= 1
  );
}

export default function AdminDeviceFocusModal({
  device,
  saving,
  onClose,
  onSave,
}) {
  const [draftPoint, setDraftPoint] = useState(() =>
    validPoint(device?.focusPoint)
      ? {
          enabled: true,
          x: Number(device.focusPoint.x),
          y: Number(device.focusPoint.y),
        }
      : null
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const imageUrl = device.imageOriginalUrl || device.imageUrl;
  const supported = device.focusPointSupported !== false;
  const captureStatus = device?.phone?.lastCaptureMetadata?.focusStatus ?? null;

  function handleImagePointer(event) {
    if (!supported || saving) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setDraftPoint({ enabled: true, x, y });
  }

  return (
    <div
      className="admin-dev-focus-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="admin-dev-focus-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-device-focus-title"
      >
        <header className="admin-dev-focus-header">
          <div>
            <h2 id="admin-device-focus-title">設定對焦點</h2>
            <div className="admin-dev-focus-device">裝置 ID：{device.deviceId}</div>
          </div>
          <button
            type="button"
            className="admin-dev-focus-close"
            onClick={onClose}
            disabled={saving}
            aria-label="關閉對焦點設定"
          >
            ×
          </button>
        </header>

        {!supported ? (
          <div className="admin-dev-focus-message is-warning">
            此裝置回報不支援指定對焦點。
          </div>
        ) : (
          <div className="admin-dev-focus-message">
            點擊或輕觸完整圖片以選擇對焦位置，再按「儲存」。
          </div>
        )}

        <div className="admin-dev-focus-stage">
          {imageUrl ? (
            <div className="admin-dev-focus-image-shell">
              <img
                className={`admin-dev-focus-image ${supported ? "is-editable" : ""}`}
                src={imageUrl}
                alt={`${device.deviceId} 最新完整照片`}
                onPointerDown={handleImagePointer}
                draggable="false"
              />
              {draftPoint ? (
                <span
                  className="admin-dev-focus-marker"
                  style={{
                    left: `${draftPoint.x * 100}%`,
                    top: `${draftPoint.y * 100}%`,
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          ) : (
            <div className="admin-dev-focus-no-image">目前沒有可用圖片</div>
          )}
        </div>

        <div className="admin-dev-focus-diagnostics">
          <span>
            選擇位置：{draftPoint
              ? `x=${draftPoint.x.toFixed(3)}, y=${draftPoint.y.toFixed(3)}`
              : "未設定"}
          </span>
          <span>最近套用結果：{captureStatus || "—"}</span>
        </div>

        <footer className="admin-dev-focus-actions">
          <button
            type="button"
            className="admin-dev-modal-btn admin-dev-modal-cancel"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="admin-dev-modal-btn admin-dev-focus-disable"
            onClick={() => onSave({ enabled: false })}
            disabled={saving}
          >
            停用對焦點
          </button>
          <button
            type="button"
            className="admin-dev-modal-btn admin-dev-modal-save"
            onClick={() => draftPoint && onSave(draftPoint)}
            disabled={saving || !supported || !draftPoint || !imageUrl}
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </footer>
      </section>
    </div>
  );
}
