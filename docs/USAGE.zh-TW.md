# Local Memory Bridge

## 本機專案檔案代理

`agent` 命令讓 DeepSeek 透過受限工具列出、讀取、建立及修改指定專案內的文字檔。它不會執行模型提出的 shell 指令。先啟動附帶核心、依下方說明載入 `BRIDGE_UPSTREAM_KEY`，再執行：

```powershell
node src/cli.js agent --project ./my-project --base-url http://127.0.0.1:18787/v1 --model deepseek-v4-flash --message "讀取 README.md，建立一份摘要 summary.md，並把 README.md 的狀態改為已完成。"
```

請把 `--project` 明確指向允許修改的專案資料夾。命令執行期間，代理會依任務自行讀寫該範圍的檔案；檔案原文及工具結果會送到 DeepSeek。每次修改先存備份，並在 `.file-agent/actions.jsonl` 記錄實際結果。

目前限 UTF-8、單檔 64 KiB、父目錄已存在的文字檔。禁止路徑越界、連結、秘密檔案與內部資料目錄，沒有刪除／shell／程式執行能力。`replace_text` 要求舊 hash 與唯一相符的 search；中途錯誤不會聲稱任務完成，先前成功的變更仍保留，可查備份。最多 12 個模型回合，可用 `--max-steps` 設為 1–30。細節見 [FILE-AGENT.md](FILE-AGENT.md)。

代理執行時請避免同時用其他程序修改同一批檔案；專案鎖只協調本工具，無法鎖住外部編輯器，也不提供作業系統層級的原子 compare-and-swap。

這是本機專案記憶工具，搭配現有的 localhost 文字 API 使用。新增記憶層不登入 DeepSeek、不讀 cookies、不操作網頁，也不需要安裝 npm 套件。專案另含獨立第三方核心，需要你自行登入自己的帳號。需要 Node.js 22 以上。

## 快速使用

在此目錄開 PowerShell。所有路徑都可自行指定，空白路徑請加引號。

```powershell
node src/cli.js init --project ./my-project
node src/cli.js remember --project ./my-project --text "這個專案一律使用台灣繁體中文。"
node src/cli.js pack --project ./my-project --message "根據專案規則，幫我規劃下一步。"
```

`pack` 的 stdout 是完整提示詞，可複製到網頁；stderr 顯示 SHA-256。若要用 PowerShell 保存提示詞，使用明確 UTF-8：

```powershell
node src/cli.js pack --project ./my-project --message "幫我規劃下一步" |
  Set-Content -Encoding utf8 ./prompt.txt
```

把網頁回答存成 UTF-8 的 `reply.txt` 後，可匯入紀錄：

```powershell
node src/cli.js record --project ./my-project --message "幫我規劃下一步" --reply-file ./reply.txt
```

人工匯入的 hash 反映匯入當下的記憶檔快照，不能證明網頁實際收到哪個版本，也不會阻止重複匯入。需要嚴格配對的工作應用自動 `chat` 流程；人工模式請勿在送出與匯入之間變更記憶檔。

`agent.md` 放專案規則，`memory.md` 放已確認的事實。兩個檔案每回合完整重讀。只有 `remember` 或人工編輯會更新長期記憶，回答不會自動變成記憶。完整對話保存在 `.memory-bridge/turns.jsonl`，不會全部重送；若新對話需要先前的結論，請將結論明確寫入 `memory.md`。

## 連接既有本機核心

已附 [kittors/deepseek-web-api](https://github.com/kittors/deepseek-web-api) 的鎖定版本與本地修正、編譯結果，位於 `core/`。Git 不包含 `node_modules`；首次 clone 後先安裝唯一 runtime 依賴：

```powershell
npm --prefix core install --no-save --omit=dev --ignore-scripts --package-lock=false playwright-core@1.61.1
```

修正版核心 95 項單元測試、typecheck、production build 與 lint 通過，詳見 [第三方說明](../THIRD_PARTY.md)。2026-10-15 已在使用者親自登入後完成兩回合記憶與實際檔案操作驗收，詳見 [ACCEPTANCE.md](ACCEPTANCE.md)。

該核心使用私有網頁介面，存在條款、帳號限制及隨時失效的風險，詳見 [計畫與查核結果](PLAN.md)。要用附帶核心時，電腦需要 Chrome/Chromium，在一個 PowerShell 視窗啟動：

```powershell
.\scripts\Start-DeepSeekCore.ps1
```

此啟動腳本預設使用 `18787`，可透過 `-Port` 指定其他空閒連接埠。

首次會要求你在專用瀏覽器視窗完成登入。核心持有登入態，儲存在 `runtime/upstream/`；記憶層不讀這些 cookie/token。啟動腳本使用獨立 profile 與一個空閒 CDP port，避免沿用一般瀏覽器的除錯介面。此 runtime 資料夾不能分享或打包。上游服務成功啟動後，再在另一個視窗執行以下記憶層指令。本工具只接受 `http://127.0.0.1:PORT/v1` 或 HTTP IPv6 loopback 上游，不接受遠端網址及 redirects。

Windows runtime 沿用資料夾的 NTFS 權限；核心的 POSIX `mode` 不等於已設定 Windows 專用 ACL。請保存在自己的非共用資料夾。腳本結束時會還原它修改的環境變數。若更改核心 `-Port`，啟動記憶 API 時也須指定相同的 `-UpstreamPort`。

模型名稱使用核心實際提供的 ID，範例的 `YOUR_MODEL_ID` 必須替換。key 可由啟動的核心取得，以環境變數提供，不要放在記憶檔。

```powershell
$env:BRIDGE_UPSTREAM_KEY = "你的本機核心金鑰"
node src/cli.js chat --project ./my-project --base-url http://127.0.0.1:18787/v1 --model YOUR_MODEL_ID --message "請讀取專案記憶並回答"
```

附帶核心可由下列方式載入本機 key，不會把 key 顯示在畫面：

```powershell
$env:BRIDGE_UPSTREAM_KEY = ([IO.File]::ReadAllLines((Join-Path $PWD 'runtime/upstream/.api-key')) | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') } | Select-Object -First 1).Trim()
```

`chat` 持有專案鎖，讀兩個檔案、傳送提示詞、取得完整回答後才寫紀錄。收到 401、429、空白、截斷或逾時會報錯，不自動重送。逾時與紀錄寫入失敗可能發生在上游已完成之後，重送前須先確認上游狀態。

## 本機 HTTP API

需要 HTTP 用戶端時才啟動：

```powershell
$env:BRIDGE_API_KEY = [guid]::NewGuid().ToString("N")
.\scripts\Start-MemoryAPI.ps1 -Project ./my-project -Model YOUR_MODEL_ID
```

服務只綁 `127.0.0.1`，專案及模型由啟動參數固定。下一個 PowerShell 視窗要使用相同的 `BRIDGE_API_KEY` 值：

```powershell
$headers = @{ Authorization = "Bearer $env:BRIDGE_API_KEY" }
$body = @{ model = "YOUR_MODEL_ID"; stream = $false; messages = @(@{role = "user"; content = "請讀取記憶"}) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri http://127.0.0.1:8790/v1/chat/completions -Method Post -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

只支援一則純文字 user message 的非串流 Chat Completions 子集。system/history/tools/其他欄位會被拒絕；不能當成完整 OpenAI SDK、Codex provider、Responses 或 MCP 相容服務。`GET /health` 僅證明本機服務有回應，不檢查 DeepSeek 登入或上游是否可用。瀏覽器 Origin 請求一律拒絕。

Ctrl+C 會停止接受新連線，等待已送出的回合完成或逾時後離開。直接強制結束程序仍可能留下鎖檔與結果未知的上游請求。

## 限制與復原

- 上下文預設上限 32,000 字元，超過即報錯，不截斷；不宣稱精確 token 上限。
- 固定檔案與中繼目錄不接受 symlink；這降低意外越界風險，不是抵抗同機惡意程序的 sandbox。
- 鎖檔在正常結束時移除；程序崩潰可能留下 `.memory-bridge/lock`。先確認所有相關 Node 程序已停止、備份紀錄並檢查上游是否已送出，再只移除該專案的鎖檔；不自動清除疑似過期鎖。
- JSONL 是 append 紀錄，不是資料庫。斷電可能造成最後一行不完整；目前沒有自動修復、去重或記憶摘要功能。
- 記憶會隨提示詞送出。不要把密碼、病患資料或其他不應外傳的內容放進這兩個檔案。沒有自動敏感資訊掃描。
- 在你的專案 `.gitignore` 排除 `.memory-bridge/`；工具不會改寫既有專案的 Git 設定。記憶檔是否納入版本控制由專案決定。

## 測試

```powershell
npm test
```

測試用內建 `node:test`、臨時資料夾與 fake loopback HTTP server，不連 DeepSeek。成品驗證狀態見 [VERIFICATION.md](VERIFICATION.md)。完整開發與後續實帳驗收見 [PLAN.md](PLAN.md)。
