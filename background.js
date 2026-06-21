const LOG_PREFIX = '[APK.TW]';
const STORAGE_KEYS = {
  SETTINGS: 'apk_tw_settings',
  LOGS: 'apk_tw_logs',
  SIGNED_TODAY: 'apk_tw_signed_today'
};

class APKTwBackground {
  constructor() {
    this.init();
  }

  async init() {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });

      chrome.runtime.onInstalled.addListener((details) => {
        const action = details.reason === 'install' ? '安裝' : '更新';
        console.log(`${LOG_PREFIX} 擴展${action}成功`);
      });

      chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === 'dailySignIn') {
          await this.performAutoSignIn();
        }
      });

      await this.setupAlarms();
    } catch (error) {
      console.error(`${LOG_PREFIX} 初始化失敗:`, error);
    }
  }

  async setupAlarms() {
    try {
      chrome.alarms.clearAll(async () => {
        const settings = await this.getSettings();
        const [hours, minutes] = settings.signInTime.split(':').map(Number);
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

        chrome.alarms.create('dailySignIn', {
          when: target.getTime(),
          periodInMinutes: 24 * 60
        });

        console.log(`${LOG_PREFIX} 定時任務已設置於 ${settings.signInTime}`);
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} 定時任務設置失敗:`, error);
    }
  }

  async signInViaAPI() {
    if (this._signingIn) return { success: false, error: '簽到進行中，請稍候' };
    this._signingIn = true;
    await chrome.storage.local.set({ apk_tw_signing_in: true });
    let createdByUs = false;
    try {
      let tab = (await chrome.tabs.query({ url: 'https://apk.tw/*' })).find(t => t.url?.includes('apk.tw'));
      if (!tab) {
        createdByUs = true;
        tab = await chrome.tabs.create({ url: 'https://apk.tw/forum.php', active: false });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('分頁載入逾時'));
          }, 15000);
          const listener = (tabId, info) => {
            if (tabId === tab.id && info.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(resolve, 1500);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      }

      const result = await chrome.scripting.executeScript({
        func: async () => {
          try {
            if (window.location.href.includes('plugin.php') && window.location.href.includes('dsu_amupper')) {
              return { success: false, error: '已在簽到頁面，跳過' };
            }

            const fh = (document.querySelector('input[name="formhash"]')?.value) ||
                       (document.documentElement.innerHTML.match(/formhash=([a-f0-9]+)/i)?.[1]) || '';

            const link = document.getElementById('my_amupper') ||
                         document.querySelector('a[href*="dsu_amupper"]') ||
                         document.querySelector('a.amupper');

            const getBaseUrl = () => {
              if (!link || !link.href) return '/plugin.php?id=dsu_amupper:pper';
              const h = link.href;
              if (h === 'javascript:;' || h === '#' || h === '' || h.startsWith('javascript:')) return '/plugin.php?id=dsu_amupper:pper';
              return h;
            };

            const isSigned = () => new Promise(r => {
              chrome.storage.local.get('apk_tw_signed_today', d => {
                r(d.apk_tw_signed_today === new Date().toDateString());
              });
            });
            if (await isSigned()) return { success: true, alreadySigned: true, message: '今日已簽到' };

            const baseUrl = getBaseUrl();

            const urls = [
              baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'infloat=1&ajax=1' + (fh ? '&formhash=' + fh : ''),
              baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'ajax=1' + (fh ? '&formhash=' + fh : '') + '&ppersubmit=1'
            ];

            for (const url of urls) {
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  const res = await fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                      'Accept': 'application/json, text/plain, */*',
                      'X-Requested-With': 'XMLHttpRequest'
                    }
                  });
                  const text = await res.text();
                  if (text.includes('簽到成功') || text.includes('success') || text.includes('succ')) {
                    return { success: true, message: '簽到成功' };
                  }
                  if (text.includes('已簽') || text.includes('already') || text.includes('重新')) {
                    return { success: true, alreadySigned: true, message: '今日已簽到' };
                  }
                  if (text.length > 0 && !text.startsWith('<!')) {
                    return { success: true, message: text.slice(0, 100) };
                  }
                } catch (e) {
                  if (attempt === 1) throw e;
                  await new Promise(r => setTimeout(r, 1000));
                }
              }
            }

            if (link) {
              link.click();
              await new Promise(r => setTimeout(r, 4000));
              if (await isSigned()) return { success: true, message: '簽到成功' };
            }

            return { success: false, error: '所有簽到方式皆失敗' };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
        target: { tabId: tab.id }
      });

      if (createdByUs) chrome.tabs.remove(tab.id).catch(() => {});
      const r = result[0]?.result || {};
      if (!r.success && !r.error) r.error = r.message || '簽到失敗';
      return r;
    } catch (error) {
      return { success: false, error: `簽到請求失敗: ${error.message}` };
    } finally {
      this._signingIn = false;
      chrome.storage.local.remove('apk_tw_signing_in').catch(() => {});
    }
  }

  async checkLoginStatus() {
    try {
      const cookies = await chrome.cookies.getAll({ url: 'https://apk.tw/' });
      return cookies.some(c => c.name.includes('auth') || c.name.includes('saltkey') || c.name.includes('sid') || c.name.includes('uid'));
    } catch { return false; }
  }

  async performAutoSignIn() {
    try {
      const settings = await this.getSettings();
      if (!settings.autoSignIn) {
        return { success: false, error: '自動簽到已關閉' };
      }

      const signedToday = await this.isTodaySigned();
      if (signedToday) {
        return { success: true, message: '今日已簽到', alreadySigned: true };
      }

      const loggedIn = await this.checkLoginStatus();
      if (!loggedIn) {
        const msg = '未登入，無法自動簽到';
        await this.addLog(msg, false);
        return { success: false, error: msg };
      }

      const result = await this.signInViaAPI();
      await this.addLog(result.success ? '自動簽到成功' : `自動簽到失敗: ${result.error || result.message || '未知錯誤'}`, result.success);

      if (result.success && settings.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.svg',
          title: 'APK.TW 自動簽到',
          message: result.alreadySigned ? '今日已簽到' : '簽到成功！'
        });
      }

      return result;
    } catch (error) {
      const msg = `自動簽到失敗: ${error.message}`;
      console.error(`${LOG_PREFIX} ${msg}`, error);
      await this.addLog(msg, false);
      return { success: false, error: error.message };
    }
  }

  async isTodaySigned() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SIGNED_TODAY);
    const today = new Date().toDateString();
    return data[STORAGE_KEYS.SIGNED_TODAY] === today;
  }

  async markTodaySigned() {
    await chrome.storage.local.set({ [STORAGE_KEYS.SIGNED_TODAY]: new Date().toDateString() });
  }

  handleMessage(message, sender, sendResponse) {
    if (!message || !message.action) {
      sendResponse({ error: '未知消息' });
      return true;
    }

    const handler = {
      getSettings: () => this.getSettings(),
      getLogs: () => this.getLogs(),
      clearLogs: () => this.clearLogs(),
      saveSettings: () => this.saveSettings(message.settings),
      checkSignInStatus: () => this.checkSignInStatus(),
      manualSignIn: () => this.manualSignIn(),
      manualSignInWithTab: () => this.manualSignInWithTab(message.tabId),
      executeSafeSignIn: () => this.executeSafeSignIn(),
      executeAutoSignIn: () => this.performAutoSignIn()
    };

    const fn = handler[message.action];
    if (fn) {
      fn().then(result => sendResponse(result)).catch(error => sendResponse({ error: error.message }));
    } else {
      sendResponse({ error: '未知消息動作' });
    }
    return true;
  }

  async checkSignInStatus() {
    try {
      const signedToday = await this.isTodaySigned();
      const logs = await this.getLogs();
      const lastLog = logs.find(l => l.success);

      const cookies = await chrome.cookies.getAll({ url: 'https://apk.tw/' });
      const hasAuthCookie = cookies.some(c =>
        (c.name.includes('auth') || c.name.includes('saltkey') || c.name.includes('sid') || c.name.includes('uid'))
      );

      return {
        isLoggedIn: hasAuthCookie,
        isSignedIn: signedToday,
        canSignIn: hasAuthCookie && !signedToday,
        lastSignInTime: lastLog?.timestamp || null,
        message: !hasAuthCookie ? '請先登入' : (signedToday ? '今日已簽到' : '可簽到')
      };
    } catch (error) {
      return { error: `檢查狀態失敗: ${error.message}` };
    }
  }

  async manualSignIn() {
    return this.performAutoSignIn();
  }

  async manualSignInWithTab(tabId) {
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = await chrome.scripting.executeScript({
        func: () => {
          try {
            const loginLink = document.querySelector('a[href*="member.php?mod=logging"]');
            if (loginLink && loginLink.textContent.includes('登錄')) {
              return { success: false, message: '尚未登入帳號' };
            }
            let btn = document.getElementById('my_amupper');
            if (!btn) btn = document.querySelector('a[href*="plugin.php?id=dsu_amupper"]');
            if (!btn) btn = document.querySelector('a.amupper');
            if (btn) {
              btn.click();
              return { success: true, message: '已發送簽到請求' };
            }
            return { success: false, message: '找不到簽到按鈕' };
          } catch (e) {
            return { success: false, error: `簽到失敗: ${e.message}` };
          }
        },
        target: { tabId }
      });

      return result[0]?.result || { success: false, error: '未知錯誤' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeSafeSignIn() {
    try {
      const tab = await this.getActiveTab();
      if (!tab) return this.signInViaAPI();

      const result = await chrome.scripting.executeScript({
        func: async () => {
          try {
            if (window.location.href.includes('plugin.php') && window.location.href.includes('dsu_amupper')) {
              return { success: false, error: '已在簽到頁面，跳過' };
            }
            const link = document.getElementById('my_amupper') ||
                         document.querySelector('a[href*="dsu_amupper"]') ||
                         document.querySelector('a.amupper');
            if (!link) return { success: false, error: '找不到簽到按鈕' };
            const isSigned = () => new Promise(r => {
              chrome.storage.local.get('apk_tw_signed_today', d => {
                r(d.apk_tw_signed_today === new Date().toDateString());
              });
            });
            if (await isSigned()) return { success: true, alreadySigned: true, message: '今日已簽到' };
            link.click();
            await new Promise(r => setTimeout(r, 4000));
            if (await isSigned()) return { success: true, message: '簽到成功' };
            return { success: false, error: '點擊按鈕後未偵測到簽到成功' };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
        target: { tabId: tab.id }
      });
      return result[0]?.result || { success: false, error: '執行失敗' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
        return null;
      }
      return tab;
    } catch {
      return null;
    }
  }

  async getSettings() {
    try {
      return await chrome.storage.sync.get({
        autoSignIn: true,
        signInTime: '00:03',
        notifications: true
      });
    } catch {
      return { autoSignIn: true, signInTime: '00:03', notifications: true };
    }
  }

  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set(settings);
      await this.setupAlarms();
      return true;
    } catch {
      return false;
    }
  }

  async addLog(message, success = true) {
    try {
      const logs = await this.getLogs();
      logs.unshift({ timestamp: Date.now(), message, success });
      if (logs.length > 50) logs.pop();
      await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });

      if (success) await this.markTodaySigned();
    } catch (error) {
      console.error(`${LOG_PREFIX} 添加日誌失敗:`, error);
    }
  }

  async getLogs() {
    try {
      const data = await chrome.storage.local.get({ [STORAGE_KEYS.LOGS]: [] });
      return data[STORAGE_KEYS.LOGS] || [];
    } catch {
      return [];
    }
  }

  async clearLogs() {
    try {
      await chrome.storage.local.remove(STORAGE_KEYS.LOGS);
      return true;
    } catch {
      return false;
    }
  }
}

new APKTwBackground();