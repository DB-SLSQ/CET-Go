/* ============================================================
   只在测试页里被注入：扮演 Android 外壳塞进来的 window.CetGoNative
   ------------------------------------------------------------
   不打包进 APK（build-apk.sh 只拷 index.html / css / js / assets / data，
   这个文件在 public 根目录，不在拷贝清单里）。

   顺手把 fetch 包一层，记录页面有没有偷偷去请求 /api/*
   —— 在 App 里那些接口根本不存在，一旦有人回退成 fetch 就会静默丢数据。
   ============================================================ */
(function () {
  var KEY = 'cetgo-mock-state';

  var log = { reads: 0, writes: [], api: [], backup: null, quit: false };
  window.__mockLog = log;
  window.__mockReset = function () { log.reads = 0; log.writes = []; log.api = []; log.backup = null; log.quit = false; };
  window.__mockClear = function () { try { localStorage.removeItem(KEY); } catch (e) {} };

  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (origFetch) {
    window.fetch = function (u, o) {
      var s = String(u);
      if (s.indexOf('/api/') === 0 || s.indexOf('http') === 0 && s.indexOf('/api/') > 0) log.api.push(s);
      return origFetch(u, o);
    };
  }

  window.CetGoNative = {
    loadState: function () {
      log.reads++;
      try { return localStorage.getItem(KEY); } catch (e) { return null; }
    },
    saveState: function (json) {
      log.writes.push(json);
      try { localStorage.setItem(KEY, json); } catch (e) {}
    },
    backup: function (json) {
      log.backup = json;
      return '下载/CET Go 备份（测试）.json';
    },
    quit: function () { log.quit = true; }
  };
})();
