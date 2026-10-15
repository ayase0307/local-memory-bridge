# DeepSeek 本機橋接候選：GitHub 唯讀審查

查核日期：2026-10-15  
範圍：只讀檢視 GitHub 頁面、README、LICENSE、程式碼與可見 Issues；沒有安裝、執行專案或呼叫其 API。因此以下是靜態證據，不是 Windows 實機或帳號測試結果。

## 結論

**技術上最貼近 Windows 個人本機 OpenAI 相容橋接的是 [kittors/deepseek-web-api](https://github.com/kittors/deepseek-web-api)。** 它直接提供本機 Chat Completions 與 Responses 路由，README 指定預設綁定 127.0.0.1:8787、API key 驗證，並以 Node.js、pnpm 和 Chrome/CDP 管理登入態。這是依文件與程式碼做的適配判斷；沒有實際驗證 Windows 執行成功。

**條款面沒有可推薦直接使用的候選。** DeepSeek 官方條款 3.5(3) 禁止擷取或複製服務內容，包括使用 robots、spiders 或其他自動化設定，以及建立 mirrors；同條也提及逆向工程與探查底層元件。三個專案分別以私有 Web API、Playwright 自動化或逆向 API 取得並轉送 DeepSeek 網頁服務內容，和條款列出的行為高度重疊。個人用途、低速、只讀 DOM 或本機綁定本身都不能推論為條款例外；本報告不作法律判定。

| 專案 | 對本機橋接的適配 | 已查到的主要限制 |
|---|---|---|
| [kittors/deepseek-web-api](https://github.com/kittors/deepseek-web-api) | **最高**：本機 OpenAI 相容 API、loopback、API key、Responses/Chat Completions、Chrome/CDP。 | 依賴私有 API、PoW worker 與登入態；只支援文字；tool calling 是提示詞模擬，不能保證。開放中的 [Issue #11](https://github.com/kittors/deepseek-web-api/issues/11) 報告 DSML 工具標記可能以原始文字漏到回覆；我沒有重現。 |
| [exdj158/deepseek-browser-agent](https://github.com/exdj158/deepseek-browser-agent) | **低**：它是自主 coding agent CLI，不是通用本機 API bridge。 | README 說目前只在 Linux 測試，Windows 路徑處理可能要修；也說沒有自動化測試。使用 Playwright 操作網頁，並能讀寫刪除檔案、執行 shell 命令。GitHub 頁面沒有 Issues 分頁，故無法核對 issue 清單。 |
| [JinBeiCN/DeepSeek-Free-API](https://github.com/JinBeiCN/DeepSeek-Free-API) | **中低**：有 OpenAI 相容路由，但不適合直接視為安全的 Windows 本機服務。 | README 要求中國大陸 IP，須手動複製 userToken。程式預設 host fallback 為 0.0.0.0；程式會把對話內容及 token 寫入 logger 呼叫。V4 名稱是別名，不能證明上游實際使用 V4。LICENSE 標示不一致。 |

## 證據與作者宣稱的界線

### kittors/deepseek-web-api

README 宣稱提供 /v1/responses、/v1/chat/completions、API key 保護和 Chrome/CDP 登入態。靜態程式碼可確認 [src/deepseek/client.ts](https://github.com/kittors/deepseek-web-api/blob/main/src/deepseek/client.ts) 串起登入、session、PoW 與上游串流；[src/deepseek/pow.ts](https://github.com/kittors/deepseek-web-api/blob/main/src/deepseek/pow.ts) 讀取 userToken、呼叫 /api/v0/chat/create_pow_challenge、載入 worker，並建立聊天 session；[src/browser/login.ts](https://github.com/kittors/deepseek-web-api/blob/main/src/browser/login.ts) 管理 token、cookie 和登入快照。這些佐證 bridge 的實作方式，沒有證明目前服務端仍接受這些私有呼叫。

README 要求 Node.js 20+、pnpm 10、Chrome/Chromium，並聲明只支援文字、工具呼叫依賴提示詞且不保證模型遵守。作者亦承認依賴私有 Web API、PoW worker 與帳號風控，可能無預警失效。[架構文件](https://github.com/kittors/deepseek-web-api/blob/main/docs/architecture.md)、[README](https://github.com/kittors/deepseek-web-api/blob/main/README.md)、[MIT LICENSE](https://github.com/kittors/deepseek-web-api/blob/main/LICENSE)。

### exdj158/deepseek-browser-agent

README 宣稱它用 Playwright 控制 Chromium、讀取 DeepSeek 回覆，並提供本機檔案和 shell 工具。這不是把模型服務轉成一般 OpenAI 相容 endpoint 的 bridge。[src/browser.js](https://raw.githubusercontent.com/exdj158/deepseek-browser-agent/main/src/browser.js) 可直接看到持久化瀏覽器 context、DOM selector、訊息輸入與回覆擷取，也設置 navigator.webdriver=false 及自動化相關 browser flags。[README](https://github.com/exdj158/deepseek-browser-agent/blob/main/README.md) 自承 Windows 路徑尚未確認；[package.json](https://github.com/exdj158/deepseek-browser-agent/blob/main/package.json) 定義 Playwright 與 postinstall 腳本；[LICENSE](https://github.com/exdj158/deepseek-browser-agent/blob/main/LICENSE) 為 MIT。GitHub 頁面標示 fork 自 Omar-Azam/forge-agent，但 README 和 package.json 的 repository/homepage 指向 Omar-Azam/deepseek-browser-agent，來源資訊不一致。作者自己的 README 也提醒瀏覽器自動化可能違反被操作網站的條款。

### JinBeiCN/DeepSeek-Free-API

README 宣稱支援 OpenAI、Gemini、Claude 相容路由、V4 模型別名與本機/內網用途，並要求中國大陸 IP。[README](https://github.com/JinBeiCN/DeepSeek-Free-API/blob/master/README.md) 和程式碼需要分開看：

- [src/api/controllers/chat.ts](https://github.com/JinBeiCN/DeepSeek-Free-API/blob/master/src/api/controllers/chat.ts) 直接呼叫 DeepSeek 私有 endpoints、計算 PoW，並以 fake headers 發送請求；程式呼叫 logger.info(messages) 及記錄 refresh token。logger 預設寫入 ./logs，這與 README「不儲存使用者資料」的概括宣稱有落差。
- [src/api/routes/models.ts](https://github.com/JinBeiCN/DeepSeek-Free-API/blob/master/src/api/routes/models.ts) 列出 V4 名稱；但 controller 的實際上游 completion body 只傳 prompt、搜尋與思考旗標，沒有把要求的 model ID 傳給上游。README 也明說名稱只作功能旗標，實際模型取決於 DeepSeek 網頁預設值。**因此不能把 V4 alias 清單當成已證實的 V4 模型選擇。**
- [src/lib/configs/service-config.ts](https://github.com/JinBeiCN/DeepSeek-Free-API/blob/master/src/lib/configs/service-config.ts) 的 fallback host 是 0.0.0.0、port 5566；[src/lib/server.ts](https://github.com/JinBeiCN/DeepSeek-Free-API/blob/master/src/lib/server.ts) 依該 host 監聽。若追求只在本機使用，需先確認實際環境設定與綁定。
- LICENSE 檔實際內容是 [GNU GPL v3](https://github.com/JinBeiCN/DeepSeek-Free-API/blob/master/LICENSE)，GitHub 也標示 GPL-3.0；但 [package.json](https://github.com/JinBeiCN/DeepSeek-Free-API/blob/master/package.json) 寫 ISC，README 又稱 ISC 並加上非商用限制。授權資訊互相矛盾，不能只依 README 的簡述判斷。Issues 頁面目前顯示 0 個 open issues。

## 查核限制

沒有執行任何專案，故沒有實際觀察到模型或工具的「不支援」執行錯誤，也沒有驗證模型回傳內容、API 是否仍可用、Windows 安裝流程或帳號風控結果。對 JinBei 的模型結論是依 controller 請求欄位與 README 的明示說明；對 kittors 的相容性結論是文件與程式碼檢視，不能代替執行測試。

