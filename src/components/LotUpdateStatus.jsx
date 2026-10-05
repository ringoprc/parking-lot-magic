import { formatTimeYYYYMMDD_HHMMSS, minSecAgo } from "../utils/time";
import "./LotUpdateStatus.css";

export default function LotUpdateStatus({ lastUpdated }) {
  const age = minSecAgo(lastUpdated);
  const delayed = age != null && age.min > 3;
  const relative = age == null ? "未知"
    : age.min < 1 ? "剛剛"
    : age.min < 60 ? `${age.min} 分鐘前`
    : age.min < 1440 ? `${Math.floor(age.min / 60)} 小時前`
    : `${Math.floor(age.min / 1440)} 天前`;
  const exact = age == null ? "尚無更新時間" : formatTimeYYYYMMDD_HHMMSS(lastUpdated);

  return (
    <div className={`lot-update-status${delayed ? " is-delayed" : ""}`} title={exact}
      aria-label={`最近更新：${exact}${delayed ? "，資料可能延遲" : ""}`}>
      最近更新：{relative}{delayed && "・資料可能延遲"}
    </div>
  );
}
