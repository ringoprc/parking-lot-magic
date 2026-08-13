// frontend/src/pages/AdminDevicesPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import "./AdminDevicesPage.css";
import { Spinner } from "reactstrap";

import AdminDeviceLinkModal from "./AdminDeviceLinkModal";
import AdminDevicePromptModal from "./AdminDevicePromptModal";
import AdminDeviceBatteryModal from "./AdminDeviceBatteryModal";
import AdminDeviceLocationModal from "./AdminDeviceLocationModal";

import { 
  formatTime, 
  formatTimeYYYYMMDD_HHMMSS, 
  minutesAgo, 
  minSecAgo 
} from "../../utils/time";
import { getEffectiveChargingStatus } from "../../utils/deviceBattery";

import { MdOutlineArrowBackIos } from "react-icons/md";
import { FaChevronLeft, FaChevronRight, FaLocationDot } from "react-icons/fa6";
import { FaCheck, FaPencilAlt, FaLink, FaBolt } from "react-icons/fa";
import { 
  PiBatteryVerticalFull,
  PiBatteryVerticalHigh,
  PiBatteryVerticalMedium,
  PiBatteryVerticalLow
} from "react-icons/pi";
import { GoArrowRight } from "react-icons/go";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 40];
const DEFAULT_PAGE_SIZE = 10;
const CAPTURE_INTERVAL_OPTIONS = [5, 15, 30];
const DEFAULT_CAPTURE_INTERVAL_SEC = 30;
const DEFAULT_EXPOSURE_COMPENSATION_INDEX = 0;
const DEFAULT_EXPOSURE_COMPENSATION_MIN = -6;
const DEFAULT_EXPOSURE_COMPENSATION_MAX = 6;
const VACANCY_MODE_MANUAL = "manual_confirm";
const VACANCY_MODE_AUTO = "auto_apply_ai";
const DEVICE_ACTIVITY_ALL = "all";
const DEVICE_ACTIVITY_RECENT = "recent";
const DEVICE_ACTIVITY_INACTIVE = "inactive";

const DEVICE_ACTIVITY_OPTIONS = [
  {
    value: DEVICE_ACTIVITY_ALL,
    label: "顯示全部",
    title: "顯示所有裝置，不限制最近拍攝時間",
  },
  {
    value: DEVICE_ACTIVITY_RECENT,
    label: "僅顯示正在拍攝中",
    title: "僅顯示最近 5 分鐘內曾上傳圖像的裝置",
  },
  {
    value: DEVICE_ACTIVITY_INACTIVE,
    label: "僅顯示不在拍攝中",
    title: "僅顯示超過 5 分鐘未上傳圖像，或從未上傳圖像的裝置",
  },
];

//-----------------------
// Helpers
//-----------------------

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function finiteNumberOrDefault(v, fallback) {
  if (v === null || v === undefined || v === "") return fallback;

  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function batteryLevel(pct) {
  if (pct == null) return null;
  const p = Number(pct);
  if (!Number.isFinite(p)) return null;
  const v = Math.max(0, Math.min(100, Math.round(p)));
  return v;
}

function batteryColor(pct) {
  const p = batteryLevel(pct);
  if (p == null) return "#bbb";
  if (p >= 75) return "#4caf50"; // green
  if (p >= 20) return "#e67e22"; // orange
  return "#de1802";              // red
}

function clampExposureCompensationIndex(
  value,
  min = DEFAULT_EXPOSURE_COMPENSATION_MIN,
  max = DEFAULT_EXPOSURE_COMPENSATION_MAX
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_EXPOSURE_COMPENSATION_INDEX;

  const safeMin = finiteNumberOrDefault(
    min,
    DEFAULT_EXPOSURE_COMPENSATION_MIN
  );

  const safeMax = finiteNumberOrDefault(
    max,
    DEFAULT_EXPOSURE_COMPENSATION_MAX
  );

  const lo = Math.min(safeMin, safeMax);
  const hi = Math.max(safeMin, safeMax);

  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function formatExposureCompensationIndex(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (n > 0) return `+${n}`;
  return String(n);
}

function BatteryIcon({ pct, size = 16 }) {
  const p = batteryLevel(pct);
  if (p == null) return null;

  if (p >= 75) return <PiBatteryVerticalFull size={size} />;
  if (p >= 50) return <PiBatteryVerticalHigh size={size} />;
  if (p >= 25) return <PiBatteryVerticalMedium size={size} />;
  return <PiBatteryVerticalLow size={size} />;
}


//-----------------------
// Component
//-----------------------

export default function AdminDevicesPage({ apiBase }) {

  //-----------------------------
  // States
  //-----------------------------
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");
  const [isAdminConfirmed, setIsAdminConfirmed] = useState(false);

  // ParkingLotGroup: [{ _id, name, lotIds, ... }]
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("all");
  const [search, setSearch] = useState("");

  // search box text vs applied search (so typing won’t change the auto-refresh query)
  const [appliedSearch, setAppliedSearch] = useState("");

  // last fetch info
  const [lastFetchAt, setLastFetchAt] = useState(null); // number (ms)
  const [lastFetchError, setLastFetchError] = useState("");

  // prevent overlapping fetches (interval + manual actions)
  const inFlightRef = useRef(false);

  // sort
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  // Device visibility based on the latest image upload time.
  const [deviceActivityMode, setDeviceActivityMode] = useState(() => {
    const saved = localStorage.getItem("adminDeviceActivityMode");

    // Migrate the old third-state name.
    const normalizedSaved =
      saved === "shooting"
        ? DEVICE_ACTIVITY_INACTIVE
        : saved;

    return DEVICE_ACTIVITY_OPTIONS.some(
      (option) => option.value === normalizedSaved
    )
      ? normalizedSaved
      : DEVICE_ACTIVITY_ALL;
  });
  const [onlyAiProcessingEnabled, setOnlyAiProcessingEnabled] = useState(false);
  const [vacancyApplyMode, setVacancyApplyMode] = useState(VACANCY_MODE_MANUAL);
  const [vacancyApplyModeSaving, setVacancyApplyModeSaving] = useState(false);

  // page
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE });

  const [loading, setLoading] = useState(false);

  // deviceId -> edited vacancy
  const [editMap, setEditMap] = useState({});
  // deviceId -> true means user manually edited this vacancy input
  const vacancyTouchedRef = useRef({});
  const [confirmAllLoading, setConfirmAllLoading] = useState(false);

  const [zoomMap, setZoomMap] = useState({});          // deviceId -> number (1.0..6.0)
  const [zoomSavingMap, setZoomSavingMap] = useState({}); // deviceId -> boolean

  const [exposureCompensationMap, setExposureCompensationMap] = useState({}); // deviceId -> integer
  const [exposureSavingMap, setExposureSavingMap] = useState({}); // deviceId -> boolean

  const [captureIntervalMap, setCaptureIntervalMap] = useState({}); // deviceId -> 5 | 15 | 30
  const [aiProcessingEnabledMap, setAiProcessingEnabledMap] = useState({}); // deviceId -> boolean
  const [aiProcessingSavingMap, setAiProcessingSavingMap] = useState({}); // deviceId -> boolean

  // link modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalDevice, setLinkModalDevice] = useState(null);
  // prompt modal
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptModalDevice, setPromptModalDevice] = useState(null);
  // battery modal
  const [batteryModalDeviceId, setBatteryModalDeviceId] = useState(null);
  // location modal
  const [locationModalDeviceId, setLocationModalDeviceId] = useState(null);

  //-----------------------------
  // Set Admin Key
  //-----------------------------
  function persistAdminKey(v) {
    setAdminKey(v);
    localStorage.setItem("adminKey", v);
  }


  //-------------------------------------
  // Fetch Lot Groups and Update Mode
  //-------------------------------------
  async function fetchGroups() {
    if (!adminKey) return;
    const res = await fetch(`${apiBase}/api/admin/parking-lot-groups`, {
      headers: { "x-admin-key": adminKey },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "load groups failed");
    setGroups(Array.isArray(data?.rows) ? data.rows : []);
  }

  async function fetchVacancyApplyMode(opts = {}) {
    const { silent = false } = opts;

    if (!adminKey) return;

    try {
      const res = await fetch(`${apiBase}/api/admin/devices/vacancy-apply-mode`, {
        headers: { "x-admin-key": adminKey },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "load vacancy apply mode failed");

      const mode = data?.aiVacancyApplyMode === VACANCY_MODE_AUTO
        ? VACANCY_MODE_AUTO
        : VACANCY_MODE_MANUAL;

      setVacancyApplyMode(mode);
    } catch (e) {
      if (!silent) toast.error(e?.message || "讀取空位套用模式失敗");
    }
  }

  async function saveVacancyApplyMode(nextMode) {
    if (!adminKey) return;
    if (vacancyApplyModeSaving) return;

    const mode = nextMode === VACANCY_MODE_AUTO
      ? VACANCY_MODE_AUTO
      : VACANCY_MODE_MANUAL;

    const prevMode = vacancyApplyMode;

    setVacancyApplyMode(mode);
    setVacancyApplyModeSaving(true);

    try {
      const res = await fetch(`${apiBase}/api/admin/devices/vacancy-apply-mode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({
          aiVacancyApplyMode: mode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "更新空位套用模式失敗");

      const serverMode = data?.aiVacancyApplyMode === VACANCY_MODE_AUTO
        ? VACANCY_MODE_AUTO
        : VACANCY_MODE_MANUAL;

      setVacancyApplyMode(serverMode);

      toast.success(
        serverMode === VACANCY_MODE_AUTO
          ? "已切換為直接套用 AI 辨識結果"
          : "已切換為人工確認模式"
      );
    } catch (e) {
      setVacancyApplyMode(prevMode);
      toast.error(e?.message || "更新空位套用模式失敗");
    } finally {
      setVacancyApplyModeSaving(false);
    }
  }

  // fetch groups after adminKey is available (and whenever adminKey changes)
  useEffect(() => {
    if (!adminKey) return;
    fetchGroups().catch(() => {});
    fetchVacancyApplyMode({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  //-----------------------------
  // Fetch Filtered Lots
  //-----------------------------
  async function load(opts = {}) {
    const {
      silent = false,
      searchOverride,
      pageOverride,
      groupIdOverride,
      pageSizeOverride,
      sortByOverride,
      sortDirOverride,
      deviceActivityModeOverride,
      onlyAiProcessingEnabledOverride,
    } = opts;

    const effSearch = (searchOverride ?? appliedSearch);
    const effPage = (pageOverride ?? page);
    const effGroupId = (groupIdOverride ?? groupId);
    const effPageSize = (pageSizeOverride ?? pageSize);
    const effSortBy = (sortByOverride ?? sortBy);
    const effSortDir = (sortDirOverride ?? sortDir);
    const effDeviceActivityMode =
      deviceActivityModeOverride ?? deviceActivityMode;
    const effOnlyAiProcessingEnabled = (
      onlyAiProcessingEnabledOverride ?? onlyAiProcessingEnabled
    );

    if (!adminKey) {
      if (!silent) toast.error("請先輸入管理員密碼");
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(effPage),
        pageSize: String(effPageSize),
        groupId: effGroupId,
        search: effSearch,
        sortBy: effSortBy,
        sortDir: effSortDir,
        activityMode: effDeviceActivityMode,
        onlyAiProcessingEnabled: effOnlyAiProcessingEnabled ? "1" : "0",
      });

      const res = await fetch(`${apiBase}/api/admin/devices/phones?${qs.toString()}`, {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();

      console.log('[AdminDevicesPage] data:', data);

      if (!res.ok) {
        toast.error(data?.error || "密碼不正確");
        setIsAdminConfirmed(false);
        throw new Error(data?.error || "load failed");
      }

      setLastFetchAt(Date.now());
      setLastFetchError("");

      // Confirm Admin Status
      if (!isAdminConfirmed) toast.success("密碼正確");
      setIsAdminConfirmed(true);

      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
      setMeta(data?.meta || { total: nextRows.length, page: effPage, pageSize: effPageSize });

      // initialize editMap defaults (only if not already edited)
      setEditMap((prev) => {
        const copy = { ...prev };
        for (const r of nextRows) {
          const deviceId = r.deviceId;
          const suggested =
            r?.phone?.aiLastResult?.status === "ok"
              ? r?.phone?.aiLastResult?.vacancy
              : null;

          const lotSuggested = r?.lot?.aiSuggestedNextVacancy;
          const current = r?.lot?.vacancy;

          const nextDefault = suggested ?? lotSuggested ?? current ?? "";

          // If admin has not manually typed in this input,
          // keep syncing the input with latest backend/AI result.
          if (!vacancyTouchedRef.current[deviceId]) {
            copy[deviceId] = nextDefault;
          }
        }
        return copy;
      });

      setZoomMap((prev) => {
        const copy = { ...prev };
        for (const r of nextRows) {
          const deviceId = r.deviceId;
          if (copy[deviceId] == null) {
            // expects backend to return r.zoomRatio (see backend patch below)
            const z = Number(r?.zoomRatio);
            copy[deviceId] = Number.isFinite(z) ? z : 1.0;
          }
        }
        return copy;
      });

      setExposureCompensationMap((prev) => {
        const copy = { ...prev };

        for (const r of nextRows) {
          const deviceId = r.deviceId;
          if (!deviceId) continue;

          if (copy[deviceId] == null) {
            const min = finiteNumberOrDefault(
              r?.exposureCompensationMin,
              DEFAULT_EXPOSURE_COMPENSATION_MIN
            );

            const max = finiteNumberOrDefault(
              r?.exposureCompensationMax,
              DEFAULT_EXPOSURE_COMPENSATION_MAX
            );

            const raw =
              r?.exposureCompensationIndex ??
              r?.phone?.exposureCompensationIndex ??
              r?.config?.exposureCompensationIndex ??
              DEFAULT_EXPOSURE_COMPENSATION_INDEX;

            copy[deviceId] = clampExposureCompensationIndex(raw, min, max);
          }
        }

        return copy;
      });

      setCaptureIntervalMap((prev) => {
        const copy = { ...prev };

        for (const r of nextRows) {
          const deviceId = r.deviceId;
          if (!deviceId) continue;

          if (copy[deviceId] == null) {
            // Future backend options we may return:
            // r.captureIntervalSec
            // r.phone.captureIntervalSec
            // r.config.captureIntervalSec
            const raw =
              r?.captureIntervalSec ??
              r?.phone?.captureIntervalSec ??
              r?.config?.captureIntervalSec ??
              DEFAULT_CAPTURE_INTERVAL_SEC;

            const n = Number(raw);
            copy[deviceId] = CAPTURE_INTERVAL_OPTIONS.includes(n)
              ? n
              : DEFAULT_CAPTURE_INTERVAL_SEC;
          }
        }

        setAiProcessingEnabledMap((prev) => {
          const copy = { ...prev };

          for (const r of nextRows) {
            const deviceId = r.deviceId;
            if (!deviceId) continue;

            copy[deviceId] = r?.aiProcessingEnabled !== false;
          }

          return copy;
        });

        return copy;
      });

    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  // Auto refresh every 30 seconds (after admin is confirmed or something changed)
  useEffect(() => {
    if (!adminKey) return;
    if (!isAdminConfirmed) return;

    const t = setInterval(() => {
      load({ silent: true });
    }, 10_000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adminKey,
    isAdminConfirmed,
    page,
    groupId,
    appliedSearch,
    pageSize,
    sortBy,
    sortDir,
    deviceActivityMode,
    onlyAiProcessingEnabled,
  ]);

  
  //-----------------------------
  // Confirm Vacancy
  //-----------------------------

  async function confirmVacancy(deviceId) {
    if (!adminKey) return;

    const vRaw = editMap[deviceId];
    const v = toNum(vRaw);

    if (v == null || v < 0) {
      toast.error("vacancy 必須是 >= 0 的數字");
      return;
    }

    const res = await fetch(`${apiBase}/api/admin/devices/confirm-vacancy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ deviceId, vacancy: v }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || "更新失敗");
      return;
    }

    toast.success("已更新");
    delete vacancyTouchedRef.current[deviceId];
    await load();
  }

  // Confirm all
  async function confirmAllOnPage() {
    if (!adminKey) return;
    if (confirmAllLoading) return;
    if (!rows?.length) return;

    setConfirmAllLoading(true);
    try {
      let okCount = 0;
      let skipCount = 0;

      for (const r of rows) {
        const deviceId = r.deviceId;

        // only if linked lot + valid number
        if (!r?.lot?._id) { skipCount++; continue; }
        const v = toNum(editMap[deviceId]);
        if (v == null || v < 0) { skipCount++; continue; }

        const res = await fetch(`${apiBase}/api/admin/devices/confirm-vacancy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ deviceId, vacancy: v }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "更新失敗");
        okCount++;
      }

      toast.success(`本頁已確認 ${okCount} 筆（略過 ${skipCount} 筆）`);
      await load({ silent: true });
    } catch (e) {
      toast.error(e?.message || "本頁全部確認失敗");
    } finally {
      setConfirmAllLoading(false);
    }
  }


  //-----------------------------
  // Save Capture Interval
  //-----------------------------
  async function handleCaptureIntervalClick(deviceId, seconds) {
    if (!adminKey) return;
    if (!deviceId) return;

    const n = Number(seconds);
    if (!CAPTURE_INTERVAL_OPTIONS.includes(n)) {
      toast.error("拍攝間隔必須是 5、15 或 30 秒");
      return;
    }

    const prevValue = captureIntervalMap[deviceId] ?? DEFAULT_CAPTURE_INTERVAL_SEC;

    // optimistic UI update
    setCaptureIntervalMap((prev) => ({
      ...prev,
      [deviceId]: n,
    }));

    try {
      const res = await fetch(
        `${apiBase}/api/admin/devices/${encodeURIComponent(deviceId)}/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ captureIntervalSec: n }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "拍攝間隔更新失敗");

      const serverValue = Number(data?.captureIntervalSec);
      setCaptureIntervalMap((prev) => ({
        ...prev,
        [deviceId]: CAPTURE_INTERVAL_OPTIONS.includes(serverValue)
          ? serverValue
          : n,
      }));
    } catch (e) {
      setCaptureIntervalMap((prev) => ({
        ...prev,
        [deviceId]: prevValue,
      }));

      toast.error(e?.message || "拍攝間隔更新失敗");
    }
  }

  //-----------------------------
  // Save AI Processing Enabled
  //-----------------------------
  async function handleAiProcessingEnabledChange(deviceId, checked) {
    if (!adminKey) return;
    if (!deviceId) return;

    const nextValue = !!checked;
    const prevValue = aiProcessingEnabledMap[deviceId] !== false;

    setAiProcessingEnabledMap((prev) => ({
      ...prev,
      [deviceId]: nextValue,
    }));

    setAiProcessingSavingMap((prev) => ({
      ...prev,
      [deviceId]: true,
    }));

    try {
      const res = await fetch(
        `${apiBase}/api/admin/devices/${encodeURIComponent(deviceId)}/ai-processing-enabled`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ aiProcessingEnabled: nextValue }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI 處理設定更新失敗");

      setAiProcessingEnabledMap((prev) => ({
        ...prev,
        [deviceId]: data?.aiProcessingEnabled !== false,
      }));
      if (onlyAiProcessingEnabled && data?.aiProcessingEnabled === false) {
        setRows((prev) => prev.filter((r) => r.deviceId !== deviceId));
        setMeta((prev) => ({
          ...prev,
          total: Math.max(0, Number(prev?.total ?? 0) - 1),
        }));
      }

    } catch (e) {
      setAiProcessingEnabledMap((prev) => ({
        ...prev,
        [deviceId]: prevValue,
      }));

      toast.error(e?.message || "AI 處理設定更新失敗");
    } finally {
      setAiProcessingSavingMap((prev) => ({
        ...prev,
        [deviceId]: false,
      }));
    }
  }


  //-----------------------------
  // Save Zoom
  //-----------------------------
  async function saveZoom(deviceId) {
    if (!adminKey) return;

    const zRaw = zoomMap[deviceId];
    const z = Number(zRaw);
    if (!Number.isFinite(z)) return;

    const zoomRatio = Math.max(1.0, Math.min(10.0, z));
    console.log('zoomRatio:', zoomRatio);

    setZoomSavingMap((p) => ({ ...p, [deviceId]: true }));
    try {
      const res = await fetch(`${apiBase}/api/admin/devices/${encodeURIComponent(deviceId)}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ zoomRatio }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "zoom update failed");

      // normalize state to server response (in case it clamps)
      setZoomMap((p) => ({ ...p, [deviceId]: data.zoomRatio ?? zoomRatio }));
    } catch (e) {
      toast.error(e?.message || "zoom update failed");
    } finally {
      setZoomSavingMap((p) => ({ ...p, [deviceId]: false }));
    }
  }

  async function saveExposureCompensation(
    deviceId,
    valueOverride,
    minOverride,
    maxOverride
  ) {
    if (!adminKey) return;
    if (!deviceId) return;

    const raw = valueOverride ?? exposureCompensationMap[deviceId];

    const exposureCompensationIndex = clampExposureCompensationIndex(
      raw,
      minOverride,
      maxOverride
    );

    // Optimistic UI update. Do not use `data` here.
    setExposureCompensationMap((p) => ({
      ...p,
      [deviceId]: exposureCompensationIndex,
    }));

    setExposureSavingMap((p) => ({ ...p, [deviceId]: true }));

    try {
      const res = await fetch(
        `${apiBase}/api/admin/devices/${encodeURIComponent(deviceId)}/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ exposureCompensationIndex }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "EV update failed");

      // Normalize to server response, but keep using the phone-specific min/max.
      setExposureCompensationMap((p) => ({
        ...p,
        [deviceId]: clampExposureCompensationIndex(
          data?.exposureCompensationIndex ?? exposureCompensationIndex,
          minOverride,
          maxOverride
        ),
      }));
    } catch (e) {
      toast.error(e?.message || "EV update failed");
    } finally {
      setExposureSavingMap((p) => ({ ...p, [deviceId]: false }));
    }
  }


  //-----------------------------
  // Pagination
  //-----------------------------
  // load phones when page / group changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    groupId,
    pageSize,
    sortBy,
    sortDir,
    deviceActivityMode,
    onlyAiProcessingEnabled,
  ]);

  const pageCount = useMemo(() => {
    const total = toNum(meta?.total) ?? 0;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [meta, pageSize]);

  function onSearchSubmit() {
    const s = search.trim();
    setAppliedSearch(s);
    setPage(1);
    load({ searchOverride: s, pageOverride: 1 });
  }


  const fetchedAgo = lastFetchAt ? minSecAgo(new Date(lastFetchAt)) : null;


  //-----------------------------
  // Modals Open and Close
  //-----------------------------

  function openLinkModal(row) {
    setLinkModalDevice(row);
    setLinkModalOpen(true);
  }

  function closeLinkModal() {
    setLinkModalOpen(false);
    setLinkModalDevice(null);
  }

  function openPromptModal(row) {
    setPromptModalDevice(row);
    setPromptModalOpen(true);
  }

  function closePromptModal() {
    setPromptModalOpen(false);
    setPromptModalDevice(null);
  }


  const batteryModalRow = batteryModalDeviceId
    ? rows.find((r) => r.deviceId === batteryModalDeviceId) ?? null
    : null;

  //-----------------------------
  // Return JSX
  //-----------------------------
  return (
    <div className="admin-dev-outer" style={{ paddingTop: "2px", paddingBottom: "0px" }}>
      {/* Header */}
      <div className="admin-dev-header">

        <a className="admin-dev-back-btn" href="/?admin=1" aria-label="回到管理選單">
          <MdOutlineArrowBackIos size={18} />
        </a>
        <div className="admin-dev-title">裝置管理頁面</div>

        <div className="admin-dev-adminkey">
          <div className="admin-dev-label">管理員密碼</div>
          <div>
            <input
              className="admin-dev-input admin-password"
              value={adminKey}
              onChange={(e) => persistAdminKey(e.target.value)}
              style={{
                padding: "2px 10px",
                marginRight: "6px"
              }}
              placeholder="admin key"
            />
            <button className="admin-dev-btn apply-password" 
              onClick={() => {
                const s = search.trim();
                setAppliedSearch(s);
                setPage(1);
                load({ searchOverride: s, pageOverride: 1 });
              }}
              style={{
                padding: "2px 12px"
              }}
            >
              重新載入
            </button>
          </div>
        </div>
      </div>

      <div 
        style={{ 
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          marginTop: "3px", marginBottom: "1px"
       }}
      >
        <span style={{ fontSize: "12px", color: "#666" }}>排序</span>
        <select
          className="admin-dev-select admin-sorting"
          value={`${sortBy}_${sortDir}`}
          onChange={(e) => {
            const [nextSortBy, nextSortDir] = String(e.target.value).split("_");
            setSortBy(nextSortBy);
            setSortDir(nextSortDir || "desc");
            setPage(1);
            load({
              pageOverride: 1,
              sortByOverride: nextSortBy,
              sortDirOverride: nextSortDir || "desc",
            });
          }}
        >
          <option value="createdAt_desc">開始時間：近到遠</option>
          <option value="createdAt_asc">開始時間：遠到近</option>
          <option value="lastUploadAt_desc">圖像時間：近到遠</option>
          <option value="lastUploadAt_asc">圖像時間：遠到近</option>
          <option value="uploadCountSinceBoot_desc">開機後上傳次數：多到少</option>
          <option value="uploadCountSinceBoot_asc">開機後上傳次數：少到多</option>
          <option value="deviceId_asc">裝置 ID：A → Z</option>
          <option value="deviceId_desc">裝置 ID：Z → A</option>
        </select>

        <div
          className="admin-dev-activity-filter"
          role="group"
          aria-label="裝置拍攝狀態篩選"
        >
          {DEVICE_ACTIVITY_OPTIONS.map((option) => {
            const selected = deviceActivityMode === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className={[
                  "admin-dev-activity-option",
                  `mode-${option.value}`,
                  selected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={selected}
                title={option.title}
                onClick={() => {
                  if (selected) return;

                  setDeviceActivityMode(option.value);
                  localStorage.setItem(
                    "adminDeviceActivityMode",
                    option.value
                  );

                  setPage(1);

                  load({
                    pageOverride: 1,
                    deviceActivityModeOverride: option.value,
                  });
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={`admin-dev-toggle admin-dev-ai-enabled-filter-toggle ${
            onlyAiProcessingEnabled ? "is-on" : "is-off"
          }`}
          onClick={() => {
            const next = !onlyAiProcessingEnabled;
            setOnlyAiProcessingEnabled(next);
            setPage(1);
            load({
              pageOverride: 1,
              onlyAiProcessingEnabledOverride: next,
            });
          }}
          title={
            onlyAiProcessingEnabled
              ? "目前只顯示已開啟 AI 辨識的裝置"
              : "目前顯示所有裝置，不論 AI 辨識是否開啟"
          }
        >
          <span className="admin-dev-toggle-track">
            <span className="admin-dev-toggle-thumb" />
          </span>

          <span className="admin-dev-toggle-label">
            僅顯示開啟AI辨識裝置
          </span>
        </button>

        <button
          type="button"
          className={`admin-dev-toggle admin-dev-ai-mode-toggle ${
            vacancyApplyMode === VACANCY_MODE_AUTO ? "is-on is-danger" : "is-off"
          }`}
          disabled={vacancyApplyModeSaving}
          onClick={() => {
            const nextMode =
              vacancyApplyMode === VACANCY_MODE_AUTO
                ? VACANCY_MODE_MANUAL
                : VACANCY_MODE_AUTO;

            saveVacancyApplyMode(nextMode);
          }}
          title={
            vacancyApplyMode === VACANCY_MODE_AUTO
              ? "目前 AI 辨識完成後會直接更新真實空位數"
              : "目前 AI 辨識結果需要人工確認後才會更新真實空位數"
          }
        >
          <span className="admin-dev-toggle-track">
            <span className="admin-dev-toggle-thumb" />
          </span>

          <span className="admin-dev-toggle-label">
            {vacancyApplyMode === VACANCY_MODE_AUTO
              ? "直接套用 AI 辨識結果"
              : "人工確認模式"}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="admin-dev-filters">

        <div className="admin-dev-select-outer-div">
          <select
            className="admin-dev-select parking-log-groups"
            value={groupId}
            onChange={(e) => { setGroupId(e.target.value); setPage(1); }}
          >
            <option value="all">所有停車場群組</option>
            {groups.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name || String(g._id)}
              </option>
            ))}
          </select>

          <div className="admin-dev-search">
            <input
              className="admin-dev-input search-device-id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋裝置 ID..."
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchSubmit();
              }}
            />
            <button className="admin-dev-btn apply-search-id" onClick={onSearchSubmit}>
              搜尋
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          
          <div className="admin-dev-lastfetchat-div">
            <span style={{ marginRight: 10 }}>
              最近載入圖像：{" "}
            </span>
            <span>
              {lastFetchAt ? formatTimeYYYYMMDD_HHMMSS(new Date(lastFetchAt)) : "—"}
              {(() => {
                const ms = minSecAgo(new Date(lastFetchAt));
                if (!ms) return null;
                return (
                  fetchedAgo 
                  ? (<span>（{fetchedAgo.min} 分 {String(fetchedAgo.sec).padStart(2,"0")} 秒前）</span>) 
                  : null
                );
              })()}
            </span>
            {lastFetchError ? (
              <span style={{ color: "#c0392b" }}>
                (failed: {lastFetchError})
              </span>
            ) : null}
          </div>

          <div className="admin-dev-pagination-outer-div">

            <div className="admin-dev-confirm-all-button-div">
              <button
                className="admin-dev-confirm-all-button"
                disabled={confirmAllLoading || rows.length === 0}
                onClick={confirmAllOnPage}
                title="Confirm all on this page"
              >
                {confirmAllLoading ? (
                  <Spinner color="primary" />
                  ) : (
                  <>
                    <FaCheck size={19} />
                    <span>確認本頁全部空位</span>
                  </>
                )}
              </button>
            </div>

            <div className="admin-dev-pagination-div">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 10 }}>
                <span className="admin-dev-page-size-label">每頁</span>
                <select
                  className="admin-dev-select page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setPageSize(next);
                    setPage(1);
                    load({ pageOverride: 1, pageSizeOverride: next });
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pagination */}
              <div className="admin-dev-pagination">
                <button
                  className="admin-dev-navbtn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title="Prev"
                >
                  <FaChevronLeft />
                </button>

                <div className="admin-dev-pagelabel">
                  Page {page} / {pageCount} ({meta?.total ?? 0})
                </div>

                <button
                  className="admin-dev-navbtn"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  title="Next"
                >
                  <FaChevronRight />
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Grid */}
      <div className="admin-dev-body">
        {loading && false ? (
          <div className="d-flex align-items-center justify-content-center py-5">
            <Spinner color="primary" />
          </div>
        ) : (
          rows.length === 0 ? (
            <div className="d-flex align-items-center justify-content-center py-5"
              style={{ color: "#999" }}
            >
              <span>沒有裝置資料</span>
            </div>
          ) : (
            <div className="admin-dev-grid">
            {rows.map((r) => {
              const deviceId = r.deviceId;
              const aiProcessingEnabled = aiProcessingEnabledMap[deviceId] !== false;
              const aiProcessingSaving = !!aiProcessingSavingMap[deviceId];

              const vacancy = r?.lot?.vacancy ?? "";
              const aiVacancy =
                r?.phone?.aiLastResult?.status === "ok"
                  ? r?.phone?.aiLastResult?.vacancy
                  : null;
              const edited = editMap[deviceId] ?? "";
              
              // shotAgo color rules: > 60s red, > 30s orange
              const lastUploadAt = r?.phone?.lastUploadAt ?? null;
              const shotSecAgo = lastUploadAt
                ? Math.floor((Date.now() - new Date(lastUploadAt).getTime()) / 1000)
                : null;
              const uploadedAgo = lastUploadAt ? minSecAgo(new Date(lastUploadAt)) : null;
              const shotAtColor =
                shotSecAgo == null ? (r?.lot?.name ? "#333" : "#999") :
                shotSecAgo >= 60 ? "#de1802" :
                shotSecAgo >= 40 ? "#e67e22" :
                (r?.lot?.name ? "#333" : "#999");
              const aiLastProcessedAt = r?.phone?.aiLastProcessedAt ?? null;
              const aiProcessedAgo = aiLastProcessedAt
                ? minSecAgo(new Date(aiLastProcessedAt))
                : null;

              const aiProcessedSecAgo = aiLastProcessedAt
                ? Math.floor((Date.now() - new Date(aiLastProcessedAt).getTime()) / 1000)
                : null;

              const isAiBehindLatestImage =
                aiLastProcessedAt &&
                lastUploadAt &&
                new Date(aiLastProcessedAt).getTime() < new Date(lastUploadAt).getTime();

              const aiProcessedAtColor =
                !aiProcessingEnabled ? "#c7c7c7" :
                !aiLastProcessedAt ? "#999" :
                aiProcessedSecAgo >= 180 ? "#de1802" : //紅
                //isAiBehindLatestImage ? "#e67e22" :  //橙
                aiProcessedSecAgo >= 120 ? "#e67e22" :  //橙
                (r?.lot?.name ? "#333" : "#999");

              // confirmedAgo color rules: > 60s red, > 30s orange
              const lastConfirmedAt = r?.lot?.lastConfirmedAt ?? null;
              const confirmedSecAgo = lastConfirmedAt
                ? Math.floor((Date.now() - new Date(lastConfirmedAt).getTime()) / 1000)
                : null;
              const confirmedAgo = lastConfirmedAt ? minSecAgo(new Date(lastConfirmedAt)) : null;
              const confirmedAtColor = r?.lot?.name ? "#333" : "#999";
                //confirmedSecAgo == null ? (r?.lot?.name ? "#333" : "#999") :
                //confirmedSecAgo >= 60 ? "#de1802" :
                //confirmedSecAgo >= 30 ? "#e67e22" :
                //(r?.lot?.name ? "#333" : "#999");

              const batteryPct = r?.phone?.lastBatteryPct ?? null;
              const isChargingRaw = r?.phone?.lastIsCharging;
              const lastChargingAt = r?.phone?.lastChargingAt ?? null;

              const {
                isEffectivelyCharging,
              } = getEffectiveChargingStatus({
                batteryPct,
                lastIsCharging: isChargingRaw,
                lastChargingAt,
              });

              const createdAt = r?.phone?.createdAt ?? null;
              const createdAgo = createdAt ? minSecAgo(new Date(createdAt)) : null;
              const uploadCountSinceBoot = r?.phone?.uploadCountSinceBoot ?? null;

              const exposureMin = finiteNumberOrDefault(
                r?.exposureCompensationMin,
                DEFAULT_EXPOSURE_COMPENSATION_MIN
              );

              const exposureMax = finiteNumberOrDefault(
                r?.exposureCompensationMax,
                DEFAULT_EXPOSURE_COMPENSATION_MAX
              );

              const exposureCompensationIndex = clampExposureCompensationIndex(
                exposureCompensationMap[deviceId] ?? DEFAULT_EXPOSURE_COMPENSATION_INDEX,
                exposureMin,
                exposureMax
              );

              return (
                <div key={deviceId} className="admin-dev-card">
                  <div className="admin-dev-zoombar" title="Zoom">
                    <input
                      className="admin-dev-zoomrange"
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={zoomMap[deviceId] ?? 1.0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setZoomMap((p) => ({ ...p, [deviceId]: v }));
                      }}
                      onMouseUp={() => saveZoom(deviceId)}
                      onTouchEnd={() => saveZoom(deviceId)}
                    />
                    <div className="admin-dev-zoomlabel">
                      <span>{(Number(zoomMap[deviceId] ?? 1.0)).toFixed(1)}</span>
                      <span>x</span>
                    </div>
                  </div>

                  <div className="admin-dev-evbar" title="曝光補償 / EV">
                    <input
                      className="admin-dev-evrange"
                      type="range"
                      min={exposureMin}
                      max={exposureMax}
                      step="1"
                      value={exposureCompensationIndex}
                      disabled={!!exposureSavingMap[deviceId]}
                      onChange={(e) => {
                        const v = clampExposureCompensationIndex(
                          e.target.value,
                          exposureMin,
                          exposureMax
                        );

                        setExposureCompensationMap((p) => ({
                          ...p,
                          [deviceId]: v,
                        }));
                      }}
                      onMouseUp={(e) =>
                        saveExposureCompensation(
                          deviceId,
                          e.currentTarget.value,
                          exposureMin,
                          exposureMax
                        )
                      }
                      onTouchEnd={(e) =>
                        saveExposureCompensation(
                          deviceId,
                          e.currentTarget.value,
                          exposureMin,
                          exposureMax
                        )
                      }
                    />

                    <div className="admin-dev-evlabel">
                      <span style={{ marginRight: "1px" }}>亮</span>
                      <span>{formatExposureCompensationIndex(exposureCompensationIndex)}</span>
                    </div>
                  </div>

                  <div className="admin-dev-capture-intervals" title="拍攝間隔">
                    {CAPTURE_INTERVAL_OPTIONS.map((sec) => {
                      const selected =
                        Number(captureIntervalMap[deviceId] ?? DEFAULT_CAPTURE_INTERVAL_SEC) === sec;

                      return (
                        <button
                          key={sec}
                          type="button"
                          className={`admin-dev-capture-dot ${selected ? "is-selected" : ""}`}
                          onClick={() => handleCaptureIntervalClick(deviceId, sec)}
                          title={`每 ${sec} 秒拍攝一次`}
                        >
                          {sec}s
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="admin-dev-battery-badge"
                    role="button"
                    tabIndex={0}
                    aria-label={`查看 ${deviceId} 電池狀態`}
                    title="查看電池與充電資訊"
                    onClick={() => setBatteryModalDeviceId(deviceId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setBatteryModalDeviceId(deviceId);
                      }
                    }}
                    style={{ 
                      color: batteryColor(batteryPct),
                      border: `1px solid ${batteryColor(batteryPct)}`,
                      cursor: "pointer",
                    }}
                  >
                    {batteryPct == null ? (
                      <span style={{ color: "#bbb" }}>NA</span>
                    ) : (
                      <div>
                        {/* Deliberately making 100% battery shown as currently changing*/}
                        {isEffectivelyCharging && (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center"
                            }}
                          >
                            <FaBolt
                              size={10}
                              title="充電中"
                              style={{
                                color: batteryColor(batteryPct),
                                marginLeft: "-2px",
                                flexShrink: 0,
                              }}
                            />
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center"
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{batteryPct}</span>
                          <span style={{ flexShrink: "0", display: "inline-flex", alignItems: "center" }}>
                            <BatteryIcon pct={batteryPct} size={16} />
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="admin-dev-card-title"
                    style={{
                      display: "flex",
                      alignItems: "center"
                    }}
                  >

                    <div className="admin-dev-card-action-buttons">
                      <button
                        type="button"
                        title={r?.vlmPromptOverride?.trim() ? "已設定自訂提示詞" : "設定 VLM 提示詞"}
                        onClick={() => openPromptModal(r)}
                        className={`admin-dev-card-action-btn prompt-edit ${r?.vlmPromptOverride?.trim() ? "has-prompt" : ""}`}
                      >
                        <FaPencilAlt size={12} />
                      </button>
                      <button
                        type="button"
                        title="設定停車場連結"
                        onClick={() => openLinkModal(r)}
                        className="admin-dev-card-action-btn"
                      >
                        <FaLink size={13} />
                      </button>
                      <button
                        type="button"
                        title="查看裝置位置"
                        onClick={() =>
                          setLocationModalDeviceId(deviceId)
                        }
                        className="admin-dev-card-action-btn location"
                      >
                        <FaLocationDot size={13} />
                      </button>
                    </div>

                    <div className="admin-dev-lotmeta">
                      <div>
                        <span style={{ fontSize: "8px", color: r?.lot?.name ? "#333" : "#999", marginRight: "2px" }}>
                          [{r?.lot?.lotId ? r.lot.lotId : "-"}]{" "}
                        </span>
                        <span style={{ fontSize: "8px", color: r?.lot?.name ? "#333" : "#999" }}>
                          裝置 ID：{deviceId}
                        </span>
                      </div>
                      <span style={{ 
                        fontSize: "13.5px", 
                        color: r?.lot?.name ? "#333" : "#999",
                        paddingBottom: "1px",
                        marginBottom: "3px",
                        marginRight: "34px",
                        borderBottom: "1px solid",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        maxWidth: "84%",
                        overflow: "hidden"
                      }}>
                        {r?.lot?.name ? r.lot.name : "還未設定連結停車場"}
                      </span>
                      <span className="admin-dev-card-confirm-time"
                      style={{ fontSize: "8px", marginTop: "0.5px", color: confirmedAtColor }}>
                        開始時間：{createdAt ? formatTimeYYYYMMDD_HHMMSS(new Date(createdAt)) : "—"}
                        {createdAgo ? (
                          <span>
                            （{String(createdAgo.min).padStart(2, "0")} 分 {String(createdAgo.sec).padStart(2, "0")} 秒前）
                          </span>
                        ) : null}
                      </span>
                      <span className="admin-dev-card-shot-time"
                      style={{ fontSize: "8px", marginTop: "1.5px", color: shotAtColor }}>
                        拍攝時間：
                        {lastUploadAt ? formatTimeYYYYMMDD_HHMMSS(new Date(lastUploadAt)) : "—"}
                        {uploadedAgo ? (
                          <span>
                            （{String(uploadedAgo.min).padStart(2, "0")} 分 {String(uploadedAgo.sec).padStart(2, "0")} 秒前）
                          </span>
                        ) : null}
                      </span>

                      <span
                        className="admin-dev-card-ai-time"
                        style={{ fontSize: "8px", marginTop: "1.5px", color: aiProcessedAtColor }}
                      >
                        AI辨識：
                        {aiLastProcessedAt ? formatTimeYYYYMMDD_HHMMSS(new Date(aiLastProcessedAt)) : "—"}
                        {aiProcessedAgo ? (
                          <span>
                            （{String(aiProcessedAgo.min).padStart(2, "0")} 分 {String(aiProcessedAgo.sec).padStart(2, "0")} 秒前）
                          </span>
                        ) : null}
                        {isAiBehindLatestImage ? (
                          <span>非最新</span>
                        ) : null}
                      </span>
                      {/*
                      <span className="admin-dev-card-confirm-time"
                      style={{ fontSize: "8px", marginTop: "0.5px", color: confirmedAtColor }}>
                        確認空位時間：
                        {lastConfirmedAt ? formatTimeYYYYMMDD_HHMMSS(new Date(lastConfirmedAt)) : "—"}
                        {confirmedAgo ? (
                          <span>
                            （{String(confirmedAgo.min).padStart(2, "0")} 分 {String(confirmedAgo.sec).padStart(2, "0")} 秒前）
                          </span>
                        ) : null}
                      </span>
                      */}
                    </div>

                    <div className="admin-dev-deviceid">
                      
                    </div>
                  </div>
                  
                  <div className="admin-dev-imgwrap">
                    {r.imageUrl ? (
                      <img className="admin-dev-img" src={r.imageUrl} alt={deviceId} />
                    ) : (
                      <div className="admin-dev-noimg">no image</div>
                    )}
                  </div>

                  <div className="admin-dev-bottom" style={{ position: "relative" }}>

                    <label
                      className={`admin-dev-ai-processing-checkbox ${aiProcessingEnabled ? "is-on" : "is-off"}`}
                      title={aiProcessingEnabled ? "此裝置會進入 AI 辨識排程" : "此裝置不會進入 AI 辨識排程"}
                    >
                      <input
                        type="checkbox"
                        checked={aiProcessingEnabled}
                        disabled={aiProcessingSaving}
                        onChange={(e) => handleAiProcessingEnabledChange(deviceId, e.target.checked)}
                      />
                      <span>AI</span>
                    </label>

                    <div className="admin-dev-vrow">
                      <div className="admin-dev-vlabel">
                        <span style={{ marginRight: "8px" }}>
                          {vacancy !== "" && vacancy != null ? String(vacancy) : "-"}
                        </span>
                        <span style={{ paddingBottom: "5px" }}>
                          <GoArrowRight size={18} />
                        </span>
                      </div>
                      <input
                        className="admin-dev-vinput"
                        value={edited ?? ""}
                        placeholder="-"
                        onChange={(e) => {
                          vacancyTouchedRef.current[deviceId] = true;
                          setEditMap((prev) => ({ ...prev, [deviceId]: e.target.value }));
                        }}
                      />
                      <button
                        className="admin-dev-confirm"
                        onClick={() => confirmVacancy(deviceId)}
                        title="Confirm"
                      >
                        <FaCheck size={19} />
                      </button>
                    </div>
                  </div>
                </div>

              );
            })}
          </div>
          )
        )}
      </div>

      <AdminDeviceBatteryModal
        isOpen={!!batteryModalRow}
        device={batteryModalRow}
        onClose={() => setBatteryModalDeviceId(null)}
      />

      <AdminDeviceLocationModal
        isOpen={!!locationModalDeviceId}
        deviceId={locationModalDeviceId}
        apiBase={apiBase}
        adminKey={adminKey}
        onClose={() =>
          setLocationModalDeviceId(null)
        }
      />

      <AdminDeviceLinkModal
        isOpen={linkModalOpen}
        device={linkModalDevice}
        apiBase={apiBase}
        adminKey={adminKey}
        onClose={closeLinkModal}
        onSaved={() => load({ silent: true })}
      />
      <AdminDevicePromptModal
        isOpen={promptModalOpen}
        device={promptModalDevice}
        apiBase={apiBase}
        adminKey={adminKey}
        onClose={closePromptModal}
        onSaved={() => load({ silent: true })}
      />

    </div>
  );
}

