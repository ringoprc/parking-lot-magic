// frontend/src/pages/AdminDeviceLinkModal.jsx
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";

const DEFAULT_VLM_PROMPT = `請判讀這張停車場 LED 剩餘車位看板照片，只輸出目前可停車位數字。

判讀規則：
1. 只讀取代表「剩餘車位」、「空位」、「可停車位」的數字。
2. 不要讀取費率、時間、日期、樓層、電話號碼、車牌號碼或其他非車位數字。
3. 如果畫面中有多個數字，優先讀取最大、最明顯，且最接近「剩餘」、「空位」、「車位」、「P」等文字的數字。
4. 如果 LED 反光、模糊、遮蔽或無法確定，請回傳 unknown，不要猜測。
5. 請只回傳 JSON，不要加入其他說明文字。

判讀成功時，輸出格式：{"status": "ok", "vacancy": "ooo"}，比如 {"status": "ok", "vacancy": "000"}、{"status": "ok", "vacancy": "128"}, 或 {"status": "ok", "vacancy": "003"}
判讀失敗時，輸出格式：{"status": "unknown", "vacancy": null}
`;

const DEFAULT_BOOLEAN_VLM_PROMPT = `請判讀這張停車場入口、告示牌或現場照片，只判斷目前是否至少有一個可停車空位。

請根據畫面中明確的文字、燈號、告示牌或現場配置判斷；若三角錐等物件的意義不明確，請回傳 unknown，不要猜測。請只回傳 JSON。

判讀有空位時：{"status":"ok","hasAvailableSpace":true}
判讀無空位時：{"status":"ok","hasAvailableSpace":false}
判讀失敗時：{"status":"unknown","hasAvailableSpace":null}
`;

const BOOLEAN_SIGN_PROMPT = `請判讀這張停車場 LED 看板照片，只關注目前是否有可停車位。

判讀規則：
1. 只讀取表示停車狀態的 LED 燈牌上橘色「P」或「滿」文字，不要把固定印刷的停車場標誌當成即時狀態。
2. 不要讀取費率、時間、日期、樓層、電話號碼、車牌號碼或其他資訊。
3. 如果狀態燈牌顯示「P」，代表有空位，hasAvailableSpace 回傳 true；如果顯示「滿」，代表沒空位，hasAvailableSpace 回傳 false。
4. 如果 LED 反光、模糊、遮蔽、狀態矛盾或無法確定，請回傳 unknown，不要猜測。
5. 請只回傳 JSON，不要加入其他說明文字。

判讀有空位時：{"status":"ok","hasAvailableSpace":true}
判讀無空位時：{"status":"ok","hasAvailableSpace":false}
判讀失敗時：{"status":"unknown","hasAvailableSpace":null}
`;

const PROMPT_PRESETS = [
  { id: "boolean", label: "有／無（P／滿）", prompt: BOOLEAN_SIGN_PROMPT },
  { id: "count", label: "數字車位", prompt: DEFAULT_VLM_PROMPT },
];

export default function AdminDevicePromptModal({
  isOpen,
  device,
  apiBase,
  adminKey,
  onClose,
  onSaved,
}) {
  const [promptText, setPromptText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [modeOverride, setModeOverride] = useState(null);
  const availabilityMode = modeOverride || (device?.lot?.availabilityMode === "boolean" ? "boolean" : "count");
  const busy = saving || savingMode;

  const currentSavedPrompt = useMemo(() => {
    return String(device?.vlmPromptOverride ?? "");
  }, [device?.vlmPromptOverride]);

  const defaultPrompt = useMemo(() => {
    const fallback = availabilityMode === "boolean"
      ? DEFAULT_BOOLEAN_VLM_PROMPT
      : DEFAULT_VLM_PROMPT;
    return String((modeOverride ? null : device?.defaultVlmPrompt) || fallback);
  }, [device?.defaultVlmPrompt, availabilityMode, modeOverride]);

  useEffect(() => {
    if (!isOpen) return;
    setPromptText(currentSavedPrompt);
    setModeOverride(null);
  }, [isOpen, currentSavedPrompt]);

  function handleClose() {
    if (busy) return;
    setPromptText("");
    onClose?.();
  }

  async function savePrompt() {
    if (!adminKey) return;
    if (!device?.deviceId) return;

    setSaving(true);
    try {
      const res = await fetch(
        `${apiBase}/api/admin/devices/${encodeURIComponent(device.deviceId)}/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({
            vlmPromptOverride: promptText,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "提示詞更新失敗");

      toast.success(promptText.trim() ? "已更新自訂提示詞" : "已清除自訂提示詞，將使用預設提示詞");
      setPromptText("");
      onClose?.();
      await onSaved?.();
    } catch (e) {
      toast.error(e?.message || "提示詞更新失敗");
    } finally {
      setSaving(false);
    }
  }

  async function changeMode(nextMode) {
    if (busy || nextMode === availabilityMode || !device?.lot?._id || !adminKey) return;
    setSavingMode(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/lots/${encodeURIComponent(device.lot._id)}/availability-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ availabilityMode: nextMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "模式更新失敗");
      const savedMode = data.lot.availabilityMode;
      setModeOverride(savedMode);
      const otherModeField = savedMode === "boolean" ? /\bvacancy\b/i : /\bhasAvailableSpace\b/i;
      const shouldReplacePrompt = otherModeField.test(promptText);
      if (shouldReplacePrompt) {
        setPromptText(savedMode === "boolean" ? BOOLEAN_SIGN_PROMPT : DEFAULT_VLM_PROMPT);
      }
      toast.success(shouldReplacePrompt
        ? "模式已更新，已帶入對應提示詞；請按「儲存」套用提示詞"
        : "停車場模式已立即更新");
    } catch (error) {
      toast.error(error?.message || "模式更新失敗");
      setSavingMode(false);
      return;
    }
    try { await onSaved?.(); }
    catch { toast.error("模式已更新，但列表重新整理失敗"); }
    finally { setSavingMode(false); }
  }

  const hasPrompt = String(promptText ?? "").trim().length > 0;


  return (
    <Modal isOpen={isOpen} toggle={handleClose} centered size="lg">
      <ModalHeader toggle={handleClose}>設定自訂 AI 模型提示詞</ModalHeader>

      <ModalBody>
        <div className="admin-dev-prompt-modal-body">

          <div
            style={{
              display: "flex",
              alignItems: "center"
            }}
          >
            <div style={{ width: "50%" }}>
              <div className="admin-dev-prompt-label">裝置 ID</div>
              <div className="admin-dev-prompt-deviceid">{device?.deviceId || "-"}</div>
            </div>

            <div style={{ width: "50%" }}>
              <div className="admin-dev-prompt-lot-heading">
                <div className="admin-dev-prompt-label admin-dev-prompt-lot-label">
                  目前停車場
                  {device?.lot && <span className={`admin-dev-prompt-mode is-${availabilityMode}`}>{availabilityMode === "boolean" ? "有無" : "數字"}</span>}
                </div>
                {device?.lot && <div className="admin-dev-prompt-mode-options" role="group" aria-label="停車場模式（立即生效）" aria-busy={savingMode}>
                  {[["boolean", "有無"], ["count", "數字"]].map(([mode, label]) => <button
                    key={mode} type="button"
                    className={`admin-dev-prompt-mode is-${mode}${availabilityMode === mode ? " is-active" : ""}`}
                    aria-pressed={availabilityMode === mode}
                    disabled={busy || !adminKey || !device.lot._id}
                    onClick={() => changeMode(mode)}
                  >{label}</button>)}
                  <span className="admin-dev-prompt-mode-note" role="status">{savingMode ? "更新中…" : "點選立即生效"}</span>
                </div>}
                <div className="admin-dev-prompt-deviceid">
                  {device?.lot?.name || "尚未連結"}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "16px",
              justifyContent: "space-between",
            }}
          >
            <div className="admin-dev-prompt-help" style={{ width: "-webkit-fill-available" }}>
              無自訂提示詞時，會使用系統預設提示詞。有自訂提示詞時則會用以判讀圖片。
            </div>
            {!hasPrompt ? (
              <button
                type="button"
                className="admin-dev-btn admin-dev-default-prompt-btn"
                onClick={() => setPromptText(defaultPrompt)}
                disabled={busy}
              >
                代入預設提示詞
              </button>
            ) : null}
          </div>

          <div>
            <div className="admin-dev-prompt-label" id="admin-dev-prompt-presets-label">預設提示詞</div>
            <p className="admin-dev-prompt-preset-help">{device?.lot
              ? "點選會取代下方文字，按「儲存」後生效。上方切換模式立即生效；若提示詞使用另一種類型的回傳欄位，會自動帶入對應預設提示詞，按「儲存」後套用。"
              : "請先連結停車場，再選擇符合該停車場模式的提示詞。"}</p>
            <div className="admin-dev-prompt-presets" role="group" aria-labelledby="admin-dev-prompt-presets-label">
              {PROMPT_PRESETS.map((preset) => {
                const compatible = preset.id === availabilityMode;
                const selected = promptText === preset.prompt;
                return <button
                  key={preset.id}
                  type="button"
                  className={`admin-dev-prompt-preset${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  disabled={busy || !device?.lot || !compatible}
                  onClick={() => setPromptText(preset.prompt)}
                >
                  {preset.label}
                  <span>{selected ? "已套用" : compatible && device?.lot ? "點選帶入" : `適用${preset.id === "boolean" ? "有／無" : "數量"}模式`}</span>
                </button>;
              })}
            </div>
          </div>

          <div>
            <div className="admin-dev-prompt-editor-heading">
              <div className="admin-dev-prompt-label">自訂提示詞</div>
              <div className="admin-dev-prompt-counter">{promptText.length} / 4000</div>
            </div>
            <textarea
              className="admin-dev-prompt-textarea"
              value={promptText}
              disabled={busy}
              onChange={(e) => setPromptText(e.target.value)}
              style={{
                resize: "none",
                padding: "5px 9px"
              }}
              placeholder={defaultPrompt}
            />
          </div>

        </div>
      </ModalBody>

      <ModalFooter className="admin-dev-prompt-footer">
        <button
          type="button"
          className="admin-dev-modal-btn admin-dev-modal-cancel"
          onClick={handleClose}
          disabled={busy}
        >
          取消
        </button>

        <button
          type="button"
          className="admin-dev-modal-btn admin-dev-modal-save"
          onClick={savePrompt}
          disabled={busy || promptText.length > 4000}
        >
          {saving ? "儲存中..." : "儲存"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
