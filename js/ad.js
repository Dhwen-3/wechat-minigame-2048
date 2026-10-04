'use strict';

/**
 * 激励视频广告封装（wx.createRewardedVideoAd）。
 *
 * 接入步骤：
 * 1. 在微信公众平台开通「流量主」（小游戏累计独立访客达到平台要求后可开通）；
 * 2. 「流量主 → 广告位管理 → 新建广告位」选择「激励视频广告」，复制广告位 ID；
 * 3. 把 ID 填到下方 AD_UNIT_ID。配置后，游戏结束弹窗会自动出现「看广告复活」按钮。
 *
 * 说明：
 * - 开发者工具通常拉不到真实广告（提示无填充属正常），请在真机上验证；
 * - 广告拉取失败会通过 onFail 返回原因，游戏侧以 toast 提示；
 * - 只有完整观看（onClose 回调 isEnded 为 true 或 undefined）才发放奖励。
 */

// TODO(上线前): 在微信公众平台创建激励视频广告位后，把 ID 填到这里
var AD_UNIT_ID = '';

var rewardedAd = null; // 广告实例（官方要求单例复用）
var showing = false;

function errMsg(err) {
  return (err && (err.errMsg || err.message)) || '';
}

function ensureAd() {
  if (!AD_UNIT_ID) return null;
  if (rewardedAd) return rewardedAd;
  if (typeof wx === 'undefined' || typeof wx.createRewardedVideoAd !== 'function') return null;
  try {
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
    rewardedAd.onError(function (err) {
      // 常见错误码：1004 无合适广告（开发者工具常见）、2001 流量主未开通等
      console.warn('[广告] 加载失败:', errMsg(err));
    });
  } catch (e) {
    rewardedAd = null;
  }
  return rewardedAd;
}

/**
 * 展示激励视频广告。
 * @param {Function} onRewarded 完整观看后发放奖励（只回调一次）
 * @param {Function} onFail(reason) 中途关闭 / 拉取失败 / 环境不可用
 */
function show(onRewarded, onFail) {
  if (showing) return;
  var ad = ensureAd();

  if (!ad) {
    if (onFail) onFail('广告不可用，请稍后再试');
    return;
  }

  showing = true;

  var onCloseCb = function (res) {
    showing = false;
    try { ad.offClose(onCloseCb); } catch (e) {}
    // 官方建议：isEnded 为 true（或 undefined）视为完整观看，发放奖励
    if (res && (res.isEnded === true || res.isEnded === undefined)) {
      if (onRewarded) onRewarded();
    } else if (onFail) {
      onFail('看完整个视频才能获得复活奖励');
    }
  };

  try {
    ad.onClose(onCloseCb);
  } catch (e) {
    showing = false;
    if (onFail) onFail('广告初始化失败');
    return;
  }

  var failOut = function (err) {
    showing = false;
    try { ad.offClose(onCloseCb); } catch (e2) {}
    if (onFail) onFail(errMsg(err) || '暂时没有合适的广告，请稍后再试');
  };

  try {
    var pending = ad.show();
    if (pending && typeof pending.catch === 'function') {
      pending.catch(function () {
        // 首次展示失败：重新拉取后再试一次（官方推荐做法）
        try {
          var retried = ad.load().then(function () { return ad.show(); });
          if (retried && typeof retried.catch === 'function') retried.catch(failOut);
        } catch (e) {
          failOut(e);
        }
      });
    }
  } catch (e) {
    failOut(e);
  }
}

module.exports = {
  show: show,
  // 广告位是否已配置（未配置时游戏侧隐藏广告按钮）
  isConfigured: function () { return !!AD_UNIT_ID; },
  // 启动时预创建广告实例，加快首次展示
  preload: function () { ensureAd(); },
  // 仅供网页预览/自动化测试注入模拟广告位 ID
  _debugSetAdUnitId: function (id) { AD_UNIT_ID = id || ''; }
};
