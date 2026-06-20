# APK.TW 自動簽到 Chrome 擴充功能

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Version](https://img.shields.io/badge/version-1.0.3-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

## 概述

Chrome 擴充功能，自動為 APK.TW 論壇執行每日簽到。支援排程自動簽到與手動簽到，無需開啟網站即可簽到。

## 功能

- **自動簽到** — 設定時間排程，背景自動簽到（無需開啟分頁）
- **手動簽到** — 點擊彈出視窗立即簽到
- **內容腳本簽到** — 瀏覽 APK.TW 時自動觸發
- **狀態檢查** — 顯示登入狀態、簽到狀態、上次簽到時間
- **通知** — 簽到成功/失敗時顯示通知
- **多種簽到方式** — 按鈕點擊 + fetch 遞補，提高成功率

## 安裝

1. 下載原始碼或 clone 此倉庫
2. 開啟 Chrome → `chrome://extensions/`
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」→ 選擇專案目錄

## 檔案結構

```
├── manifest.json       # 擴充功能配置 (Manifest V3)
├── background.js       # 背景服務腳本（排程、簽到邏輯）
├── zero-csp.js         # 內容腳本（頁面載入時自動簽到）
├── popup.html          # 彈出視窗 HTML
├── popup.js            # 彈出視窗腳本
└── icons/              # SVG 圖示
```

## 技術規格

**Manifest V3** | **權限**: `storage`, `activeTab`, `scripting`, `alarms`, `notifications`, `cookies` | **主機**: `https://apk.tw/*`

### 簽到流程

1. **排程觸發** (alarms API) → 背景檢查是否已簽到
2. **建立隱藏分頁** (active: false) → 載入 `forum.php`
3. **注入腳本** → 點擊 `#my_amupper` 簽到按鈕
4. **檢查 storage** 確認簽到結果
5. **遞補** — 若按鈕無效，嘗試直接 fetch 多種 URL 格式 (`infloat=1&ajax=1`、`ppersubmit=1`)
6. **關閉隱藏分頁**，發送通知

## 使用

- **手動簽到**: 點擊工具列圖示 → 按「手動簽到」
- **檢查狀態**: 按「檢查狀態」
- **設定**: 開啟/關閉自動簽到、設定時間、通知開關

## 開發

### 核心檔案

| 檔案 | 職責 |
|------|------|
| `background.js` | 初始化、消息路由、排程、簽到邏輯、狀態檢查 |
| `zero-csp.js` | 頁面自動簽到、formhash 提取、錯誤記錄 |
| `popup.js` | UI 互動、狀態顯示、設定管理 |

### 建置

無需建置步驟，直接載入即可。所有檔案皆為原生 JavaScript。

## 更新日誌

### v1.0.3 (2026-06-21)
- executeScript 加入 `world: 'MAIN'` 提升相容性
- 新增 `apk_tw_signing_in` storage 旗標，避免內容腳本與背景重複簽到
- fetch 失敗自動重試一次
- 收到非 HTML 純文字回應視為成功

### v1.0.2 (2026-06-21)
- 修復 `Referer` forbidden header 導致 Failed to fetch
- 修復內容腳本點擊按鈕造成重定向無限迴圈
- 修復 `signInViaAPI` 缺少並發鎖導致重複開啟隱藏分頁
- 修復 cookies.getAll 空參數問題
- popup sendMessage 加入 runtime.lastError 處理

### v1.0.1 (2026-06-21)
- 改用點擊 `#my_amupper` 按鈕觸發正規簽到流程
- 新增 formhash (CSRF token) 提取機制
- fetch 加入 `credentials: include`、`X-Requested-With` headers
- 遞補多種 URL 格式 (`infloat=1&ajax=1`、`ppersubmit=1`)
- 修復 `checkSignInStatus` cookies API 呼叫
- 修復 popup `chrome.runtime.lastError` 未處理問題

### v1.0.0
- 初始版本，基本簽到功能

## 授權

MIT
