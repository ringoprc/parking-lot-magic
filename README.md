# React + Vite

## 用戶資料管理

登入後從帳號選單「帳號與車輛資料管理」進入 `?profile=1`。
車牌透過車型說明下方的「送出車牌號碼」提交；照片在選取、更換或移除後立即儲存。
尚未送出車牌或正在修改車牌時，先提交車牌才能操作照片，避免照片與車牌錯配。
資料頁不提供分享偏好設定；請使用地圖左下角的「顯示我的位置給其他用戶」開關。
分享開關只設定偏好；必須先透過地圖定位成功，才會取得新位置並分享給其他已登入用戶。
尚未定位時顯示「正在等待開啟定位，成功定位後分享位置與車型」，不會自行啟動定位或上傳位置。
右下角定位按鈕在已定位時可再次按下，清除自己的定位標記並停止位置分享；分享偏好保留，直到再次成功定位才恢復分享。
短暫定位逾時或連線失敗會自動重試，且每次重試重新取得位置；關閉分享、離開頁面或定位權限被拒絕會停止。
其他用戶標記在短暫讀取失敗時保留至原本的 60 秒期限，成功回應已移除的分享則立即移除；不延長舊位置的有效期限。
重新載入後需按定位；同一頁面已完成地圖定位且分享仍開啟時，從背景返回會重新取得位置並恢復分享。每次取得新定位後約 10 秒再定位，
其他用戶的標記約每 5 秒更新；只顯示位置與內勤設定的車型，未設定時顯示「車型待確認」。
切到背景、離開地圖或關閉分享會停止發布。連線中斷時，最後位置最多 60 秒失效。
左下角另有「顯示其他用戶的位置」開關，預設開啟並記住此瀏覽器的選擇；
關閉會移除標記、取消進行中的讀取並停止輪詢，不影響自己是否分享位置。
未登入時顯示登入提示。
支援一組車牌、四個選填照片欄位及預設關閉的地圖分享偏好。
車型只顯示後端資料；內勤設定介面仍待實作。
位置分享需要 HTTPS（本機 localhost 例外）、瀏覽器定位權限與登入 Cookie。
前後端需同步部署；不需要新增第三方服務或環境變數。
車牌與選填照片整合於「我的車輛」，照片用於協助內勤確認車輛屬於用戶。
已設定車型的用戶可送出「車型有誤」回報及最多 500 字補充說明；回報狀態
會保留，內勤可在後台帳號列表查看。尚未設定車型時不顯示回報入口。

照片可選 JPG / PNG / WebP（每張原檔最多 10 MB），上傳前轉為最長邊
1280px、最多 600 KiB 的 WebP，四張合計不超過 2.4 MiB。
此版本需一併部署後端 `/api/profile` 和 `vercel.json` 的同源代理規則。
開發時沿用 `VITE_API_BASE`；正式環境的照片讀取和資料儲存皆帶登入 Cookie。

## Google 登入部署

正式 build 的登入請求固定使用同源 `/api/auth/*`，由根目錄的
`vercel.json` 轉送到 Cloud Run。這讓登入 Cookie 保存在前端網域，避免手機
瀏覽器封鎖跨網站 Cookie 而無法登入。`VITE_API_BASE` 仍供其他 API 使用；
`npm run dev` 的登入也使用此變數連線本機後端。

部署時必須一併發布前端與 `vercel.json`。其他託管平台（包括本機
`vite preview`）若要測試登入，需提供相同的 `/api/auth/*` 反向代理。
Cloud Run 網址變更時，請同步更新 rewrite destination。後端需允許前端
Origin，Cookie 保持 HttpOnly、Secure，不設定 Cloud Run 的 Domain；
同源代理可使用 `SameSite=lax`。後端的 `Cache-Control: no-store` 不可覆寫為快取。

部署後確認 `/api/auth/session` 回傳 JSON，並在手機封鎖第三方 Cookie 時
測試登入、重新整理後維持登入、登出。改版前登入 Cookie 保存在 API 網域的
使用者需要重新登入一次。

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
