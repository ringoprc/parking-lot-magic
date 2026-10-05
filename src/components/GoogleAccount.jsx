import { useEffect, useRef, useState } from "react";
import { FiUser, FiChevronDown, FiArrowUpRight } from "react-icons/fi";
import "./GoogleAccount.css";

let googleScript;
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => {
        clearTimeout(timeout);
        script.remove();
        googleScript = null;
        reject(new Error("無法載入 Google 登入，請檢查網路後重試。"));
      };
      const timeout = setTimeout(fail, 15000);
      script.src = "https://accounts.google.com/gsi/client?hl=zh-TW";
      script.async = true;
      script.onload = () => {
        if (!window.google?.accounts?.id) return fail();
        clearTimeout(timeout);
        resolve(window.google.accounts.id);
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return googleScript;
}

export default function GoogleAccount({ apiBase }) {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef(null);
  const triggerRef = useRef(null);
  const buttonRef = useRef(null);
  const submitting = useRef(false);
  const base = apiBase.replace(/\/$/, "");

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event) => {
      if (!accountRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") { setMenuOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    const header = buttonRef.current.closest(".title-bar");
    const root = header.closest(".app-root");
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--site-header-height", `${header.getBoundingClientRect().height}px`);
    });
    observer.observe(header);
    return () => { observer.disconnect(); root.style.removeProperty("--site-header-height"); };
  }, []);

  useEffect(() => {
    let active = true;
    let stopResize;
    const controller = new AbortController();
    const container = buttonRef.current;
    async function request(path, body) {
      const response = await fetch(`${base}/api/auth/${path}`, {
        credentials: "include",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        ...(body !== undefined ? {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登入服務暫時無法使用。" );
      return data;
    }
    async function start() {
      try {
        const session = await request("session");
        if (!active) return;
        setUser(session.user);
        if (session.user) { setBusy(false); return; }
        if (!session.clientId) throw new Error("Google 登入尚未啟用。");
        const identity = await loadGoogleIdentity();
        if (!active) return;
        const { nonce } = await request("challenge", {});
        if (!active) return;
        identity.initialize({
          client_id: session.clientId,
          nonce,
          auto_select: false,
          callback: async ({ credential }) => {
            if (!active || submitting.current) return;
            submitting.current = true;
            setBusy(true);
            setError("");
            try {
              const result = await request("google", { credential });
              if (active) setUser(result.user);
            } catch (e) {
              if (active) setError(e.message || "登入失敗，請重試。");
            } finally {
              submitting.current = false;
              if (active) setBusy(false);
            }
          },
        });
        let previousWidth;
        const render = () => {
          const width = Math.max(200, Math.min(280, window.innerWidth - 64));
          if (width === previousWidth) return;
          previousWidth = width;
          container.replaceChildren();
          identity.renderButton(container, {
            type: "standard", theme: "filled_black", size: "large", shape: "pill",
            text: "continue_with", logo_alignment: "left", width, locale: "zh_TW",
          });
        };
        render();
        window.addEventListener("resize", render);
        stopResize = () => window.removeEventListener("resize", render);
        setBusy(false);
      } catch (e) {
        if (active) { setError(e.message || "登入服務暫時無法使用。"); setBusy(false); }
      }
    }
    start();
    return () => { active = false; controller.abort(); stopResize?.(); container?.replaceChildren(); };
  }, [base, attempt]);

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/api/auth/logout`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error("登出失敗，請重試。");
      window.google?.accounts?.id?.disableAutoSelect();
      setUser(null);
      setAttempt((value) => value + 1);
    } catch (e) {
      setError(e.message || "登出失敗，請重試。");
      setBusy(false);
    }
  }

  return (
    <div ref={accountRef} className="google-account">
      <button ref={triggerRef} type="button" className="account-trigger"
        aria-label={user ? `${user.name || user.email}，開啟帳號選單` : "開啟登入選單"}
        aria-expanded={menuOpen} aria-controls="account-panel"
        onClick={() => setMenuOpen((value) => !value)}>
        {user ? <span className="account-trigger-initial">{(user.name || user.email).slice(0, 1).toUpperCase()}</span> : <FiUser size={18} />}
        {!user && <span>登入</span>}<FiChevronDown size={13} />
      </button>
      <div id="account-panel" className={`account-panel${menuOpen ? " is-open" : ""}`} aria-busy={busy}>
      <div className="account-panel-heading">
        <strong>{user ? "我的帳號" : "歡迎來到 ParkingJi"}</strong>
        {user && <span>管理你的登入狀態</span>}
      </div>
      <div ref={buttonRef} className="google-account-button" hidden={!!user || !!error || busy} />
      {busy && !user && <div className="google-account-loading" role="status">正在連接 Google…</div>}
      {user && (
        <div className="google-account-profile">
          <span className="google-account-avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
          <span className="google-account-name" title={user.email}>{user.name || user.email}</span>
          <button type="button" onClick={logout} disabled={busy}>{busy ? "登出中…" : "登出"}</button>
        </div>
      )}
      {error && (
        <div className="google-account-error" role="alert">
          <span>{error}</span>
          {!user && <button type="button" onClick={() => { setError(""); setBusy(true); setAttempt((value) => value + 1); }}>重試</button>}
        </div>
      )}
      <a className="account-privacy-link" href="/privacy.html">隱私權政策</a>
      <a className="account-admin-link" href="?admin=1"><span>管理後台</span><FiArrowUpRight size={16} /></a>
      </div>
    </div>
  );
}
