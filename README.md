# APK.TW 自動簽到 Chrome 擴充功能

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

## 📋 概述

這是一個為 APK.TW 論壇設計的 Chrome 擴充功能，能夠自動執行每日簽到操作，讓您不再錯過簽到獎勵。

## ✨ 主要功能

- 🤖 **自動簽到**：訪問 APK.TW 時自動執行簽到
- 🖱️ **手動簽到**：提供彈出視窗手動控制簽到
- 📊 **狀態檢查**：顯示當前簽到狀態
- 🎨 **美觀界面**：現代化的用戶界面設計
- 🔒 **安全設計**：符合 Chrome 安全標準，無隱私風險

## 🚀 安裝方式

### 方法一：開發者模式安裝（推薦）

1. 下載擴充功能檔案：
   ```bash
   # 下載最新版本
   APK_TW_SignIn_Extension_Fixed.zip
   ```

2. 解壓縮到任意目錄

3. 開啟 Chrome 瀏覽器，進入擴充功能頁面：
   ```
   chrome://extensions/
   ```

4. 開啟右上角的「開發人員模式」

5. 點擊「載入未封裝項目」

6. 選擇解壓縮後的目錄

7. 擴充功能安裝完成！

### 方法二：直接安裝

1. 確保已下載 `APK_TW_SignIn_Extension_Fixed.zip`

2. 解壓縮檔案

3. 按照方法一的步驟 3-7 操作

## 📁 檔案結構

```
APK_TW_SignIn_Extension/
├── manifest.json              # 擴充功能配置檔案
├── background.js              # 背景腳本
├── zero-csp.js               # 內容腳本（自動簽到）
├── popup.html                # 彈出視窗界面
├── popup.js                  # 彈出視窗腳本
└── icons/                    # 圖示目錄
    ├── icon16.svg            # 16x16 圖示
    ├── icon48.svg            # 48x48 圖示
    └── icon128.svg           # 128x128 圖示
```

## 🛠️ 技術規格

### Manifest 配置
- **版本**: Manifest V3
- **權限**: 最小化權限請求
  - `storage` - 儲存用戶設定
  - `activeTab` - 當前標籤頁操作
  - `scripting` - 必要的腳本執行權限
- **主機權限**: 僅限 `https://apk.tw/*`

### 安全特性
- ✅ 內容安全政策 (CSP) 配置
- ✅ 無危險函數使用
- ✅ 最小化權限原則
- ✅ 安全的網路請求
- ✅ 隔離執行環境

### 相容性
- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ Manifest V3 相容

## 🎯 使用方法

### 自動簽到
1. 確保已在 APK.TW 登入帳號
2. 訪問任意 APK.TW 頁面
3. 擴充功能會自動檢測並執行簽到

### 手動操作
1. 點擊擴充功能圖示
2. 在彈出視窗中：
   - **檢查狀態**：查看當前簽到狀態
   - **手動簽到**：立即執行簽到
   - **開啟網站**：快速開啟 APK.TW

## ⚙️ 設定選項

擴充功能提供以下設定：
- 自動簽到開關
- 簽到時間設定
- 通知偏好設定

## 🔧 開發資訊

### 核心檔案說明

#### manifest.json
擴充功能的配置檔案，定義了：
- 基本資訊（名稱、版本、描述）
- 權限請求
- 背景腳本配置
- 內容腳本配置
- 彈出視窗設定

#### background.js
背景服務腳本，負責：
- 擴充功能初始化
- 消息處理
- 狀態檢查
- 手動簽到功能

#### zero-csp.js
內容腳本，負責：
- 頁面檢測
- 自動簽到執行
- 狀態通知
- 錯誤處理

#### popup.html/popup.js
用戶界面，提供：
- 美觀的現代化界面
- 狀態顯示
- 手動操作按鈕
- 設定選項

## 🐛 故障排除

### 常見問題

#### Q: 擴充功能顯示「不安全」警告
A: 請使用最新版本的 `APK_TW_SignIn_Extension_Fixed.zip`

#### Q: 自動簽到無法運作
A: 確保：
- 已在 APK.TW 登入
- 網路連線正常
- 擴充功能權限正常

#### Q: 彈出視窗無法開啟
A: 嘗試：
- 重新載入擴充功能
- 重啟 Chrome 瀏覽器
- 重新安裝擴充功能

#### Q: 簽到失敗
A: 檢查：
- 是否已登入 APK.TW
- 網站是否正常運作
- 是否已經簽到過

### 除錯模式

開啟 Chrome 開發者工具查看詳細日誌：
1. 在擴充功能頁面點擊「背景頁面」
2. 開啟 Console 檢視日誌
3. 尋找 `[APK.TW]` 標籤的訊息

## 📝 更新日誌

### v1.0.0 (2025-01-17)
- ✨ 初始版本發布
- 🔧 自動簽到功能
- 🎨 美觀用戶界面
- 🔒 完整安全配置
- 📊 狀態檢查功能

## 📄 授權條款

MIT License

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📞 聯絡方式

- 專案地址：[APK.TW](https://apk.tw/)
- 問題回報：GitHub Issues

---

⭐ 如果這個擴充功能對您有幫助，請給個 Star！
