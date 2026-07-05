# LyricsWidget

一個桌面歌詞小工具，即時顯示 Spotify 正在播放歌曲的同步歌詞，以透明浮窗置頂於桌面上。

使用 Electron + React 開發，支援 macOS 與 Windows。

## 功能特色

- 🎵 **即時同步歌詞** — 自動偵測 Spotify 播放中的歌曲，歌詞逐句滾動、與播放進度同步
- 🔍 **多來源歌詞搜尋** — 以 [lrclib.net](https://lrclib.net) 為主要來源，找不到時自動改查網易雲音樂（中文歌覆蓋率高），並依歌手與歌曲時長挑選最符合的結果
- 🈶 **簡轉繁** — 網易雲的簡體歌詞會透過 OpenCC 自動轉換為台灣正體用字
- 📐 **字體自動縮放** — 歌詞過長時自動縮小字體，維持單行置中顯示不換行
- 🖱️ **穿透浮窗** — 鎖定時滑鼠可直接點擊穿透歌詞視窗，不干擾其他操作
- ⚙️ **系統列設定面板** — 可調整字體大小、視窗寬度、閒置透明度，並可解鎖拖曳調整位置

## 系統需求

- [Node.js](https://nodejs.org/)（含 npm）
- Spotify 帳號（需為播放中裝置，免費或 Premium 皆可）

## 安裝與執行

```bash
# 安裝相依套件
npm install

# 開發模式（同時啟動 React dev server 與 Electron）
npm run electron

# 打包成安裝檔（輸出至 dist/）
npm run dist
```

首次啟動時會自動開啟瀏覽器要求 Spotify 授權，登入並同意後即可開始使用。

## Spotify API 設定

本專案透過 [Spotify Web API](https://developer.spotify.com/documentation/web-api) 取得播放狀態。若要使用自己的 API 憑證：

1. 到 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 建立應用程式
2. 在應用程式設定中將 Redirect URI 設為 `http://127.0.0.1:8888/callback`
3. 將 `main.js` 中的 `clientId` 與 `clientSecret` 換成你自己的憑證

## 使用方式

| 操作 | 說明 |
| --- | --- |
| 點擊系統列圖示 | 開啟／關閉設定面板 |
| 右鍵系統列圖示 | 完全結束程式 |
| 關閉「Position Lock」 | 解鎖歌詞視窗，可拖曳調整位置，完成後再鎖回 |
| 滑鼠移到歌詞上 | 暫時提高不透明度並顯示歌名 |

## 專案結構

```
├── main.js              # Electron 主程序：視窗、系統列、Spotify 輪詢、歌詞搜尋
├── src/
│   ├── index.js         # hash 路由：#lyrics 歌詞浮窗 / #settings 設定面板
│   ├── LyricsView.js    # 歌詞顯示：LRC 解析、進度推算、滾動與字體縮放
│   └── SettingsView.js  # 設定面板
└── public/              # 靜態資源與圖示
```

## 歌詞來源

- [lrclib.net](https://lrclib.net) — 開放的同步歌詞資料庫（主要來源）
- 網易雲音樂 — 中文歌曲備援來源

歌詞版權皆屬原作者與各平台所有，本工具僅作個人使用之顯示用途。

## License

本專案採用 [MIT License](LICENSE) 授權。
