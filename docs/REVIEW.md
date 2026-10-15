# 獨立審查報告

審查日期：2026-10-15  
目標：`outputs/local-memory-bridge`

## 審查範圍與驗證邊界

唯讀檢視 `docs/PLAN.md`、`src/cli.js`、`src/server.js`、`src/memory.js`、`src/transport.js`、`test/cli.test.js`、`test/server.test.js`、`test/memory.test.js`、`test/transport.test.js` 與 `README.md`；未改實作、未安裝或執行第三方程式。也唯讀查核計畫鎖定的 `kittors/deepseek-web-api` commit `9b62d6a17ba502fa6aefa2dceb527d1e925aa6ce` 之 `sessionStore.ts` 和 `client.ts`。

未使用真實 DeepSeek 帳號或上游憑證，故登入、帳號狀態、實際回覆與私有網頁介面相容性均未驗證。這符合目前測試只使用 fake loopback server 的範圍。

人工 `record` 的 `contextHash` 是匯入當下快照，README 已說明它不能證明網頁實際收到的內容版本；這是明確揭露的 MVP 限制，不列為缺陷。

本代理在受限 sandbox 執行 `npm test` 時得到 18 pass、11 fail、1 skip；失敗請求都遭本機 TCP `connect EACCES 127.0.0.1:<port>` 阻擋，junction 測試也因該環境不允許建立 junction 而 skip，不能把這些結果當成程式行為失敗。主代理後續回報更新版記憶層 `npm test` 37/37 pass、0 skip，核心 85/85 pass，並通過核心 typecheck、lint、production build；本代理未重跑提權驗證。

模型識別：本代理沒有可讀取實際 model ID／reasoning effort 的執行資訊，因此不宣稱能獨立驗證自己實際使用 GPT-6-luna(max)；未嘗試切換模型。已知工具限制為 sandbox 封鎖 loopback 連線，後由主代理在允許環境完成驗證。

## 發現與處理狀態

### 已修正：人工回答檔的 UTF-8 解碼

審查最初看到 `record` 以 `readFile(path, 'utf8')` 解碼，Node.js 會把無效 UTF-8 位元組替換成 `U+FFFD`，可能將損壞或錯誤編碼的回答默默寫進 JSONL。主代理已在 `src/cli.js:47-51` 先限制位元組數，再以 `TextDecoder('utf-8', { fatal: true })` 嚴格解碼；`test/cli.test.js:43-48` 加入無效位元組案例並確認不寫入紀錄。此項已處理。

### 已修正：關閉服務時中斷進行中的回合

原本 `SIGINT`／`SIGTERM` 處理器呼叫 `closeAllConnections()`，會立即切斷客戶端 socket；上游工作仍可能完成並寫入回合紀錄，客戶端卻收不到回答，增加重送造成重複請求的風險。主代理已改為 `server.close()` 與 `closeIdleConnections()`（`src/cli.js:74`），讓已接受的請求完成後再退出。建議後續黑盒驗收覆蓋「上游延遲期間送出 SIGINT，回答與紀錄均正常完成」；目前所檢視測試沒有看到專門的 signal 測試。

### 已排除：chunked body 超限後無界累積

我曾將 `src/server.js:22-25` 誤讀為超限後仍會累積 chunk，現撤回此項。實際上每個 `data` chunk 都先增加 byte 計數；一旦超過 64 KiB 即 `return`，不會執行 `chunks.push(chunk)`，後續超限 chunk 也會走同一條返回路徑。現有測試使用大於限制的請求檢查 413；本次不把它列為缺陷。

### 已排除：相同提示詞造成 A/B 專案沿用同一上游 session

本 bridge 嚴格只送一則 user message，沒有傳 `chat_session_id`、conversation ID 或歷史。計畫鎖定的上游核心在 [`sessionStore.ts`](https://github.com/kittors/deepseek-web-api/blob/9b62d6a17ba502fa6aefa2dceb527d1e925aa6ce/src/deepseek/sessionStore.ts) 的 `resolve()` 只在 `messages.length > 1` 時走歷史 fingerprint；單一訊息回傳 `sessionId: null`。同一 commit 的 [`client.ts`](https://github.com/kittors/deepseek-web-api/blob/9b62d6a17ba502fa6aefa2dceb527d1e925aa6ce/src/deepseek/client.ts) 對此採 `reusedSession=false`、`sessionId=null`、`reuseSession=false`，因此建立新 session。依目前請求形狀，不需為避免 fingerprint 命中而把專案雜湊加進提示詞；若日後改成多輪歷史請求，應以明確的每專案 conversation ID 做隔離並加 A/B 回歸測試。

### 已處理：偽造 Host 測試

`fetch` 不適合用來驗證自訂 `Host` 標頭。最新 `test/server.test.js:14-18,52` 改用 `node:http.request` 的 `rawPost` 送出 `Host: evil.example`，才能實際觸發 server 的 Host 檢查；主代理回報 server 測試通過。

## 補充審查：PowerShell 啟動腳本

靜態檢視 `scripts/Start-DeepSeekCore.ps1`、`scripts/Start-MemoryAPI.ps1`，以及它們直接使用的核心設定。兩支腳本把服務 host 固定在 `127.0.0.1`，記憶 API 的 upstream URL 也固定使用 loopback；核心資料、登入態、session 與專用 Chrome profile 放在 `runtime/upstream/`。從腳本讀取 `.api-key` 時沒有把 key 印到輸出。`docs/VERIFICATION.md` 記錄兩支腳本只做語法解析與 core help/version 實測；沒有登入實帳。

### 已修正：啟動腳本復原 process 環境變數

複讀最新版本後，`Start-DeepSeekCore.ps1:11-15,17,43-46` 會先保存其覆寫的 `HOST`、`PORT`、`DS_*` 原值，再以外層 `try/finally` 在 Node 子程序結束後逐項復原；`Start-MemoryAPI.ps1:15,17,33-35` 同樣保存 `BRIDGE_UPSTREAM_KEY` 原值，無論服務成功或拋錯都會還原，因此由 `.api-key` 載入的 key 不會留在呼叫端 PowerShell。新增的 `test/launchers.test.js:22-40` 以替身子程序分別驗證既有 core 設定會復原、原先不存在的 upstream key 不會洩漏；主代理回報最新整套 `npm test` 為 37/37 pass、0 skip。此項已處理，未重跑測試。

### Windows 與 CDP 限制

核心以 Node 檔案 API 的 `mode: 0o600/0o700` 建立 key、auth 與 runtime 檔案；PowerShell 腳本沒有設定或檢查 NTFS ACL。`runtime/upstream/` 因此使用上層目錄繼承的 Windows 權限，不能只憑 POSIX mode 數字認定為 owner-only。文件已要求不要分享或打包 runtime；登入前還應確認其實際 ACL，並避免放在會同步或共用的位置。

`Start-DeepSeekCore.ps1:25-29` 以 `TcpListener` 取得 loopback ephemeral port 後立即釋放，再把該 port 指給 CDP，存在短暫的 port reuse race。核心自身的 `freePort()` 也採先取得後關閉的常見流程；核心會探測 CDP endpoint 並使用專用 profile。沒有證據顯示本次造成錯連，故列為低機率平台限制而非已重現缺陷；不要把「避免沿用一般瀏覽器」表述成對同機惡意程序的絕對隔離保證。

`Start-DeepSeekCore.ps1 -Port` 與 `Start-MemoryAPI.ps1 -UpstreamPort` 分開設定；改核心 port 時，必須同時將記憶 API 的 upstream port 設為相同值，否則預設仍連 8787。預設設定相符，README 目前只示範預設值。

## 交付文件狀態

補充審查時 `docs/VERIFICATION.md` 已存在，README 對該檔的連結可解析。它記錄本機 Windows 測試及其範圍，並明確列出真實登入、當期額度與真實回答品質尚未驗證。

截至本次更新，人工回答嚴格解碼、服務優雅關閉與 PowerShell 啟動腳本的環境變數復原均已由主代理修正；最新 `docs/VERIFICATION.md` 記載記憶層測試 37/37 通過。真實帳號登入與實際網頁回覆仍未驗證；其餘執行狀態依驗證紀錄與主代理回報，並非本代理在受限 sandbox 獨立重現。
