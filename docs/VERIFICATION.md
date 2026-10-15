# 成品驗證紀錄

2026-10-15，Local Memory Bridge 0.2.0，Windows，Node.js 24.18.0。

## 結果

- 本機完整 `npm test`：62 passed、0 failed、0 skipped。
- 修正版核心 `pnpm test`：15 test files、95 passed；typecheck、lint、production build 通過。
- 真實帳號兩回合記憶與 HTTP API：逐字比對通過，分別 9.384 秒、8.655 秒。
- 真實檔案代理：read_file → create_file → replace_text → final，4 個模型回合、25.893 秒；本機實檔、3 筆工具 audit 與 1 份修改前備份驗證通過。

詳見 [ACCEPTANCE.md](ACCEPTANCE.md)。測試耗時只描述當次短任務，不能推估長期速度或免費額度。

## 本機測試涵蓋

跨程序記憶、每回合重讀、A/B 專案隔離、初始化不覆寫、JSONL、SHA-256、上下文長度、專案操作鎖、UTF-8 嚴格解碼、Host/Origin 與 Bearer 驗證、上游錯誤、截斷/空白回覆、逾時及大小限制。

檔案工具測試涵蓋：實際列目錄、讀取、exclusive 新建、唯一文字替換、修改前備份與 audit、舊 hash 不符、路徑越界、絕對路徑、ADS、秘密檔與記憶規則保護、Windows 裝置名、symlink/junction、hardlink 與內部備份目錄連結拒絕。

代理迴圈測試涵蓋：多步讀取/建立/修改真實 fixture 檔案，非 JSON 回覆、未授權工具、步數上限，以及未完成任務不寫完成紀錄。PowerShell 啟動腳本以替身子程序確認環境變數不殘留。

## 實測修正

初版核心在實帳中重現了 Chrome 導頁競態與 SSE operation 壓縮漏字，已最小修正並新增 10 項核心回歸測試。啟動腳本改用 18787，避免本機既有 Headroom 8787 衝突。修改明細見 THIRD_PARTY.md。

初版沙箱曾封鎖 loopback 或依賴連結，造成 EACCES/TS7006；最終測試在正常依賴與本機連線權限下執行，沒有略過測試。

## 界線

使用者親自完成登入；測試只使用獨立虛構專案。沒有改動其他既有專案，也沒有把認證資料放入分享 ZIP。受限檔案代理只支援指定專案內的小型 UTF-8 文字檔，沒有 shell 或刪除工具；不是作業系統 sandbox。

尚未驗證長時間穩定性、大型程式庫工作、多人並行操作、當期總額度或實際上游模型身份。服務中斷或程序崩潰可能造成結果未知；不自動重送。參照 README 的鎖檔與備份復原說明。

先前的本機 v0.2.0 交付 ZIP 已獨立完成允許清單、解壓、逐檔 hash 與重測；該次封裝報告不是這份 Git repo 的發布紀錄。

## Repo 發布前檢查

- 從 Git commit 建立乾淨 clone，沒有複製登入態或既有 `node_modules`。
- 依 README 指令安裝 `playwright-core@1.61.1`；僅安裝 1 個 runtime 套件，未下載瀏覽器。
- 在乾淨 clone 重跑本機測試：62 passed、0 failed、0 skipped；核心 `--help` 可啟動。
- `node scripts/check-docs.mjs`：18 份 Markdown、59 個本機連結、160 格 GIF 與 268 個已追蹤路徑通過檢查。
- 表頭 PNG：2172 × 724。熱力圖 GIF：1280 × 690、160 格、16 秒、無限循環、775,323 bytes；已抽取六個階段檢查畫面，附 1280 × 690 靜態 PNG。
- `runtime/`、`node_modules/`、`.env` 與測試專案都已排除；Git 不含實際帳號認證資料。

GitHub Actions 另會在 Windows 的 Node.js 22 與 24 執行同一組本機測試和文件檢查；當前狀態請查看 repo 的 Actions 頁面。
