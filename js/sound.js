'use strict';

/**
 * 极简合成音效：用 WebAudio 振荡器现场合成，不占用包体积。
 * 环境不支持时静默降级为无声。
 */

var ctx = null;
var enabled = true;

function ensureCtx() {
  if (ctx || !enabled) return ctx;
  try {
    if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
      ctx = wx.createWebAudioContext();
    }
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

function tone(freq, dur, delay, type, gainValue) {
  var ac = ensureCtx();
  if (!ac) return;
  try {
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    var t0 = ac.currentTime + (delay || 0);
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainValue || 0.1, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch (e) {}
}

module.exports = {
  // 首次触摸时调用，解锁音频（部分平台要求用户手势后才能出声）
  unlock: function () {
    ensureCtx();
    if (ctx && typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch (e) {}
    }
  },
  move: function () {
    tone(220, 0.06, 0, 'triangle', 0.05);
  },
  merge: function (count) {
    var base = 300 + Math.min(count || 1, 8) * 35;
    tone(base, 0.09, 0, 'triangle', 0.1);
    tone(base * 1.5, 0.12, 0.05, 'sine', 0.08);
  },
  win: function () {
    [523, 659, 784, 1047].forEach(function (freq, i) {
      tone(freq, 0.2, i * 0.13, 'sine', 0.12);
    });
  },
  over: function () {
    tone(220, 0.22, 0, 'sine', 0.1);
    tone(165, 0.32, 0.18, 'sine', 0.1);
  },
  setEnabled: function (value) {
    enabled = !!value;
    if (enabled) ensureCtx();
  },
  isEnabled: function () { return enabled; }
};
