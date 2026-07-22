const DATE_OPTIONS = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit' };

class APKTwPopup {
  constructor() {
    this.el = {};
    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.loadInitialData();
  }

  cacheDOM() {
    const ids = ['check-status', 'manual-signin', 'test-auto-signin', 'open-apk',
                 'login-status', 'signin-status', 'last-signin',
                 'auto-signin', 'signin-time', 'notifications', 'logs-container'];
    for (const id of ids) {
      this.el[id.replace(/-(.)/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
    }
  }

  bindEvents() {
    this.el.checkStatus.addEventListener('click', () => this.checkStatus());
    this.el.manualSignin.addEventListener('click', () => this.manualSignIn());
    this.el.testAutoSignin.addEventListener('click', () => this.testAutoSignIn());
    this.el.openApk.addEventListener('click', () => this.openAPKTw());
    this.el.autoSignin.addEventListener('change', () => this.saveSettings());
    this.el.signinTime.addEventListener('change', () => this.saveSettings());
    this.el.notifications.addEventListener('change', () => this.saveSettings());
  }

  async loadInitialData() {
    try {
      const settings = await this.getSettings();
      this.updateSettingsUI(settings);
      const logs = await this.getLogs();
      this.updateLogsUI(logs);
      await this.checkStatus();
    } catch (error) {
      this.showError(`載入數據失敗: ${error.message}`);
    }
  }

  async checkStatus() {
    const btn = this.el.checkStatus;
    const originalText = btn.textContent;
    try {
      btn.innerHTML = '檢查中<span class="loading"></span>';
      btn.disabled = true;

      const res = await this.sendMessage({ action: 'checkSignInStatus' });
      if (res && !res.error) {
        this.updateStatusUI(res);
      } else {
        this.showError(res?.error || '檢查狀態失敗');
      }
    } catch (error) {
      this.showError(`檢查狀態失敗: ${error.message}`);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async manualSignIn() {
    const btn = this.el.manualSignin;
    const originalText = btn.textContent;
    try {
      btn.innerHTML = '簽到中<span class="loading"></span>';
      btn.disabled = true;

      const res = await this.sendMessage({ action: 'manualSignIn' });
      if (res && res.success) {
        this.showSuccess(res.alreadySigned ? '今日已簽到' : '簽到成功！');
        const logs = await this.getLogs();
        this.updateLogsUI(logs);
        setTimeout(() => this.checkStatus(), 2000);
      } else {
        this.showError(`簽到失敗: ${res?.error || '未知錯誤'}`);
      }
    } catch (error) {
      this.showError(`簽到失敗: ${error.message}`);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async testAutoSignIn() {
    const btn = this.el.testAutoSignin;
    const originalText = btn.textContent;
    try {
      btn.textContent = '測試中...';
      btn.disabled = true;

      const res = await this.sendMessage({ action: 'executeAutoSignIn' });
      if (res && res.success) {
        this.showSuccess('測試自動簽到完成');
      } else {
        this.showError(`測試失敗: ${res?.error || '未知錯誤'}`);
      }

      const logs = await this.getLogs();
      this.updateLogsUI(logs);
    } catch (error) {
      this.showError(`測試失敗: ${error.message}`);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async openAPKTw() {
    try {
      await chrome.tabs.create({ url: 'https://apk.tw/forum.php', active: true });
      window.close();
    } catch (error) {
      this.showError(`打開網站失敗: ${error.message}`);
    }
  }

  async saveSettings() {
    try {
      const settings = {
        autoSignIn: this.el.autoSignin.checked,
        signInTime: this.el.signinTime.value,
        notifications: this.el.notifications.checked
      };
      await this.sendMessage({ action: 'saveSettings', settings });
      this.showSuccess('設置已保存');
    } catch (error) {
      this.showError(`保存設置失敗: ${error.message}`);
    }
  }

  updateStatusUI(data) {
    const loginStatus = this.el.loginStatus;
    loginStatus.textContent = data.isLoggedIn ? '已登入' : '未登入';
    loginStatus.className = `status-value status-${data.isLoggedIn ? 'success' : 'error'}`;

    const signInStatus = this.el.signinStatus;
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

    const lastSignIn = this.el.lastSignin;
    if (data.lastSignInTime) {
      lastSignIn.textContent = new Date(data.lastSignInTime).toLocaleDateString('zh-TW', DATE_OPTIONS);
      lastSignIn.className = 'status-value status-info';
    } else {
      lastSignIn.textContent = '無記錄';
      lastSignIn.className = 'status-value status-warning';
    }
  }

  updateSettingsUI(settings) {
    this.el.autoSignin.checked = settings.autoSignIn;
    this.el.signinTime.value = settings.signInTime;
    this.el.notifications.checked = settings.notifications;
  }

  updateLogsUI(logs) {
    const container = this.el.logsContainer;
    if (logs.length === 0) {
      container.innerHTML = '<div class="log-item"><span class="log-time">--:--</span>暫無日誌記錄</div>';
      return;
    }
    container.innerHTML = logs.map(log =>
      `<div class="log-item"><span class="log-time">${new Date(log.timestamp).toLocaleTimeString('zh-TW', TIME_OPTIONS)}</span>${log.message}</div>`
    ).join('');
  }

  showSuccess(message) { this.showNotification(message, 'success'); }
  showError(message) { this.showNotification(message, 'error'); }

  showNotification(message, type) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;top:20px;left:50%;transform:translateX(-50%);
      background:${type === 'success' ? '#d4edda' : '#f8d7da'};
      color:${type === 'success' ? '#155724' : '#721c24'};
      padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;
      z-index:10000;box-shadow:0 4px 15px rgba(0,0,0,0.2);animation:slideDown .3s ease`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slideUp .3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  sendMessage(msg) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(res);
        }
      });
    });
  }

  async getSettings() {
    const res = await this.sendMessage({ action: 'getSettings' });
    return res || { autoSignIn: true, signInTime: '09:00', notifications: true };
  }

  async getLogs() {
    const res = await this.sendMessage({ action: 'getLogs' });
    return res || [];
  }
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown{from{opacity:0;transform:translate(-50%,-20px)}to{opacity:1;transform:translate(-50%,0)}}
  @keyframes slideUp{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,-20px)}}`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => new APKTwPopup());