# 專案檔案代理計畫

2026-10-15 補充需求：DeepSeek 必須能在使用者指定的本機專案範圍內讀取、建立、修改檔案。此階段承接已完成的記憶層與網頁橋接，不以純聊天通過作為檔案代理完成的證據。

## 介面與權限

新增 `agent --project PATH --message TEXT --base-url URL --model MODEL [--max-steps 12]`。這個命令表示授權本次任務在指定專案內操作檔案。只提供四個工具：

- `list_files({path?: string})`：列出目錄的直接子項，最多 200 項，不遞迴掃描。
- `read_file({path: string})`：回傳 UTF-8 文字、位元組數、SHA-256。
- `create_file({path: string, content: string})`：只建立新檔，既有檔案直接拒絕；父目錄須存在。
- `replace_text({path: string, search: string, replace: string, expectedHash: string})`：先比對目前 SHA-256 與讀取時一致，再對唯一一次完全相符的文字替換；找不到、重複或檔案已變動即拒絕。

所有 path 都是專案內相對路徑。拒絕絕對路徑、`..`、Windows alternate data streams、symlink/junction 與特殊裝置名稱。保護 `.git`、`.memory-bridge`、`.file-agent`、`.env`/`.env.*`、agent.md、memory.md 與常見私鑰檔。記憶更新仍使用明確的 remember 命令，不交給模型自行改寫。沒有 shell、刪檔、任意 URL 存取或任意程式執行工具。

讀取與修改都拒絕 hardlink，避免透過專案內別名接觸外部檔。另保護 `auth.json`、`.api-key`、`sessions.json`、`chrome-profile`，避免把本工具資料夾當作專案時讀到登入態；不會一概封鎖合法的 `runtime/src` 程式碼。

單檔上限 64 KiB。每次既有檔案修改先把原文、原 SHA-256、預期新 SHA-256 與相對路徑保存到 `.file-agent/backups/<id>.json`，建立與修改都記入 `.file-agent/actions.jsonl`。備份與紀錄不會自動送給模型，不包含金鑰。這些檔案可能含專案原文，不應分享。

驗證與 open/rename 之間仍可能遭外部程序改動父目錄或檔案，沒有跨程序原子 CAS。一般使用應避免外部編輯器同時改同一批檔案；這是應用層範圍檢查，不是抵抗同機惡意程序的 sandbox。

## 模型工具迴圈

網頁端使用文字 JSON 協定，不宣稱原生 function calling。每次模型只可回一個完整 JSON 物件：

```json
{"type":"tool","name":"read_file","arguments":{"path":"README.md"}}
```

或：

```json
{"type":"final","content":"完成說明"}
```

只解析完整 JSON 或單一完整 JSON code fence，不從一般文字挖出指令。工具名稱與參數嚴格驗證；工具回覆是資料，不升級為本機指令。每個模型回合重新讀取 agent.md 與 memory.md，加入工具契約及本任務必要的已執行工具紀錄；完整封包仍受 32,000 字元上限限制。超限明確停止，不能截掉工具結果或規則。

最多 12 次模型呼叫，可由 CLI 指定 1–30；遇到網路/解析/工具錯誤或上游結果未知即停止，不重送不確定請求。整段任務持有專案鎖。只有收到 final 才寫完成對話紀錄；已執行的檔案變更仍保留在 audit 中，失敗回報須明說可能已有部分變更。

## 模組契約與分工

`src/file-tools.js` export `runFileTool(root, name, args)`。回傳 JSON 可序列化工具結果；不自行鎖，caller 持專案鎖。由記憶模組代理實作並測試路徑邊界、雜湊、唯一替換、備份與紀錄。

`src/file-agent.js` export `runFileAgent({project,user,upstream,maxSteps=12})` → `{content,steps}`。主代理實作、整合 CLI，使用 fake localhost 上游做多步協定測試。原 transport 模組不增加 tools 欄位；工具協定完整放在文字 prompt。

上游核心另外兩位代理修正真實驗收已重現的登入 navigation race 與缺少操作欄位的 SSE 片段解析；主代理審查後重建，再做真實帳號驗收。

## 驗收

1. 本機測試證明越界路徑、symlink、秘密檔案、既有檔覆寫、錯誤 SHA、重複 search、超大內容皆拒絕。
2. 模擬上游依序要求讀取、建立、修改，確認實際檔案、備份與 audit 正確；一般文字或未知工具不觸發寫入。
3. 真實 DeepSeek 只給任務描述，讓它自己讀取測試專案中的來源檔、建立一個輸出檔、再修改來源檔。主代理從本機實檔與 audit 驗證內容，不能只相信模型說完成。
4. 使用者真實專案尚未指定，驗收一律用獨立的測試專案，不修改其他現存專案。
