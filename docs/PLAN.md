# DeepSeek 網頁橋接與本機專案記憶計畫書

查核日期：2026-10-15。初版：MVP 0.1；目前版本：0.2.0，已新增受限檔案代理並完成真實驗收。

最新結果見 [ACCEPTANCE.md](ACCEPTANCE.md)，檔案代理規格見 [FILE-AGENT.md](FILE-AGENT.md)。下方保留最初研究與設計背景；其中「尚未實帳」是初版狀態，已由最新驗收更新。

## 評估結論

技術可行，已有相近開源核心，不值得從零重寫登入、網頁私有協定與 PoW。本專案的新增價值是可稽核的本機記憶注入、專案隔離與失敗處理。網頁免費使用不代表獲得免費 API 授權、無限額度或穩定服務承諾；本次沒有實測使用者帳號速度或可用額度。

DeepSeek 官方 2026-03-27 Terms of Use 第 3.5(3) 列出逆向、自動擷取及鏡像相關限制；第 8.2 列出限制或關閉帳號等措施。這使網頁轉 API 存在明確條款風險，不能宣稱符合官方授權。是否涵蓋特定個人操作方式仍須依完整條款判讀，這裡不提供法律結論。正式或長期依賴建議使用官方 API。人工複製提示詞與匯入自己取得的回答可作為離線工作流程。

來源：
- https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html
- https://github.com/kittors/deepseek-web-api
- https://github.com/ForgetMeAI/FreeDeepseekAPI
- https://github.com/exdj158/deepseek-browser-agent
- https://github.com/JinBeiCN/DeepSeek-Free-API

## 現有方案與取捨

| 方案 | 用途 | 評估 |
| --- | --- | --- |
| kittors/deepseek-web-api | 本機 OpenAI-compatible API，專用 Chrome 登入 | 核心精簡、MIT、明確揭露限制，作為首選研究候選；不代表已完成實帳驗證 |
| ForgetMeAI/FreeDeepseekAPI | 本機 OpenAI/Anthropic/Responses proxy | 功能較完整，可作備選；需另外審核帳號池、登入與記憶/session 行為 |
| exdj158/deepseek-browser-agent | Playwright 操作網頁及本機工具 | 更接近 coding agent；執行模型提出的本機操作增加權限面，超出本 MVP |
| JinBeiCN/DeepSeek-Free-API | 網頁私有協定轉 API | LICENSE 為 GPLv3，README/package.json 卻標 ISC；另查到 token/對話送進 logger 的路徑，不選用 |

首選核心查核快照：`kittors/deepseek-web-api` commit `9b62d6a17ba502fa6aefa2dceb527d1e925aa6ce`，MIT，GitHub API 顯示 pushed_at 為 2026-09-12。資料來自唯讀查詢，沒有執行其程式。閱讀 README、package.json、docs/architecture.md、src/deepseek/client.ts；確認它透過 browser-derived auth 呼叫私有 completion 流程，不是只模擬網頁輸入。README 的功能敘述不等於本機實測結果。

後續本機驗證：以 frozen lockfile、停用 install scripts 安裝依賴，85 項核心單元測試、typecheck、production build 與 lint 全部通過。受限 sandbox 曾因 pnpm 依賴連結存取受阻出現 TS7006，改以正常依賴權限重跑官方 typecheck 後通過，未修改第三方原始碼。已把 source、dist、MIT LICENSE、lockfile 與 Playwright runtime 1.61.1 納入 `core/`，另提供 PowerShell 啟動腳本。沒有啟動登入、呼叫實帳或測得免費額度。

獨立審查另核對該 commit 的 `src/deepseek/sessionStore.ts` 與 `src/deepseek/client.ts`：單一 user message、沒有 conversation/session ID 時建立新上游 session。因此本 MVP 每回合送完整獨立封包；跨回合記憶來自兩個本機檔案，不依賴上游自動接續。換核心或升級版本後須重驗此行為。

## 三個實作選項

1. **沿用核心 + 自建記憶層，建議。** 核心可替換、低維護成本，保留條款與上游失效風險。
2. 從零做瀏覽器擴充功能與本機 companion：能直接操作可見 DOM，但安裝、配對、訊息完整性及 DOM 變更維護較重，並不能因此排除條款限制。
3. 官方 API + 同一記憶層：長期較容易維護，會有 API 費用。MVP 先提供本機相容介面，官方遠端 adapter 屬後續選項。

## 產品範圍與資料流

`CLI / 本機 API → 固定專案目錄 → 重新讀 agent.md + memory.md → 單一上下文封包 → localhost 上游橋接 → 回答 → 本機逐回合紀錄`

每回合完整讀取兩個 UTF-8 檔案，直接把內容放進提示詞，不需要上傳檔案附件。這是外部記憶，不是修改模型權重。輸入長度越大，傳送與處理成本越高，也可能降低遵循程度。MVP 明訂字元上限，超出即報錯，不能悄悄截斷規則。字元數不冒充精確 token 數。

專案結構：

```text
my-project/
  agent.md                  人工維護的規則
  memory.md                 明確寫入的長期事實與決策
  .memory-bridge/
    turns.jsonl             完成回合，含使用的上下文雜湊
    lock                    跨程序操作鎖，失敗後須檢查再處理
```

本機程式不遞迴掃描專案、不讀 `.env`、cookies 或瀏覽器 profile。只讀固定記憶檔案及使用者指定的訊息/回答檔案。不得把外部回答當成本機 shell 指令執行。只把使用者明確要求記住的文字加入 memory.md；不自動把模型推論寫成事實。既有檔案初始化時保留原文。記憶與對話檔含私人資料，交付範例只用虛構資料。

MVP 不含：多帳號輪替、驗證碼處理、風控繞過、原生 function calling、檔案上傳、SSE、完整 OpenAI API 相容性、圖形介面或向量資料庫。

## 模組契約

Node.js >=22，ESM，零第三方 runtime 依賴，使用 node:test。

`src/memory.js`：
- `initProject(root)`：建立固定檔案，保留既有資料。
- `buildContext(root, user, { maxChars = 32000 } = {})`：回傳 `{ prompt, contextHash }`；包含 agent.md、memory.md 與當回合文字；每次重新讀取。
- `withProjectLock(root, action)`：以獨占檔案實作互斥，重複操作直接失敗，`finally` 釋放。
- `recordTurn(root, { user, assistant, contextHash })`：append JSONL，拒絕空回覆。
- `remember(root, text)`：鎖內 append 明確輸入，不接受模型自動寫入。

`src/transport.js`：
- `complete({ baseUrl, apiKey, model, prompt, timeoutMs = 120000 })`：只接受 literal loopback 的 HTTP URL，拒絕 URL 憑證/query/hash 與 redirects；POST 到 `/chat/completions`，`stream:false`，驗證完成狀態及非空文字。模型名稱由使用者設定，不假定網頁當期型號。
- 不重送逾時或結果未知的請求，以免上游重複送出。401/403/429/5xx 清楚報錯，不輸出 key 或上游原始錯誤內容。限制回應大小。

`src/cli.js`：
- `init --project PATH`
- `pack --project PATH --message TEXT`：stdout 完整封包，可人工貼到網頁。
- `record --project PATH --message TEXT --reply-file PATH`：匯入人工取得的完整回答。
- `remember --project PATH --text TEXT`
- `chat --project PATH --message TEXT --base-url http://127.0.0.1:8787/v1 --model MODEL`：鎖內組包、呼叫、紀錄；API key 只從 `BRIDGE_UPSTREAM_KEY` 讀取。
- `serve --project PATH --port 8790 --base-url URL --model MODEL`：固定一個專案，本機 API key 從 `BRIDGE_API_KEY` 讀取，缺少即拒絕啟動。

`src/server.js`：主代理整併，`GET /health` 與受 Bearer key 保護的 `POST /v1/chat/completions`。僅接受一則字串 user message 與 `stream:false`；其他歷史、tools、session ID 一律明確拒絕，避免誤以為完整相容。固定專案與模型，request 不能指定磁碟路徑。綁定 127.0.0.1，限制 Host/Origin、body 大小與並行操作。

人工匯入限制：hash 是匯入當下重新組包所得，不是實際網頁送出的收據；人工模式不做 request/reply 嚴格配對或去重。自動 chat/server 流程的 hash 才對應實際交給 adapter 的封包。完整 transcript 不會自動整理進 memory.md。初始化建立空白記憶檔，另提供 `examples/project/` 範例。

## 執行工作包

> 使用者已指定多位 GPT-6-luna、reasoning effort max；主代理保留架構裁決、審核與整併責任。

1. 研究代理 A：比對候選 README、LICENSE、實作及問題；輸出來源與缺口。
2. 架構代理 B：檢視記憶、隱私、錯誤與驗收，提出需修正處。
3. 實作代理 C：依記憶契約先寫失敗測試，再實作 `memory.js`，限定檔案範圍。
4. 實作代理 D：依傳輸契約先測試 fake HTTP 上游，再實作 `transport.js`，不碰真實帳號。
5. 主代理：CLI、server、使用文件、打包、離線跨程序端到端驗證。
6. 獨立審查：檢視成品規格符合度及錯誤/資料遺失/權限風險；修正後重跑。

測試流程：先寫能反映行為的失敗測試，執行並觀察失敗，再實作與回歸。無上游憑證不會自動假造通過。

## 驗收標準

| 項目 | 必須證據 |
| --- | --- |
| 每回合讀取最新規則 | 改 memory.md 後第二次請求實際收到新版文字 |
| 跨程序記憶 | 新 Node 程序仍讀取原專案兩檔 |
| 專案隔離 | A/B 封包無對方記憶，HTTP 不能指定 root |
| 資料保護 | init 不覆寫、失敗不記為成功、鎖避免交錯 |
| 上游錯誤 | fake server 測 401/429、空回覆、超時、redirect、過大內容 |
| 本機 API | key 驗證、非預期 Origin/Host 拒絕、body 限額、單一 user 格式 |
| 打包 | 從 ZIP 解開後執行同一測試，不以存在檔案當成功 |
| 真實 DeepSeek | 需登入自己的帳號，測試兩回合與新對話回憶；未做則明列未驗證 |

## 0.2 檔案代理擴充

使用者於實帳驗收階段補充最終目標是能讀取、建立及修改本機專案檔案，因此新增 file-tools.js、file-agent.js 與 CLI agent 命令。工具限制、備份、雜湊與驗收見 FILE-AGENT.md。此階段已完成真實 read/create/modify 驗收；不把初版純文字聊天的通過結果冒充檔案代理通過。

## 上線與維護

階段一：完成無帳號也可驗證的本機記憶工具、相容 HTTP adapter 與文件。
階段二：人工登入候選核心的專用 profile，先測一則短文，再測跨新對話記憶。比較空上下文與 4K/16K 字元封包的首字與總延遲，至少五次記錄中位數，不能由單次「很快」推估效能。
階段三：確定實際需求後再考慮擴充功能或 MCP 包裝；不在此階段增加自動執行工具。

核心升級需鎖 commit、保留原版本，重做兩回合與新對話測試。登入失效、429、驗證碼或風控出現時停止送出，交由使用者處理登入或改用官方 API，不以帳號輪替處理。

成本：自建層無第三方 runtime 套件費用；網頁使用額度與服務可能變動，無法保證永久零費用。開發與維護、瀏覽器記憶體、本機磁碟與 context 增長都是真實成本。MVP 交付狀態以驗證報告為準。
