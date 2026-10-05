import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./EntrancePhoto.css";

export default function EntrancePhoto({ src, fallback, name, className }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const alt = `${name || "停車場"}入口照片`;
  const handleError = (event) => {
    if (event.currentTarget.getAttribute("src") !== fallback) {
      event.currentTarget.src = fallback;
    }
  };

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} className="entrance-photo-trigger" type="button"
        aria-label={`放大${alt}`} aria-haspopup="dialog"
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
        <img className={className} src={src || fallback} onError={handleError}
          alt={alt} loading="lazy" />
      </button>
      {open && createPortal(
        <dialog ref={dialogRef} className="entrance-photo-dialog" aria-label={alt}
          onCancel={(event) => { event.preventDefault(); setOpen(false); }}
          onClick={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) setOpen(false);
          }}>
          <div className="entrance-photo-preview">
            <button type="button" className="entrance-photo-close" aria-label="關閉大圖"
              onClick={() => setOpen(false)}>×</button>
            <img src={src || fallback} onError={handleError} alt={alt} />
            <div className="entrance-photo-caption">{alt}</div>
          </div>
        </dialog>, document.body
      )}
    </>
  );
}
