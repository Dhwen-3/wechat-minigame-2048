'use strict';

/**
 * 游戏入口与主循环：装配画布、触摸输入、滑动/弹出动画、存档与分享。
 * 由 game.js（小游戏环境）或网页预览加载器加载执行。
 */

var Game = require('./core.js').Game;
var Renderer = require('./render.js');
var storage = require('./storage.js');
var sound = require('./sound.js');
var ad = require('./ad.js');

var GAME_TITLE = '2048';
var SLIDE_MS = 100; // 滑动动画时长
var POP_MS = 140;   // 合并/新块弹出时长
var REVIVE_CLEAR = 4;  // 复活奖励：清除最小方块的个数（与结束弹窗文案保持一致）
var PHOTO_AD_MS = 3000; // 照片广告展示时长

function getSystemInfo() {
  try {
    if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo();
  } catch (e) {}
  return wx.getSystemInfoSync();
}

function boot() {
  // 第一次 createCanvas 返回的是屏幕画布
  var canvas = wx.createCanvas();

  var info = getSystemInfo();
  var dpr = Math.min(Math.max(info.pixelRatio || 1, 1), 3);
  canvas.width = Math.round(info.screenWidth * dpr);
  canvas.height = Math.round(info.screenHeight * dpr);

  var view = {
    width: info.screenWidth,
    height: info.screenHeight,
    dpr: dpr,
    safeTop: 0,
    safeBottom: 0
  };
  if (info.safeArea) {
    view.safeTop = Math.max(0, info.safeArea.top || 0);
    view.safeBottom = Math.max(0, view.height - (info.safeArea.bottom || view.height));
  } else if (info.statusBarHeight) {
    view.safeTop = info.statusBarHeight;
  }

  var renderer = new Renderer(canvas, view);
  var raf = typeof canvas.requestAnimationFrame === 'function'
    ? canvas.requestAnimationFrame.bind(canvas)
    : (typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame.bind(typeof window === 'undefined' ? globalThis : window)
      : function (cb) { setTimeout(function () { cb(Date.now()); }, 16); });

  var game = loadGame() || new Game(4);
  var best = storage.getBest();
  if (game.score > best) best = game.score;
  game.best = best;

  var muted = storage.getMute();
  sound.setEnabled(!muted);
  renderer.muted = muted;

  // 已配置真实广告位时预创建实例；同时预加载照片广告素材
  ad.preload();

  var anim = { phase: 'idle', start: 0 };
  var pendingDir = null; // 动画期间的输入缓冲
  var floats = [];       // 得分飘字
  var toast = null;      // 底部提示 {text, t0}
  var photoAd = null;    // 照片广告播放状态 {start, img}
  var winSoundPlayed = false;
  var overSoundPlayed = false;
  var curTime = 0;
  var touchStart = null;

  function showToast(text) {
    toast = { text: text, t0: curTime };
  }

  function loadGame() {
    var data = storage.getSave();
    if (!data) return null;
    try {
      var restored = Game.restore(data);
      return restored && !restored.over ? restored : null;
    } catch (e) {
      return null;
    }
  }

  function saveGame() {
    storage.setSave(game.serialize());
  }

  function restart() {
    game = new Game(4);
    game.best = best;
    anim = { phase: 'idle', start: curTime };
    pendingDir = null;
    floats = [];
    winSoundPlayed = false;
    overSoundPlayed = false;
    storage.clearSave();
  }

  // 看广告复活：优先真实激励视频；未配置广告位时播照片广告
  // 照片素材尚未加载完也允许点：先显示「加载中」，就绪后自动开始倒计时
  function watchReviveAd() {
    if (ad.isConfigured()) {
      ad.show(grantReviveReward, function (reason) {
        showToast(reason || '广告未能完成，暂无奖励');
      });
      return;
    }
    if (ad.getPhotoState() !== 'error') {
      photoAd = {
        mode: 'revive',
        start: ad.photoReady() ? curTime : -1,
        waitStart: curTime,
        img: ad.photoReady() ? ad.getPhoto() : null
      };
      return;
    }
    showToast('广告不可用，请稍后再试');
  }

  // 每次拖动弹一次照片广告（纯彩蛋，不走真实广告位，避免消耗广告次数）
  function triggerMoveAd() {
    if (ad.isConfigured()) return;
    if (ad.getPhotoState() === 'error') return;
    if (photoAd) return;
    photoAd = {
      mode: 'move',
      start: ad.photoReady() ? curTime : -1,
      waitStart: curTime,
      img: ad.photoReady() ? ad.getPhoto() : null
    };
  }

  // 关闭广告：移动模式直接跳过；复活模式视为中途关闭，不发奖励
  function closePhotoAd() {
    if (!photoAd) return;
    var mode = photoAd.mode;
    var started = !!photoAd.img; // 已进入倒计时
    photoAd = null;
    if (mode === 'revive') {
      showToast(started ? '看完整个广告才能复活哦' : '广告已关闭');
    }
  }

  // 是否具备展示「看广告复活」按钮的条件（素材还在加载中也算，见 watchReviveAd）
  function adButtonAvailable() {
    return ad.isConfigured() || ad.getPhotoState() !== 'error';
  }

  // 发放复活奖励：清除最小的几个方块，继续本局
  function grantReviveReward() {
    var removed = game.revive(REVIVE_CLEAR);
    saveGame();
    sound.merge(removed.length);
    vibrate('light');
    showToast('复活成功！已清除 ' + removed.length + ' 个方块');
  }

  function vibrate(type) {
    try { wx.vibrateShort({ type: type }); } catch (e) {}
  }

  function attemptMove(dir) {
    if (anim.phase !== 'idle') { pendingDir = dir; return; }
    if (game.terminated()) return;

    var result = game.move(dir);
    if (!result.moved) return;

    if (result.merged.length) {
      sound.merge(result.merged.length);
      vibrate('light');
      for (var i = 0; i < result.merged.length; i++) {
        floats.push({
          value: result.merged[i].value,
          t0: curTime,
          x: renderer.layout.chip1X + renderer.layout.chipW / 2 + (i - (result.merged.length - 1) / 2) * 14,
          y: renderer.layout.chipY + 6
        });
      }
      if (floats.length > 20) floats = floats.slice(floats.length - 20);
    } else {
      sound.move();
    }

    if (game.score > best) {
      best = game.score;
      game.best = best;
      storage.setBest(best);
    }
    saveGame();
    anim = { phase: 'slide', start: curTime };
    triggerMoveAd(); // 彩蛋：每拖动一步弹一次照片广告
  }

  function hit(rect, x, y) {
    return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function handleTap(x, y) {
    var L = renderer.layout;
    if (hit(L.btnNew, x, y)) { restart(); return; }
    if (hit(L.btnMute, x, y)) {
      muted = !muted;
      storage.setMute(muted);
      sound.setEnabled(!muted);
      renderer.muted = muted;
      return;
    }
    if (hit(L.btnShare, x, y)) {
      try {
        wx.shareAppMessage({ title: '我在「' + GAME_TITLE + '」拿到了 ' + best + ' 分，快来挑战我！' });
      } catch (e) {}
      return;
    }
    if (game.over) {
      if (adButtonAvailable()) {
        if (hit(L.btnRevive, x, y)) { watchReviveAd(); return; }
        if (hit(L.btnAgainOver, x, y)) restart();
      } else if (hit(L.btnAgain, x, y)) {
        restart();
      }
      return;
    }
    if (game.won && !game.keepPlaying) {
      if (hit(L.btnKeep, x, y)) {
        game.keepPlaying = true;
        saveGame();
      } else if (hit(L.btnAgainWin, x, y)) {
        restart();
      }
    }
  }

  wx.onTouchStart(function (e) {
    sound.unlock();
    if (e && e.changedTouches && e.changedTouches[0]) {
      touchStart = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
  });

  wx.onTouchEnd(function (e) {
    if (photoAd) {
      // 广告播放中仅响应右上角关闭按钮
      if (e && e.changedTouches && e.changedTouches[0]) {
        var L = renderer.layout;
        var cx = e.changedTouches[0].clientX;
        var cy = e.changedTouches[0].clientY;
        if (hit(L.btnAdClose, cx, cy)) closePhotoAd();
      }
      return;
    }
    if (!touchStart || !e || !e.changedTouches || !e.changedTouches[0]) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    var x = e.changedTouches[0].clientX;
    var y = e.changedTouches[0].clientY;
    touchStart = null;

    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    if (Math.max(adx, ady) < 24) {
      handleTap(x, y);
      return;
    }
    if (game.terminated()) return;
    attemptMove(adx > ady ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });

  // 被动分享（右上角菜单转发）
  try {
    wx.showShareMenu({ withShareTicket: false });
    wx.onShareAppMessage(function () {
      return { title: '「' + GAME_TITLE + '」最高 ' + best + ' 分，敢来挑战吗？' };
    });
  } catch (e) {}

  function update(now) {
    curTime = now;
    if (photoAd) {
      if (!photoAd.img) {
        // 等待照片素材就绪；超过 8 秒仍未就绪则跳过本次广告
        if (ad.photoReady()) {
          photoAd.img = ad.getPhoto();
          photoAd.start = now;
        } else if (now - photoAd.waitStart >= 8000) {
          var timedOutRevive = photoAd.mode === 'revive';
          photoAd = null;
          if (timedOutRevive) showToast('广告加载失败，请稍后再试');
        }
      } else if (now - photoAd.start >= PHOTO_AD_MS) {
        var mode = photoAd.mode;
        photoAd = null;
        if (mode === 'revive') grantReviveReward();
      }
    }
    if (anim.phase === 'slide' && now - anim.start >= SLIDE_MS) {
      anim = { phase: 'pop', start: now };
    } else if (anim.phase === 'pop' && now - anim.start >= POP_MS) {
      anim = { phase: 'idle', start: now };
      if (game.won && !game.keepPlaying && !winSoundPlayed) {
        winSoundPlayed = true;
        sound.win();
      }
      if (game.over && !overSoundPlayed) {
        overSoundPlayed = true;
        sound.over();
      }
      if (pendingDir !== null && !game.terminated()) {
        var dir = pendingDir;
        pendingDir = null;
        attemptMove(dir);
      } else {
        pendingDir = null;
      }
    }
    if (floats.length) {
      floats = floats.filter(function (f) { return now - f.t0 < 700; });
    }
    if (toast && now - toast.t0 > 2400) {
      toast = null;
    }
  }

  function draw(now) {
    renderer.draw(game, {
      phase: anim.phase,
      start: anim.start,
      slideMs: SLIDE_MS,
      popMs: POP_MS,
      showWin: game.won && !game.keepPlaying,
      adAvailable: adButtonAvailable(),
      toast: toast,
      photoAd: photoAd ? { start: photoAd.start, ms: PHOTO_AD_MS, img: photoAd.img, mode: photoAd.mode } : null,
      floats: floats
    }, now);
  }

  function frame(now) {
    update(now);
    draw(now);
    raf(frame);
  }
  raf(frame);

  // 调试句柄：网页预览/自动化测试用，小游戏内无副作用
  if (typeof globalThis !== 'undefined') {
    globalThis.__minigame2048 = {
      getGame: function () { return game; },
      restart: restart,
      attemptMove: attemptMove,
      getLayout: function () { return renderer.layout; },
      ad: {
        // 网页预览里注入模拟广告位 ID，验证完整广告流程
        setAdUnitId: ad._debugSetAdUnitId,
        isConfigured: ad.isConfigured,
        photoReady: ad.photoReady,
        getPhoto: ad.getPhoto,
        getPhotoState: ad.getPhotoState
      }
    };
  }
}

boot();
