const LOG_PREFIX = '[APK.TW]';
const STORAGE_KEYS = {
  SETTINGS: 'apk_tw_settings',
  LOGS: 'apk_tw_logs',
  SIGNED_TODAY: 'apk_tw_signed_today',
  WEEKLY_CLAIMED: 'apk_tw_weekly_claimed'
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
      await chrome.alarms.clearAll();
      const settings = await this.getSettings();
      const [hours, minutes] = settings.signInTime.split(':').map(Number);
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

      await chrome.alarms.create('dailySignIn', {
        when: target.getTime(),
        periodInMinutes: 24 * 60
      });

      console.log(`${LOG_PREFIX} 定時任務已設置於 ${settings.signInTime}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} 定時任務設置失敗:`, error);
    }
  }

  async signInViaAPI() {
    if (this._signingIn) return { success: false, error: '簽到進行中，請稍候' };
    this._signingIn = true;

    let tab;
    let prevTabId = null;
    try {
      if (!await this.checkLoginStatus()) return { success: false, error: '未登入，無法簽到' };

      // 先用分頁方式嘗試（DOM 偵測 + content script）
      const prevTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (prevTabs[0]) prevTabId = prevTabs[0].id;

      tab = await chrome.tabs.create({ url: 'https://apk.tw/forum.php', active: true });
      await new Promise(r => setTimeout(r, 300));
      if (prevTabId) chrome.tabs.update(prevTabId, { active: true }).catch(() => {});

      const today = new Date().toDateString();
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 1000));

        const data = await chrome.storage.local.get(STORAGE_KEYS.SIGNED_TODAY);
        if (data[STORAGE_KEYS.SIGNED_TODAY] === today) {
          return { success: true, message: '簽到成功' };
        }

        try {
          const r = await chrome.scripting.executeScript({
            func: () => {
              if (!document.body) return { loading: true };
              const btn = document.getElementById('my_amupper');
              const fh = document.querySelector('input[name="formhash"]');
              return { hasBtn: !!btn, hasFh: !!(fh && fh.value), loading: false };
            },
            target: { tabId: tab.id }
          });
          const d = r[0]?.result || {};
          if (d.hasBtn && d.hasFh) {
            await chrome.scripting.executeScript({
              func: () => {
                const btn = document.getElementById('my_amupper');
                if (btn) { btn.click(); return true; }
                return false;
              },
              target: { tabId: tab.id }
            });
          }
        } catch { }
      }

      // 分頁逾時 → 改用直接 fetch（不依賴分頁，權威驗證）
      const loginok = await this.checkLoginStatus();
      if (!loginok) return { success: false, error: '未登入，無法簽到' };
      const result = await this.fetchCheckSignIn();
      if (result === 'success') return { success: true, message: '簽到成功' };
      if (result === 'signed') return { success: true, alreadySigned: true, message: '今日已簽到' };
      return { success: false, error: '簽到無結果' };
    } catch (error) {
      return { success: false, error: `簽到失敗: ${error.message}` };
    } finally {
      this._signingIn = false;
      if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
    }
  }

  async fetchCheckSignIn() {
    try {
      const htmlRes = await fetch('https://apk.tw/forum.php', { credentials: 'include' });
      const html = await htmlRes.text();
      const fhMatch = html.match(/formhash=([a-f0-9]+)/i);
      const formhash = fhMatch ? fhMatch[1] : '';
      if (!formhash) { console.log('[APK.TW] fetch 無法取得 formhash'); return null; }

      const url = `https://apk.tw/plugin.php?id=dsu_amupper:pper&infloat=1&ajax=1&formhash=${formhash}`;
      const res = await fetch(url, { credentials: 'include' });
      const text = await res.text();

      if (text.includes('簽到成功') || text.includes('succ') || text.includes('success')) {
        await this.markTodaySigned();
        console.log('[APK.TW] fetch 簽到成功');
        return 'success';
      }
      if (text.includes('已簽') || text.includes('already') || text.includes('重複簽到') || text.includes('重複領取')) {
        await this.markTodaySigned();
        console.log('[APK.TW] fetch 已簽到');
        return 'signed';
      }
      const errorWords = ['失敗', '錯誤', '無效', '請先登入', '請重新登入', '登錄', 'denied', 'expired', '非法'];
      if (errorWords.some(w => text.includes(w))) {
        console.log('[APK.TW] fetch 回應為錯誤:', text.slice(0, 120));
        return null;
      }
      console.log('[APK.TW] fetch 回應:', text.slice(0, 120));
      return null;
    } catch (e) {
      console.log('[APK.TW] fetch 失敗:', e.message);
      return null;
    }
  }

  async claimWeeklyTask() {
    if (await this.isWeeklyTaskClaimed()) {
      console.log('[APK.TW] 本週已領取每週積分');
      return { claimed: true, alreadyClaimed: true };
    }
    try {
      // 先查看任務頁面狀態
      const viewRes = await fetch('https://apk.tw/home.php?mod=task&do=view&id=7', { credentials: 'include' });
      const viewText = await viewRes.text();

      // 頁面已顯示領取完成 → 直接標記
      if (viewText.includes('已領取') || viewText.includes('已完成') || viewText.includes('已經')) {
        await this.markWeeklyTaskClaimed();
        console.log('[APK.TW] 每週積分已領取（頁面確認）');
        return { claimed: true, alreadyClaimed: true };
      }

      // 申請 → 領取
      await fetch('https://apk.tw/home.php?mod=task&do=apply&id=7', { credentials: 'include' });
      await fetch('https://apk.tw/home.php?mod=task&do=draw&id=7', { credentials: 'include' });

      // 重新檢查任務頁面確認狀態
      const checkRes = await fetch('https://apk.tw/home.php?mod=task&do=view&id=7', { credentials: 'include' });
      const checkText = await checkRes.text();

      if (checkText.includes('已領取') || checkText.includes('已完成') || checkText.includes('已經') ||
          checkText.includes('succ') || checkText.includes('success')) {
        await this.markWeeklyTaskClaimed();
        console.log('[APK.TW] 每週積分已領取');
        return { claimed: true };
      }
      if (checkText.includes('需要先登錄')) {
        return { claimed: false, error: '未登入' };
      }
      console.log('[APK.TW] 每週積分領取後頁面:', checkText.slice(0, 120));
      return { claimed: false, error: '領取無結果' };
    } catch (e) {
      console.log('[APK.TW] 每週積分領取失敗:', e.message);
      return { claimed: false, error: e.message };
    }
  }

  async checkLoginStatus() {
    try {
      const cookies = await chrome.cookies.getAll({ url: 'https://apk.tw/' });
      const hasSession = cookies.some(c => c.name.includes('auth') || c.name.includes('saltkey') || c.name.includes('sid') || c.name.includes('uid'));
      if (!hasSession) {
        const names = cookies.map(c => c.name).join(', ');
        console.warn(`${LOG_PREFIX} Cookie 檢查失敗，現有 cookie: ${names || '無'}`);
      }
      return hasSession;
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
        // storage 顯示已簽到，但仍驗證真實狀態（避免之前誤標）
        const verify = await this.fetchCheckSignIn();
        if (verify === 'signed') {
          return { success: true, message: '今日已簽到', alreadySigned: true };
        }
        if (verify === 'success') {
          return { success: true, message: '簽到成功' };
        }
        // 驗證失敗：可能 storage 被誤標，清除後重新簽到
        console.warn(`${LOG_PREFIX} storage 標記已簽到但驗證失敗，清除標記重新簽到`);
        await chrome.storage.local.remove(STORAGE_KEYS.SIGNED_TODAY);
      }

      const loggedIn = await this.checkLoginStatus();
      if (!loggedIn) {
        const msg = '未登入，無法自動簽到';
        await this.addLog(msg, false);
        return { success: false, error: msg };
      }

      const result = await this.signInViaAPI();

      // 簽到成功後順便領取每週積分
      let weeklyResult = null;
      if (result.success) {
        weeklyResult = await this.claimWeeklyTask();
        if (weeklyResult.claimed) {
          console.log(`${LOG_PREFIX} 每週積分已領取${weeklyResult.alreadyClaimed ? '（本週已領）' : ''}`);
        } else {
          console.warn(`${LOG_PREFIX} 每週積分領取失敗: ${weeklyResult.error || '未知'}`);
        }
      }

      await this.addLog(result.success ? '自動簽到成功' : `自動簽到失敗: ${result.error || '未知錯誤'}`, result.success);

      if (result.success && settings.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
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

  getWeekId() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = Math.floor((now - start + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60000) / 86400000);
    const week = Math.ceil((diff + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  async isWeeklyTaskClaimed() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_CLAIMED);
    return data[STORAGE_KEYS.WEEKLY_CLAIMED] === this.getWeekId();
  }

  async markWeeklyTaskClaimed() {
    await chrome.storage.local.set({ [STORAGE_KEYS.WEEKLY_CLAIMED]: this.getWeekId() });
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
      executeAutoSignIn: () => this.performAutoSignIn(),
      claimWeeklyTask: () => this.claimWeeklyTask()
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

      // 即時檢查網站上每週積分是否已領取
      let weeklyClaimed = await this.isWeeklyTaskClaimed();
      if (hasAuthCookie && !weeklyClaimed) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 5000);
          const viewRes = await fetch('https://apk.tw/home.php?mod=task&do=view&id=7', { credentials: 'include', signal: ctrl.signal });
          clearTimeout(to);
          const viewText = await viewRes.text();
          if (viewText.includes('已領取') || viewText.includes('已完成') || viewText.includes('已經')) {
            await this.markWeeklyTaskClaimed();
            weeklyClaimed = true;
          }
        } catch { }
      }

      return {
        isLoggedIn: hasAuthCookie,
        isSignedIn: signedToday,
        weeklyClaimed: weeklyClaimed,
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