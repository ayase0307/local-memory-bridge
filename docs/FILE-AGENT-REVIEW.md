# File-agent 獨立審查

審查範圍：`outputs/local-memory-bridge/docs/FILE-AGENT.md`、`src/file-agent.js`、`src/file-tools.js`、`src/cli.js` 的 agent 接線，以及 `test/file-agent.test.js`、`test/file-tools.test.js` 和 CLI 測試。未修改程式、未讀取 runtime 或個人檔，也未重跑測試。主代理回報本機 62/62、核心 95/95 通過，並完成真實帳號檔案任務驗收；這些執行結果非本次獨立重現。

## 結論

沒有發現需阻擋交付的高／中問題。JSON 協定只允許 `list_files`、`read_file`、`create_file`、`replace_text`；一般文字與 `run_shell` 等未知工具會中止，沒有 shell 執行路徑（`file-agent.js:19-35`；`test/file-agent.test.js:53-64`）。路徑正規化拒絕 traversal、絕對路徑、ADS 和 Windows 裝置名稱；檔案工具保護 symlink/junction、hard link、記憶與常見憑證路徑。替換操作要求舊 hash 與唯一匹配，先存原文備份再替換，並記錄成功或錯誤（`file-tools.js:138-172,238-283,414-468,481-518`）。

先前指出的 hard link 讀取風險已修正：`readRegularFile` 在讀取前、開啟後及返回前檢查連結數，`test/file-tools.test.js:355-367` 驗證拒絕讀取且外部 sentinel 不變。憑證路徑保護也涵蓋 `auth.json`、`.api-key`、`sessions.json`、`chrome-profile` 的讀、建、改，對應測試位於 `test/file-tools.test.js:183-230`。

## 非阻塞限制

檔案邊界檢查使用路徑 `lstat` 後再以絕對路徑開啟或 rename，並未持有目錄 handle 跨越整段操作。若另一個本機程序恰在檢查後、開啟前把中間目錄換成 junction/symlink，`read_file` 或 `create_file` 的路徑解析可能跟到專案外；若外部編輯器在 `atomicReplace` 最後一次 hash 檢查後、rename 前存檔，也可能被替換覆蓋（`file-tools.js:238-254,257-283,365-401,414-433`）。靜態連結與一般 stale-hash 情境已有測試，這個需要並行外部變更的競態未重現；以單一使用者、操作期間不另行改同一專案的假設，不列為交付阻塞。若要涵蓋對抗性並行程序，需加入可抵抗目錄置換的相對目錄 handle／作業系統鎖與競態測試。

備份保存整份修改前文字，且位於專案 `.file-agent/backups`；文件已提醒不要分享備份。`open(..., 0o600)` 的 POSIX mode 不能單獨證明 Windows NTFS ACL 是 owner-only，本次未檢查該資料夾的實際 ACL（`file-tools.js:310-325,459-467`）。

## 未檢查

未在本次重跑本機或核心測試，也未檢查 runtime、備份檔或 Windows ACL。未發現其他可重現的高／中問題。
