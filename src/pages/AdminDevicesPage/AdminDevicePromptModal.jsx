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

判讀成功時，輸出格式：{"status": "ok", "vacancy": "ooo"}，比如 {"vacancy": "000"}、{"vacancy": "128"}, 或 {"vacancy": "003"}
判讀失敗時，輸出格式：{"status": "unknown", "vacancy" "null"}
`;

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

  const currentSavedPrompt = useMemo(() => {
    return String(device?.vlmPromptOverride ?? "");
  }, [device?.vlmPromptOverride]);

  useEffect(() => {
    if (!isOpen) return;
    setPromptText(currentSavedPrompt);
  }, [isOpen, currentSavedPrompt]);

  function handleClose() {
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
      handleClose();
      await onSaved?.();
    } catch (e) {
      toast.error(e?.message || "提示詞更新失敗");
    } finally {
      setSaving(false);
    }
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
              <div className="admin-dev-prompt-label">目前停車場</div>
              <div className="admin-dev-prompt-deviceid">{device?.lot?.name || "尚未連結"}</div>
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
                onClick={() => setPromptText(DEFAULT_VLM_PROMPT)}
              >
                代入預設提示詞
              </button>
            ) : null}
          </div>

          <div>
            <div className="admin-dev-prompt-label">自訂提示詞</div>
            <textarea
              className="admin-dev-prompt-textarea"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              style={{
                resize: "none",
                padding: "5px 9px"
              }}
              placeholder={DEFAULT_VLM_PROMPT}
            />
          </div>

          <div>
            <div className="admin-dev-prompt-counter">
              {promptText.length} / 4000
            </div>
          </div>

        </div>
      </ModalBody>

      <ModalFooter className="admin-dev-prompt-footer">
        <button
          type="button"
          className="admin-dev-modal-btn admin-dev-modal-cancel"
          onClick={handleClose}
          disabled={saving}
        >
          取消
        </button>

        <button
          type="button"
          className="admin-dev-modal-btn admin-dev-modal-save"
          onClick={savePrompt}
          disabled={saving || promptText.length > 4000}
        >
          {saving ? "儲存中..." : "儲存"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

