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

        const primaryBtn = document.getElementById('my_amupper');
        const formhash = getFormhash();
        const hasFh = !!(document.querySelector('input[name="formhash"]')?.value || (formhash && formhash.length > 0));

        const rawText = document.body?.innerText || document.body?.textContent || '';
        log(`formhash: ${formhash || '無'}`);
        log(`簽到按鈕: ${primaryBtn ? '找到 (#' + primaryBtn.id + ')' : '找不到 #my_amupper'}`);
        log(`頁面文字片段: ${rawText.slice(0, 100).replace(/\s+/g, ' ')}...`);

        if (!primaryBtn && hasFh) {
          log('找不到 #my_amupper 但 formhash 存在，無法確認是否已簽到，改用更廣的按鈕搜尋');
          const broadBtn = document.querySelector('a[href*="dsu_amupper"]') || document.querySelector('a.amupper') ||
            document.querySelector('[onclick*="amupper"]') || document.querySelector('a[href*="amupper"]');
          if (broadBtn) {
            log('找到替代簽到按鈕，點擊');
            broadBtn.click();
          } else {
            log('完全找不到簽到按鈕，交由 fetch 遞補判斷');
          }
          return;
        }

        const link = primaryBtn;

        const getBaseUrl = () => {
          if (!link || !link.href) return ENDPOINT;
          const h = link.href;
          if (h === 'javascript:;' || h === '#' || h === '' || h.startsWith('javascript:')) return ENDPOINT;
          return h;
        };
        const baseUrl = getBaseUrl();

        const makeUrl = (base, param) => base + (base.includes('?') ? '&' : '?') + param + (formhash ? '&formhash=' + formhash : '');
        const urls = [
          makeUrl(baseUrl, 'infloat=1&ajax=1'),
          makeUrl(baseUrl, 'ajax=1&ppersubmit=1')
        ];

        const tryFetch = async (fullUrl) => {
          const res = await fetch(fullUrl, { method: 'GET' });
          return await res.text();
        };

        const tryXhr = async (fullUrl) => {
          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 15000;
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => reject(new Error('XHR 網路錯誤'));
            xhr.ontimeout = () => reject(new Error('XHR 逾時'));
            xhr.open('GET', fullUrl, true);
            xhr.send();
          });
        };

        for (const url of urls) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const fullUrl = url.startsWith('http') ? url : window.location.origin + url;
              log(`嘗試URL: ${fullUrl.replace(formhash, '***')}`);
              let text;
              try {
                text = await tryFetch(fullUrl);
                log(`fetch 成功`);
              } catch (fetchErr) {
                log(`fetch 失敗 (${fetchErr.message})，嘗試 XHR`);
                text = await tryXhr(fullUrl);
                log(`XHR 成功`);
              }
              const preview = text.slice(0, 60).replace(/\s+/g, ' ');
              log(`回應前 ${text.length} 字元: ${preview}...`);
              if (text.includes('簽到成功') || text.includes('success') || text.includes('succ')) {
                log('簽到成功');
                await addLog('內容腳本自動簽到成功', true);
                this.notify('APK.TW 簽到成功');
                return;
              }
              if (text.includes('已簽') || text.includes('already') || text.includes('重複簽到')) {
                log('今日已簽到');
                await chrome.storage.local.set({ [SIGNED_KEY]: new Date().toDateString() });
                return;
              }
              const errorWords = ['失敗', '錯誤', '無效', '請先登入', '請重新登入', '登錄', 'denied', 'expired', '非法'];
              if (errorWords.some(w => text.includes(w))) {
                log(`回應為錯誤: ${text.slice(0, 60)}`);
                return;
              }
              log(`回應無法判定: ${text.slice(0, 60)}`);
              break;
            } catch (e) {
              log(`請求嘗試${attempt + 1}失敗: ${e.message}`);
              if (attempt === 1) {
                await addLog(`內容腳本請求失敗: ${e.message} | url: ${url}`, false);
                return;
              }
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }

        if (link) {
          log('點擊簽到按鈕');
          link.click();
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const bt = document.body?.innerText || document.body?.textContent || '';
            if (await isTodaySigned() || bt.includes('簽到成功') || bt.includes('succ')) {
              log('按鈕簽到成功');
              await addLog('內容腳本按鈕簽到成功', true);
              this.notify('APK.TW 簽到成功');
              return;
            }
          }
          log('點擊按鈕後未檢測到簽到');
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