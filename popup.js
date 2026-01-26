// 彈出窗口腳本 - 處理用戶界面交互
class APKTwPopup {
  constructor() {
    this.init();
  }

  init() {
    // 綁定事件監聽器
    this.bindEvents();
    
    // 載入初始數據
    this.loadInitialData();
  }

  bindEvents() {
    // 檢查狀態按鈕
    document.getElementById('check-status').addEventListener('click', () => {
      this.checkStatus();
    });

    // 手動簽到按鈕
    document.getElementById('manual-signin').addEventListener('click', () => {
      this.manualSignIn();
    });

     // 測試自動簽到按鈕
     document.getElementById('test-auto-signin').addEventListener('click', () => {
       this.testAutoSignIn();
     });

     // 打開 APK.TW 按鈕
     document.getElementById('open-apk').addEventListener('click', () => {
       this.openAPKTw();
     });

    // 設置變更
    document.getElementById('auto-signin').addEventListener('change', (e) => {
      this.saveSettings();
    });

    document.getElementById('signin-time').addEventListener('change', (e) => {
      this.saveSettings();
    });

    document.getElementById('notifications').addEventListener('change', (e) => {
      this.saveSettings();
    });
  }

  async loadInitialData() {
    try {
      // 載入設置
      const settings = await this.getSettings();
      this.updateSettingsUI(settings);

      // 載入日誌
      const logs = await this.getLogs();
      this.updateLogsUI(logs);

      // 檢查狀態
      await this.checkStatus();
    } catch (error) {
      console.error('載入初始數據失敗:', error);
      this.showError('載入數據失敗: ' + error.message);
    }
  }

  async checkStatus() {
    const checkBtn = document.getElementById('check-status');
    const originalText = checkBtn.textContent;
    
    try {
      // 顯示載入狀態
      checkBtn.innerHTML = '檢查中<span class="loading"></span>';
      checkBtn.disabled = true;

      // 發送消息到背景腳本
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'checkSignInStatus'
        }, resolve);
      });

      if (response && !response.error) {
        this.updateStatusUI(response);
      } else if (response && response.needOpenSite) {
        this.showError('請先打開 APK.TW 網站');
        // 自動打開網站
        setTimeout(() => this.openAPKTw(), 1500);
      } else {
        this.showError(response?.error || '檢查狀態失敗');
      }
    } catch (error) {
      console.error('檢查狀態失敗:', error);
      this.showError('檢查狀態失敗: ' + error.message);
    } finally {
      // 恢復按鈕狀態
      checkBtn.textContent = originalText;
      checkBtn.disabled = false;
    }
  }

  async manualSignIn() {
    const signInBtn = document.getElementById('manual-signin');
    const originalText = signInBtn.textContent;
    
    try {
      // 顯示載入狀態
      signInBtn.innerHTML = '簽到中<span class="loading"></span>';
      signInBtn.disabled = true;

      // 獲取當前活動標籤
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tabs.length === 0 || !tabs[0].url.includes('apk.tw')) {
        this.showError('請先打開 APK.TW 網站');
        return;
      }

      // 發送簽到請求
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'manualSignIn'
        }, resolve);
      });

      if (response && response.success) {
        this.showSuccess('簽到成功！');
        // 重新檢查狀態
        setTimeout(() => this.checkStatus(), 2000);
      } else if (response && response.needOpenSite) {
        this.showError('請先打開 APK.TW 網站');
        // 自動打開網站
        setTimeout(() => this.openAPKTw(), 1500);
      } else {
        this.showError('簽到失敗: ' + (response?.message || response?.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('手動簽到失敗:', error);
      this.showError('簽到失敗: ' + error.message);
    } finally {
      // 恢復按鈕狀態
      signInBtn.textContent = originalText;
      signInBtn.disabled = false;
    }
   }

   async testAutoSignIn() {
     try {
       const btn = document.getElementById('test-auto-signin');
       const originalText = btn.textContent;
       btn.textContent = '測試中...';
       btn.disabled = true;

       chrome.runtime.sendMessage({ action: 'executeAutoSignIn' }, (response) => {
         if (response && response.success) {
           this.showSuccess('測試自動簽到完成，請檢查日誌');
         } else {
           this.showError('測試失敗: ' + (response?.error || '未知錯誤'));
         }

         // 重新載入日誌
         this.loadLogs();

         // 恢復按鈕狀態
         btn.textContent = originalText;
         btn.disabled = false;
       });
     } catch (error) {
       console.error('測試自動簽到失敗:', error);
       this.showError('測試失敗: ' + error.message);
     }
   }

   async openAPKTw() {
    try {
      await chrome.tabs.create({
        url: 'https://apk.tw/forum.php',
        active: true
      });
      
      // 關閉彈出窗口
      window.close();
    } catch (error) {
      console.error('打開 APK.TW 失敗:', error);
      this.showError('打開網站失敗: ' + error.message);
    }
  }

  async saveSettings() {
    try {
      const settings = {
        autoSignIn: document.getElementById('auto-signin').checked,
        signInTime: document.getElementById('signin-time').value,
        notifications: document.getElementById('notifications').checked
      };

      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'saveSettings',
          settings: settings
        }, resolve);
      });

      this.showSuccess('設置已保存');
    } catch (error) {
      console.error('保存設置失敗:', error);
      this.showError('保存設置失敗: ' + error.message);
    }
  }

  updateStatusUI(data) {
    // 更新登入狀態
    const loginStatus = document.getElementById('login-status');
    if (data.isLoggedIn) {
      loginStatus.textContent = '已登入';
      loginStatus.className = 'status-value status-success';
    } else {
      loginStatus.textContent = '未登入';
      loginStatus.className = 'status-value status-error';
    }

    // 更新簽到狀態
    const signInStatus = document.getElementById('signin-status');
    if (data.isSignedIn) {
      signInStatus.textContent = '已簽到';
      signInStatus.className = 'status-value status-success';
    } else if (data.canSignIn) {
      signInStatus.textContent = '可簽到';
      signInStatus.className = 'status-value status-warning';
    } else {
      signInStatus.textContent = '不可簽到';
      signInStatus.className = 'status-value status-error';
    }

    // 更新最後簽到時間
    const lastSignIn = document.getElementById('last-signin');
    if (data.lastSignInTime) {
      const date = new Date(data.lastSignInTime);
      lastSignIn.textContent = this.formatDate(date);
      lastSignIn.className = 'status-value status-info';
    } else {
      lastSignIn.textContent = '無記錄';
      lastSignIn.className = 'status-value status-warning';
    }
  }

  updateSettingsUI(settings) {
    document.getElementById('auto-signin').checked = settings.autoSignIn;
    document.getElementById('signin-time').value = settings.signInTime;
    document.getElementById('notifications').checked = settings.notifications;
  }

  updateLogsUI(logs) {
    const container = document.getElementById('logs-container');
    
    if (logs.length === 0) {
      container.innerHTML = '<div class="log-item"><span class="log-time">--:--</span>暫無日誌記錄</div>';
      return;
    }

    container.innerHTML = logs.map(log => {
      const date = new Date(log.timestamp);
      const timeStr = this.formatTime(date);
      
      return `
        <div class="log-item">
          <span class="log-time">${timeStr}</span>
          ${log.message}
        </div>
      `;
    }).join('');
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type) {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'success' ? '#d4edda' : '#f8d7da'};
      color: ${type === 'success' ? '#155724' : '#721c24'};
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 3秒後自動移除
    setTimeout(() => {
      notification.style.animation = 'slideUp 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  formatDate(date) {
    const options = { 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('zh-TW', options);
  }

  formatTime(date) {
    const options = { 
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleTimeString('zh-TW', options);
  }

  async getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        resolve(response || { autoSignIn: true, signInTime: '09:00', notifications: true });
      });
    });
  }

  async getLogs() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getLogs' }, (response) => {
        resolve(response || []);
      });
    });
  }
}

// 添加動畫樣式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translate(-50%, -20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  
  @keyframes slideUp {
    from {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -20px);
    }
  }
`;
document.head.appendChild(style);

// 初始化彈出窗口
document.addEventListener('DOMContentLoaded', () => {
  new APKTwPopup();
});