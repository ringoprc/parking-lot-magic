# React + Vite

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
