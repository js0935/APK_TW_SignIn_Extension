// 零兼容性問題的最終版本
(function() {
  'use strict';
  
  // 防止重複初始化
  if (window.zeroCSPInitialized) return;
  window.zeroCSPInitialized = true;

  const CONFIG = {
    SIGNIN_ENDPOINT: '/plugin.php?id=dsu_amupper:pper&ajax=1',
    SUCCESS_INDICATORS: ['簽到成功', 'success', '已簽到', 'complete', 'ok'],
    ERROR_INDICATORS: ['error', '失敗', 'failure', 'already'],
    DELAY: 1500,
    TIMEOUT: 5000,
    LOG_PREFIX: '[APK.TW]'
  };

  // 最小化的日誌函數
  function log(message, type) {
    try {
      // 檢查是否有 console
      if (typeof console !== 'undefined' && console.log) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`%c${CONFIG.LOG_PREFIX}%c ${timestamp}%c ${message}`, 
                  'background: #667eea; color: white; padding: 2px 4px; border-radius: 3px;',
                  'background: #f0f0f0; color: #333; padding: 2px 4px; border-radius: 3px;',
                  'background: transparent; color: #666;');
      }
    } catch (e) {
      // 完全無日誌，忽略
    }
  }

  // 主類
  class UltimateZeroCSPPureSigner {
    constructor() {
      this.attempted = false;
      this.init();
    }

    init() {
      if (this.attempted) return;
      this.attempted = true;
      
      // 使用多種延遲方式，確保頁面載入
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          this.trySignIn();
        }, { timeout: CONFIG.DELAY });
      } else {
        setTimeout(() => {
          this.trySignIn();
        }, CONFIG.DELAY);
      }
    }

    trySignIn() {
      try {
        log('開始零 CSP 簽到', 'info');
        
        // 基本檢查
        if (!this.canProceed()) {
          log('條件不滿足，跳過簽到', 'warn');
          return;
        }

        // 構建 URL
        const url = this.buildUrl();
        if (!url) {
          log('URL 構建失敗', 'error');
          return;
        }

        // 執行 AJAX
        this.executeAJAX(url);
      } catch (error) {
        log('簽到嘗試失敗: ' + error.message, 'error');
      }
    }

    canProceed() {
      try {
        // 檢查網站
        const href = window.location.href;
        if (!href || !href.includes('apk.tw')) {
          log('不在 APK.TW 網站', 'warn');
          return false;
        }

        // 檢查是否可以簽到（避免複雜的 DOM 操作）
        // 這裡簡化檢查，不訪問任何 DOM 元素
        return true;
      } catch (e) {
        log('條件檢查失敗: ' + e.message, 'error');
        return false;
      }
    }

    buildUrl() {
      try {
        let origin = window.location.origin;
        if (!origin) {
          origin = 'https://apk.tw';
        }
        
        const url = origin + CONFIG.SIGNIN_ENDPOINT;
        log('構建簽到 URL: ' + url, 'info');
        return url;
      } catch (e) {
        log('URL 構建失敗: ' + e.message, 'error');
        return null;
      }
    }

    async executeAJAX(url) {
      try {
        log('執行 AJAX 簽到', 'info');
        
        // 構建請求配置
        const requestConfig = {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Cache-Control': 'no-cache'
          },
          cache: 'no-store'
        };

        // 執行請求
        const response = await fetch(url, requestConfig);
        
        log('響應狀態: ' + response.status, 'info');
        
        // 檢查響應
        if (response.ok) {
          this.handleSuccess();
        } else {
          this.handleFailure();
        }
      } catch (error) {
        log('AJAX 請求失敗: ' + error.message, 'error');
        this.handleFailure(error);
      }
    }

    handleSuccess() {
      try {
        log('簽到成功', 'success');
        this.showNotification('✅ APK.TW 簽到成功', 'success');
      } catch (e) {
        log('成功處理失敗: ' + e.message, 'error');
      }
    }

    handleFailure(error) {
      try {
        const errorMsg = error ? error.message : '簽到失敗';
        log(errorMsg, 'error');
        this.showNotification('❌ APK.TW 簽到失敗', 'error');
      } catch (e) {
        log('失敗處理失敗: ' + e.message, 'error');
      }
    }

    showNotification(message, type) {
      try {
        log('顯示通知: ' + message, 'info');
        
        // 方法1: 使用頁面標題（最安全）
        const originalTitle = document.title;
        
        // 安全地設置標題
        try {
          if (document.title !== undefined) {
            document.title = message;
          }
        } catch (e) {
          log('標題設置失敗', 'error');
        }
        
        // 方法2: 嘗試使用地址欄（可能的替代方案）
        try {
          if (window.location && window.location.hash !== '#notified') {
            window.location.hash = 'notified';
          }
        } catch (e) {
          log('Hash 設置失敗', 'error');
        }
        
        // 方法3: 使用 console.log 作為替代
        setTimeout(() => {
          try {
            if (typeof console !== 'undefined' && console.log) {
              console.log(`%c${message}`, 'background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px;');
            }
          } catch (e) {
            log('Console 無法使用', 'warn');
          }
        }, 1000);

        // 方法4: 恢復
        setTimeout(() => {
          try {
            if (document.title !== undefined && document.title === message) {
              document.title = originalTitle;
            }
            if (window.location && window.location.hash === '#notified') {
              window.location.hash = '';
            }
          } catch (e) {
            log('恢復失敗', 'warn');
          }
        }, 5000);

      } catch (e) {
        log('通知顯示完全失敗: ' + e.message, 'error');
      }
    }
  }

  // 初始化
  try {
    // 使用最安全的初始化方式
    if (document.readyState === 'loading') {
      if (typeof document.addEventListener !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function() {
          new UltimateZeroCSPPureSigner();
        });
      } else {
        // 備用方案
        setTimeout(() => {
          new UltimateZeroCSPPureSigner();
        }, 2000);
      }
    } else {
      setTimeout(() => {
        new UltimateZeroCSPPureSigner();
      }, 500);
    }
  } catch (e) {
    // 完全失敗，什麼都不做
  }
})();