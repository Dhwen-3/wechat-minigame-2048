'use strict';

/**
 * 本地存储封装：最高分、进度存档、静音开关。
 * 微信的同步存储接口在部分环境可能抛错，这里统一 try/catch 兜底。
 */

var KEY_BEST = 'mg2048_best';
var KEY_SAVE = 'mg2048_save';
var KEY_MUTE = 'mg2048_mute';

function read(key) {
  try {
    return wx.getStorageSync(key);
  } catch (e) {
    return null;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {}
}

module.exports = {
  getBest: function () {
    var v = read(KEY_BEST);
    return typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0;
  },
  setBest: function (value) { write(KEY_BEST, Math.floor(value)); },

  getSave: function () {
    var v = read(KEY_SAVE);
    return v && typeof v === 'object' ? v : null;
  },
  setSave: function (data) { write(KEY_SAVE, data); },
  clearSave: function () {
    try { wx.removeStorageSync(KEY_SAVE); } catch (e) {}
  },

  getMute: function () { return read(KEY_MUTE) === true; },
  setMute: function (value) { write(KEY_MUTE, !!value); }
};
