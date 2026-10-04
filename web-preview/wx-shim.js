(function () {
  'use strict';

  /**
   * 网页预览用的 wx 适配层：把本游戏用到的 wx API 映射到浏览器。
   * 仅用于本地试玩与调试，不参与小游戏包上传。
   */

  var canvas = null;
  var listeners = { touchstart: [], touchmove: [], touchend: [] };

  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = document.getElementById('screen');
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    return canvas;
  }

  function touchLike(e) {
    var p = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
    var point = { clientX: p.clientX, clientY: p.clientY };
    return {
      touches: [point],
      changedTouches: [point],
      timeStamp: e.timeStamp || Date.now()
    };
  }

  function fire(type, e) {
    var list = listeners[type];
    var evt = touchLike(e);
    for (var i = 0; i < list.length; i++) list[i](evt);
  }

  window.wx = {
    createCanvas: function () { return ensureCanvas(); },

    getWindowInfo: function () {
      var dpr = window.devicePixelRatio || 1;
      var w = window.innerWidth;
      var h = window.innerHeight;
      return {
        screenWidth: w,
        screenHeight: h,
        pixelRatio: dpr,
        statusBarHeight: 0,
        safeArea: { top: 0, bottom: h, left: 0, right: w, width: w, height: h }
      };
    },
    getSystemInfoSync: function () { return window.wx.getWindowInfo(); },

    onTouchStart: function (cb) { listeners.touchstart.push(cb); },
    onTouchMove: function (cb) { listeners.touchmove.push(cb); },
    onTouchEnd: function (cb) { listeners.touchend.push(cb); },

    vibrateShort: function () {},

    getStorageSync: function (key) {
      try {
        var raw = localStorage.getItem(String(key));
        return raw === null ? '' : JSON.parse(raw);
      } catch (e) { return ''; }
    },
    setStorageSync: function (key, value) {
      try { localStorage.setItem(String(key), JSON.stringify(value)); } catch (e) {}
    },
    removeStorageSync: function (key) {
      try { localStorage.removeItem(String(key)); } catch (e) {}
    },

    showShareMenu: function () {},
    onShareAppMessage: function () {},
    shareAppMessage: function (option) {
      console.log('[分享]', option && option.title);
    },

    // 模拟激励视频广告：弹出一个可交互的假广告层，
    // 「完整观看」返回 isEnded=true（发奖励），「中途关闭」返回 isEnded=false
    createRewardedVideoAd: function (option) {
      console.log('[广告] 创建激励视频广告位:', option && option.adUnitId);
      var closeCbs = [];
      var overlay = null;

      function closeWith(isEnded) {
        if (overlay) {
          overlay.remove();
          overlay = null;
        }
        closeCbs.slice().forEach(function (cb) { cb({ isEnded: isEnded }); });
      }

      function buildOverlay() {
        var box = document.createElement('div');
        box.style.cssText =
          'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(20,18,16,0.94);z-index:999;' +
          'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
          'color:#fff;font-family:sans-serif;';
        var label = document.createElement('div');
        label.textContent = '【模拟】激励视频广告播放中…';
        label.style.fontSize = '17px';
        var btnEnd = document.createElement('button');
        btnEnd.textContent = '完整观看（发奖励）';
        btnEnd.style.cssText = 'padding:12px 26px;font-size:15px;cursor:pointer;border:0;border-radius:8px;';
        btnEnd.onclick = function () { closeWith(true); };
        var btnSkip = document.createElement('button');
        btnSkip.textContent = '中途关闭（无奖励）';
        btnSkip.style.cssText = 'padding:12px 26px;font-size:15px;cursor:pointer;border:0;border-radius:8px;background:#666;color:#fff;';
        btnSkip.onclick = function () { closeWith(false); };
        box.appendChild(label);
        box.appendChild(btnEnd);
        box.appendChild(btnSkip);
        document.body.appendChild(box);
        return box;
      }

      return {
        load: function () { return Promise.resolve(); },
        show: function () {
          overlay = buildOverlay();
          return Promise.resolve();
        },
        onClose: function (cb) { closeCbs.push(cb); },
        offClose: function (cb) { closeCbs = closeCbs.filter(function (x) { return x !== cb; }); },
        onError: function (cb) {},
        offError: function () {},
        onLoad: function () {},
        offLoad: function () {},
        destroy: function () {
          if (overlay) {
            overlay.remove();
            overlay = null;
          }
        }
      };
    },

    createWebAudioContext: function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      return AC ? new AC() : null;
    },

    onError: function () {}
  };

  function bindEvents() {
    var el = ensureCanvas();

    // 手机/平板浏览器：真实触摸事件
    el.addEventListener('touchstart', function (e) { e.preventDefault(); fire('touchstart', e); }, { passive: false });
    el.addEventListener('touchmove', function (e) { e.preventDefault(); fire('touchmove', e); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); fire('touchend', e); }, { passive: false });

    // 桌面浏览器：鼠标模拟触摸，方便试玩与自动化测试
    var down = false;
    el.addEventListener('mousedown', function (e) { down = true; fire('touchstart', e); });
    el.addEventListener('mousemove', function (e) { if (down) fire('touchmove', e); });
    window.addEventListener('mouseup', function (e) { if (down) { down = false; fire('touchend', e); } });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }
})();
