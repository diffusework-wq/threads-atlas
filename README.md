# 話題星圖 · Threads Atlas

免費的個人 Threads 收藏與 3D 話題星圖。Chrome 插件在你開啟自動收錄後，保存點開的貼文詳情文字；網站在同一個 Chrome 個人檔案中讀取本機收藏。免網站帳號、不需要 Meta App 或 Token、不做跨裝置同步。另保留 26 則人工核對的公開摘要作為獨立示範，與個人資料分開。

## 開啟試玩

需要 Python 3；在此資料夾執行：

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory site
```

用瀏覽器開啟 http://127.0.0.1:8765/ 。不要直接雙擊 index.html，瀏覽器可能阻擋本機 JSON 載入。

功能：Three.js 3D 力導向圖、拖曳節點牽動鄰近網路並回彈、拖曳背景旋轉、右鍵拖曳平移、滾輪或按鈕縮放、鍵盤選取節點、點選連線看共同樣本、話題入口、全文摘要搜尋、時間篩選、本機追蹤標籤、原文連結、Markdown 報告、SVG 圖表下載與手機版。

## 線上試用與 Chrome 插件

網站：https://diffusework-wq.github.io/threads-atlas/

網站可免登入查看公開示範，或用同一Chrome個人檔案的插件讀取私人收藏。

1. 在網站按「安裝插件」下載ZIP，解壓縮。
2. 開啟 chrome://extensions，開啟開發人員模式，載入解壓縮資料夾。
3. 開啟插件的「自動收錄」，重新整理Threads，點開文字貼文詳情。
4. 或在Threads貼文右上角按「☆ 存入星圖」手動收藏。
5. 按插件的「開啟我的星圖」，直接使用線上網站。

收藏保存在Chrome插件內，不上傳GitHub；線上版不需本機伺服器。0.1版更新到0.2版時請覆蓋原插件資料夾並重新載入，以保留同一插件的收藏，更新前可匯出備份。網站匯入JSON只作本次預覽，不寫回插件。

只處理可靠辨識的可見文字。不批次抓留言，不讀私訊、密碼、Cookie或輸入中內容。個別留言可明確手動收藏；圖片不做文字辨識，含多篇引文或不明確的卡片會略過。最多1,000篇，圖與側欄最多80話題，其餘可搜尋。

詳見 [extension/README.md](extension/README.md)。重新打包：`python scripts/package_extension.py`。免費試用版採自行載入，尚未提交Chrome商店。

## 公開示範資料與限制

- 所有公開資料在 `site/data/snapshot.json`，可以由 `python scripts/build_snapshot.py` 重建。
- 來源為 Threads 搜尋頁可见的主貼文／回覆；紀錄原文網址、DOM time 的發文時間、核對時間、編輯摘要與話題分類。
- 截圖／私訊內容不納入摘要。沒有蒐集粉絲名單、私人訊息或登入憑證。
- 原文存在不代表故事已經獨立查證；網站將貼文描述歸屬於作者。
- 原文有可能刪除、限制閱讀或要求 Threads 登入。網站探索本身無須登入。
- 關聯邊由同一筆來源的話題分類交集即時計算，不是因果、語意模型推論或字面共現。
- 延伸話題與發文切角目前是人工編輯，不宣稱 AI 即時挖掘。
- 顏色代表主題群組；圓圈大小代表收錄樣本數；月份長條是样本發文時間分布。
- 目前是跨時間、非隨機的選樣，**不能計算台灣近 24 小時熱度排名或成長率**。即使 API 搜尋成功，也必須先验证不同期間的採集條件一致、分页未截斷及新詞基期覆蓋，才可加入成長指標。

## 試用 Meta 官方 API（網站訪客不需要登入）

`scripts/collect_threads.py` 使用 Meta 官方 `keyword_search`，只讀取資料。網站擁有者在本機執行，資料先留在 `.private/`，不會發布到 GitHub Pages。

```powershell
python scripts/collect_threads.py --keyword 情緒價值 --max-pages 1
```

程式會以隱藏輸入提示取得 token；也可讀取 `THREADS_ACCESS_TOKEN` 環境變數。不要將 token 放在聊天、網址、前端或 Git。不要把 App Secret 當成使用者 token。

需要有效的 Threads 使用者存取權杖與適用的公開關鍵字搜尋權限。僅建立 App **不代表公開搜尋已獲核准**；若返回的都是自己的貼文，或發生權限錯誤，不能當成正常公共資料收錄。

預設查詢 9 個關鍵字、近 48 小時、每詞最多 1 頁（50 筆）；最多可設定 5 頁。單次人工觸發，沒有排程、沒有購買或付費服務。頁數上限與配額會影響資料覆蓋。錯誤訊息不列印原始回應、request URL、token 或 paging URL。

採集後先核對 `.private/` 資料，確定來源與用途，再人工更新公開摘要；**不要將原始採集結果直接推上 GitHub**。採集程式已做離線測試；另於 Meta Explorer 測試過使用者 App，搜尋得到空結果，尚未驗證成功取得外部作者貼文。此 API 路線與目前的本機插件無關。

官方 API 參考：https://www.postman.com/meta/threads/collection/dht3nzz/threads-api

## 部署到 GitHub Pages

只將 **threads-atlas 這個資料夾** 建為獨立公開 GitHub repository，不要上傳外層其他工具專案。

1. 將本資料夾內容推至該 repository 的 `main` 分支。
2. repository 的 Settings → Pages → Source 選 GitHub Actions。
3. `.github/workflows/pages.yml` 會執行測試，並只部署 `site/`。插件已限定本專案的部署網址與路徑。
4. 成功後網址為 `https://<owner>.github.io/<repository>/`。

所有網站資源都是相對路徑，支援 repository 子路徑。沒有 npm install、外部字型、CDN 或付費 API 請求。私人採集結果與環境檔已加入 `.gitignore`。GitHub Pages 僅部署 site/ 靜態資源，無伺服器端私人資料庫。

## 驗證

```powershell
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
```

測試涵蓋：來源網址限制、去重、9 個話題資料完整度、分類關聯可追溯性、台灣時區月份、快照時間篩選、不憑空生成成長率、分頁上限、採集結果不洩露權杖與空結果不冒充全平台零聲量。


## 3D 圖形

Three.js 0.180.0 與 OrbitControls 已隨網站收錄於 `site/vendor/three/`，採 MIT 授權，授權全文位於該目錄的 LICENSE。無須 npm 安裝或 CDN。需支援 WebGL2 的瀏覽器；無法啟用時仍可使用話題選單及貼文清單。

節點使用三維彈簧、排斥力、中心引力與阻尼，拖曳時固定在面向鏡頭的平面，連線帶動其他節點。位置與距離只是探索佈局，不是新增的統計指標。可暫停動態；系統偏好減少動畫時預設暫停。SVG 匯出為當前 3D 視角的平面投影。

物理測試驗證牽引、放開後穩定、長時間背景間隔上限與空篩選。瀏覽器已實測節點拖曳及相鄰標籤位置變動。


## 主題浮動觀點

滑鼠指向 3D 節點或標籤，只顯示相關收錄的文字，沒有卡片外框、作者列或控制按鈕。每則由右下往上飄，淡入、停留並淡出，再輪播下一則。移開淡出，Escape 關閉；文字層不阻擋圖形操作。同話題播完後循環播放；減少動畫偏好下仍輪換文字，但不做位移動畫。完整來源與資料類型仍可在右側代表貼文查看。

首頁預設公開示範；插件的 `?library=personal` 入口仍直接開啟我的星圖。公開飄字使用 `scripts/public_originals.json` 中逐篇核對的原文短摘錄，與編輯摘要分開保存；執行 build_snapshot.py 可重建。個人飄字使用收錄原文，長篇每 160 字分段輪播，不改寫。缺少原文的資料不會以摘要冒充。
