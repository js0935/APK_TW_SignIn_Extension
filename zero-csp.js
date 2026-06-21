(function () {
  'use strict';

  if (window.__apkSignerInited) return;
  window.__apkSignerInited = true;

  const PREFIX = '[APK.TW]';
  const ENDPOINT = '/plugin.php?id=dsu_amupper:pper';
  const DELAY = 1500;

  const SIGNED_KEY = 'apk_tw_signed_today';
  const LOGS_KEY = 'apk_tw_logs';

  function log(msg) {
    try { console.log(`%c${PREFIX}%c ${msg}`, 'background:#667eea;color:white;padding:2px 4px;border-radius:3px', 'color:#666'); } catch (e) { }
  }

  async function isTodaySigned() {
    try {
      const data = await chrome.storage.local.get(SIGNED_KEY);
      return data[SIGNED_KEY] === new Date().toDateString();
    } catch { return false; }
  }

  async function addLog(message, success) {
    try {
      const data = await chrome.storage.local.get({ [LOGS_KEY]: [] });
      const logs = data[LOGS_KEY];
      logs.unshift({ timestamp: Date.now(), message, success });
      if (logs.length > 50) logs.pop();
      await chrome.storage.local.set({ [LOGS_KEY]: logs });
      if (success) {
        await chrome.storage.local.set({ [SIGNED_KEY]: new Date().toDateString() });
      }
    } catch (e) { log(`寫入日誌失敗: ${e.message}`); }
  }

  async function isLoggedIn() {
    try {
      const cookies = await chrome.cookies.getAll({ url: 'https://apk.tw/' });
      return cookies.some(c => c.name.includes('auth') || c.name.includes('saltkey') || c.name.includes('sid') || c.name.includes('uid'));
    } catch { return false; }
  }

  function getFormhash() {
    const el = document.querySelector('input[name="formhash"]');
    if (el && el.value) return el.value;
    const m = document.documentElement.innerHTML.match(/formhash=([a-f0-9]+)/i);
    return m ? m[1] : '';
  }

  function getSignInLink() {
    return document.getElementById('my_amupper') || document.querySelector('a[href*="dsu_amupper"]');
  }

  class AutoSigner {
    constructor() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.schedule());
      } else {
        this.schedule();
      }
    }

    schedule() {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => this.trySign(), { timeout: DELAY });
      } else {
        setTimeout(() => this.trySign(), DELAY);
      }
    }

    async trySign() {
      try {
        log('開始自動簽到');

        if (await isTodaySigned()) {
          log('今日已簽到，跳過');
          return;
        }

        if (!await isLoggedIn()) {
          log('未登入，跳過簽到');
          return;
        }

        const flag = await chrome.storage.local.get('apk_tw_signing_in');
        if (flag.apk_tw_signing_in) {
          log('背景正在簽到中，跳過');
          return;
        }

        if (window.location.href.includes('plugin.php') && window.location.href.includes('dsu_amupper')) {
          log('已在簽到頁面，跳過');
          return;
        }

        const link = getSignInLink();
        const formhash = getFormhash();
        const baseUrl = link && link.href ? link.href : ENDPOINT;

        const urls = [
          baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'infloat=1&ajax=1' + (formhash ? '&formhash=' + formhash : ''),
          baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'ajax=1' + (formhash ? '&formhash=' + formhash : '') + '&ppersubmit=1'
        ];

        for (const url of urls) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              log(`嘗試URL: ${window.location.origin}${url.replace(formhash, '***')}`);
              const res = await fetch(window.location.origin + url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                  'Accept': 'application/json, text/plain, */*',
                  'X-Requested-With': 'XMLHttpRequest'
                }
              });
              const text = await res.text();
              if (text.includes('簽到成功') || text.includes('success') || text.includes('succ')) {
                log('簽到成功');
                await addLog('內容腳本自動簽到成功', true);
                this.notify('APK.TW 簽到成功');
                return;
              }
              if (text.includes('已簽') || text.includes('already') || text.includes('重新')) {
                log('今日已簽到');
                await chrome.storage.local.set({ [SIGNED_KEY]: new Date().toDateString() });
                return;
              }
              if (text.length > 0 && !text.startsWith('<!')) {
                log('非HTML回應，視為成功');
                await addLog('內容腳本簽到成功', true);
                return;
              }
              break;
            } catch (e) {
              if (attempt === 1) throw e;
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }

        if (link) {
          log('點擊簽到按鈕');
          link.click();
          await new Promise(r => setTimeout(r, 4000));
          if (await isTodaySigned()) {
            log('按鈕簽到成功');
            await addLog('內容腳本按鈕簽到成功', true);
            this.notify('APK.TW 簽到成功');
            return;
          }
        }

        if (await isTodaySigned()) {
          log('延遲檢查簽到成功');
          await addLog('內容腳本延遲簽到成功', true);
          return;
        }

        log('所有簽到方式皆失敗');
        await addLog('內容腳本簽到失敗: 所有方式皆失敗', false);
      } catch (e) {
        log(`簽到異常: ${e.message}`);
        await addLog(`內容腳本簽到異常: ${e.message}`, false);
      }
    }

    notify(msg) {
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText =
        'position:fixed;top:60px;right:16px;background:#4CAF50;color:#fff;' +
        'padding:10px 18px;border-radius:8px;font-size:14px;z-index:99999;' +
        'box-shadow:0 4px 12px rgba(0,0,0,.2);animation:fadeInOut 4s ease';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  }

  const s = document.createElement('style');
  s.textContent =
    '@keyframes fadeInOut{0%{opacity:0;transform:translateY(-10px)}15%{opacity:1;transform:translateY(0)}85%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-10px)}}';
  document.head.appendChild(s);

  new AutoSigner();
})();