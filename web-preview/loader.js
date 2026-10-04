(function () {
  'use strict';

  /**
   * 极简 CommonJS 加载器：按依赖顺序拉取游戏模块并在浏览器中执行，
   * 让小游戏代码无需任何改动即可在网页里运行。
   */

  var MODULES = ['js/core.js', 'js/storage.js', 'js/sound.js', 'js/ad.js', 'js/render.js', 'js/main.js', 'game.js'];
  var registry = {};

  function normalize(base, p) {
    var joined = p.charAt(0) === '.' ? base + '/' + p : p;
    var out = [];
    var segs = joined.split('/');
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s === '' || s === '.') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return out.join('/');
  }

  function makeRequire(base) {
    return function (p) {
      var path = normalize(base, p);
      if (!registry[path]) throw new Error('模块尚未加载: ' + path);
      return registry[path].exports;
    };
  }

  function run(path, code) {
    var parts = path.split('/');
    var dir = parts.slice(0, -1).join('/');
    var module = { exports: {} };
    registry[path] = module;
    var fn = new Function('module', 'exports', 'require', code + '\n//# sourceURL=' + path);
    fn(module, module.exports, makeRequire(dir));
  }

  function boot() {
    // 页面位于 /web-preview/ 子目录，而游戏模块在项目根目录
    var BASE = location.pathname.replace(/[^/]*$/, '') === '/' ? '' : '../';
    var chain = Promise.resolve();
    MODULES.forEach(function (path) {
      chain = chain.then(function () {
        return fetch(BASE + path + '?v=' + Date.now()).then(function (res) {
          if (!res.ok) throw new Error('加载失败 ' + path + ' HTTP ' + res.status);
          return res.text();
        }).then(function (code) {
          run(path, code);
        });
      });
    });
    chain.then(function () {
      console.log('[2048] 网页预览加载完成');
    }).catch(function (err) {
      console.error(err);
      var box = document.createElement('pre');
      box.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:90%;background:#fff;color:#c00;padding:8px;font-size:12px;z-index:99;';
      box.textContent = '预览加载失败: ' + (err && err.message ? err.message : err);
      document.body.appendChild(box);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
