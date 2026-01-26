// Chrome Extension Background Script

// 基本的背景腳本
class APKTwBackground {
  constructor() {
    this.signInQueue = [];
    this.init();
  }

  init() {
    console.log('[APK.TW] 背景腳本啟動');
    this.setupBasicSetup();
  }

  setupBasicSetup() {
    // 設置基本功能
    try {
      // 監聽消息
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // 保持消息通道開啟
      });

      // 監聽擴展安裝/更新
      chrome.runtime.onInstalled.addListener((details) => {
        this.handleInstalled(details);
      });

      // 延遲初始化
      setTimeout(() => {
        this.setupDelayedInit();
      }, 1000);
    } catch (error) {
      console.error('[APK.TW] 初始化失敗:', error);
    }
  }

  setupDelayedInit() {
    // 設置進階功能
    this.setupAdvancedFunctions();
  }

   setupAdvancedFunctions() {
     // 設置進階功能
     try {
       this.setupAlarms();
       console.log('[APK.TW] 進階功能初始化完成');
     } catch (error) {
       console.error('[APK.TW] 進階設置失敗:', error);
     }
   }

  setupMessaging() {
    // 消息監聽器已在 setupBasicSetup 中設置，避免重複註冊
    console.log('[APK.TW] 消息系統已初始化');
  }

   setupAlarms() {
     try {
       // 檢查是否有 alarms 權限
       if (chrome.alarms) {
         // 清除現有的定時任務
         chrome.alarms.clear('dailySignIn', () => {
           console.log('[APK.TW] 有的定時任務已清除');
         });

         // 獲取設定時間
         this.getSettings().then(settings => {
           const signInTime = settings.signInTime || '09:00';
           const [hours, minutes] = signInTime.split(':').map(Number);

           // 計算下一次簽到時間
           const now = new Date();
           const nextSignIn = new Date(now);
           nextSignIn.setHours(hours, minutes, 0, 0);

           if (nextSignIn <= now) {
             // 如果今天已經過了，設置為明天
             nextSignIn.setDate(nextSignIn.getDate() + 1);
           }

           const delayInMinutes = Math.ceil((nextSignIn - now) / (1000 * 60));

           // 創建定時任務
           chrome.alarms.create('dailySignIn', {
             delayInMinutes: delayInMinutes,
             periodInMinutes: 24 * 60
           });

           console.log('[APK.TW] 定時任務已設置，下次簽到時間:', nextSignIn.toLocaleString());
         });

         // 添加alarm監聽器
         chrome.alarms.onAlarm.addListener((alarm) => {
           if (alarm.name === 'dailySignIn') {
             this.handleDailySignIn();
           }
         });

       } else {
         console.log('[APK.TW] alarms 權限未授予，跳過定時任務設置');
       }
     } catch (error) {
       console.error('[APK.TW] 定時任務設置失敗:', error);
     }
   }

  handleMessage(message, sender, sendResponse) {
    if (!message || !message.action) {
      console.warn('[APK.TW] 收到未知消息:', message);
      sendResponse({ error: '未知消息' });
      return true;
    }

    console.log('[APK.TW] 處理消息:', message.action);

    // 處理同步消息
    switch (message.action) {
      case 'getSettings':
        this.getSettings().then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
        return true;
        
      case 'getLogs':
        this.getLogs().then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
        return true;
        
      case 'clearLogs':
        this.clearLogs().then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
        return true;
        
      case 'saveSettings':
        this.saveSettings(message.settings).then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
        return true;
        
      case 'checkSignInStatus':
        this.checkSignInStatus().then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
        return true;
        
      case 'manualSignIn':
        this.manualSignIn().then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
        return true;
        
       case 'executeSafeSignIn':
         this.executeSafeSignIn(message.data).then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
         return true;

       case 'executeAutoSignIn':
         this.handleDailySignIn().then(result => sendResponse({ success: true })).catch(error => sendResponse({ error: error.message }));
         return true;

       default:
         sendResponse({ error: '未知消息動作' });
         return true;
    }
  }

  async checkSignInStatus() {
    try {
      // 檢查當前標籤頁
      const tab = await this.getActiveTab();
      if (!tab || !tab.url.includes('apk.tw')) {
        return {
          success: false,
          error: '請先打開 APK.TW 網站',
          needOpenSite: true
        };
      }

      // 使用腳本執行狀態檢查
      const result = await this.executeScript({
        func: () => {
          try {
            const loginLink = document.querySelector('a[href*="member.php?mod=logging"]');
            const isLoggedIn = loginLink && !loginLink.textContent.includes('登錄');
            const isSignedIn = document.getElementById('ppered') !== null;
            const canSignIn = document.getElementById('my_amupper') !== null;
            
            return {
              isLoggedIn: isLoggedIn,
              isSignedIn: isSignedIn,
              canSignIn: canSignIn,
              message: isSignedIn ? '今日已簽到' : (canSignIn ? '可以簽到' : '不可簽到')
            };
          } catch (e) {
            return {
              success: false,
              error: '頁面分析失敗: ' + e.message
            };
          }
        },
        target: { tabId: tab.id }
      });

      console.log('[APK.TW] 狀態檢查完成:', result);
      return result || { success: false, error: '未知錯誤' };
    } catch (error) {
      console.error('[APK.TW] 狀態檢查失敗:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async manualSignIn() {
    try {
      // 檢查當前標籤頁
      const tab = await this.getActiveTab();
      if (!tab || !tab.url.includes('apk.tw')) {
        return {
          success: false,
          error: '請先打開 APK.TW 網站',
          needOpenSite: true
        };
      }

      // 使用腳本執行手動簽到
      const result = await this.executeScript({
        func: () => {
          try {
            const signInBtn = document.getElementById('my_amupper');
            if (signInBtn) {
              signInBtn.click();
              return { success: true, message: '已發送簽到請求' };
            } else {
              return { success: false, message: '找不到簽到按鈕' };
            }
          } catch (e) {
            return { success: false, error: '簽到失敗: ' + e.message };
          }
        },
        target: { tabId: tab.id }
      });

      console.log('[APK.TW] 手動簽到結果:', result);
      return result || { success: false, error: '未知錯誤' };
    } catch (error) {
      console.error('[APK.TW] 手動簽到失敗:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeScript(params) {
    try {
      const result = await chrome.scripting.executeScript(params);
      console.log('[APK.TW] 腳本執行:', params.func);
      return result[0]?.result;
    } catch (error) {
      console.error('[APK.TW] 腳本執行失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async getActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      if (!tab) {
        return null;
      }
      
      // 檢查是否為有效的頁面
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
        return null;
      }
      
      return tab;
    } catch (error) {
      console.error('[APK.TW] 獲取活動標籤失敗:', error);
      return null;
    }
  }

  async getSettings() {
    try {
      const settings = await chrome.storage.sync.get({
        autoSignIn: true,
        signInTime: '09:00',
        notifications: true
      });
      return settings;
    } catch (error) {
      console.error('[APK.TW] 獲取設置失敗:', error);
      return { autoSignIn: true, signInTime: '09:00', notifications: true };
    }
  }

  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set(settings);
      console.log('[APK.TW] 設置已保存:', settings);
      return true;
    } catch (error) {
      console.error('[APK.TW] 保存設置失敗:', error);
      return false;
    }
  }

  async getLogs() {
    try {
      const logs = await chrome.storage.local.get({ 'apk_tw_logs': [] });
      return logs.apk_tw_logs || [];
    } catch (error) {
      console.error('[APK.TW] 獲取日誌失敗:', error);
      return [];
    }
  }

   async clearLogs() {
     try {
       await chrome.storage.local.remove('apk_tw_logs');
       console.log('[APK.TW] 日誌已清空');
       return true;
     } catch (error) {
       console.error('[APK.TW] 清空日誌失敗:', error);
       return false;
     }
   }

   async addLog(message, type = 'info') {
     try {
       const logs = await this.getLogs();
       const now = new Date();
       const timestamp = now.toLocaleString('zh-TW');

       logs.unshift({
         timestamp: timestamp,
         message: message,
         type: type
       });

       // 保留最近50條日誌
       if (logs.length > 50) {
         logs.splice(50);
       }

       await chrome.storage.local.set({ 'apk_tw_logs': logs });
       console.log('[APK.TW] 日誌已記錄:', message);
     } catch (error) {
       console.error('[APK.TW] 記錄日誌失敗:', error);
     }
   }

  async executeSafeSignIn(data) {
    try {
      const result = await this.executeScript({
        func: async () => {
          try {
            const response = await fetch('/plugin.php?id=dsu_amupper:pper&ajax=1', {
              method: 'GET',
              headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'text/plain'
              }
            });
            
            return {
              success: response.ok,
              status: response.status,
              message: response.ok ? '簽到成功' : '簽到失敗'
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              message: '簽到請求失敗'
            };
          }
        }
      });
      
      return result;
    } catch (error) {
      console.error('[APK.TW] 安全簽到失敗:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

   async handleDailySignIn() {
     try {
       console.log('[APK.TW] 自動簽到觸發');
       await this.addLog('自動簽到觸發', 'info');

       // 檢查設置
       const settings = await this.getSettings();
       if (!settings.autoSignIn) {
         console.log('[APK.TW] 自動簽到已關閉');
         await this.addLog('自動簽到已關閉', 'warning');
         return;
       }

        // 打開APK.TW網站
        const tab = await chrome.tabs.create({
          url: 'https://www.apk.tw/forum.php',
          active: false
        });

// 等待頁面完全載入
        await new Promise(resolve => setTimeout(resolve, 8000));

       // 檢查登入狀態
       const loginStatus = await this.executeScript({
         func: () => {
           try {
             const loginLink = document.querySelector('a[href*="member.php?mod=logging"]');
             const isLoggedIn = loginLink && !loginLink.textContent.includes('登錄');
             return { isLoggedIn: isLoggedIn };
           } catch (e) {
             return { isLoggedIn: false, error: e.message };
           }
         },
         target: { tabId: tab.id }
       });

       if (!loginStatus.isLoggedIn) {
         console.log('[APK.TW] 未登入，跳過簽到');
         await this.addLog('未登入，無法簽到', 'warning');
         chrome.tabs.remove(tab.id);
         return;
       }

       // 檢查簽到狀態
       const status = await this.executeScript({
         func: () => {
           try {
             const isSignedIn = document.getElementById('ppered') !== null;
             const canSignIn = document.getElementById('my_amupper') !== null;
             return { isSignedIn, canSignIn };
           } catch (e) {
             return { error: e.message };
           }
         },
         target: { tabId: tab.id }
       });

       if (status.isSignedIn) {
         console.log('[APK.TW] 今日已簽到');
         await this.addLog('今日已簽到', 'success');
        } else if (status.canSignIn) {
          // 執行簽到（帶重試機制）
          let result = null;
          for (let i = 0; i < 3; i++) {
            result = await this.executeScript({
              func: () => {
                try {
                  const signInBtn = document.getElementById('my_amupper');
                  if (signInBtn) {
                    signInBtn.click();
                    // 等待一下看結果
                    setTimeout(() => {
                      const ppered = document.getElementById('ppered');
                      if (ppered) {
                        return { success: true, message: '自動簽到成功' };
                      }
                    }, 2000);
                    return { success: true, message: '簽到請求已發送' };
                  } else {
                    return { success: false, message: '找不到簽到按鈕' };
                  }
                } catch (e) {
                  return { success: false, error: e.message };
                }
              },
              target: { tabId: tab.id }
            });
            
            if (result && result.success) {
              break;
            } else {
              // 等待後重試
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          console.log('[APK.TW] 自動簽到結果:', result);
          if (result && result.success) {
            await this.addLog('自動簽到成功', 'success');
          } else {
            await this.addLog('自動簽到失敗: ' + (result?.message || '未知錯誤'), 'error');
          }
       } else {
         console.log('[APK.TW] 目前不可簽到');
         await this.addLog('目前不可簽到', 'warning');
       }

       // 關閉標籤頁
       chrome.tabs.remove(tab.id);
     } catch (error) {
       console.error('[APK.TW] 自動簽到失敗:', error);
       await this.addLog('自動簽到失敗: ' + error.message, 'error');
     }
   }

   handleInstalled(details) {
     if (details.reason === 'install') {
       console.log('[APK.TW] 擴展安裝成功');
     } else if (details.reason === 'update') {
       console.log('[APK.TW] 擴展更新成功');
     }
   }
}

// 初始化背景腳本
new APKTwBackground();