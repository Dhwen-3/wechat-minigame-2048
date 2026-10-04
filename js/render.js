'use strict';

/**
 * 渲染层：所有界面均用 Canvas 2D 现场绘制，不含任何图片资源，
 * 保证主包体积极小且不存在素材版权问题。
 */

var TILE_PALETTE = {
  2:    { bg: '#eee4da', fg: '#776e65' },
  4:    { bg: '#ede0c8', fg: '#776e65' },
  8:    { bg: '#f2b179', fg: '#f9f6f2' },
  16:   { bg: '#f59563', fg: '#f9f6f2' },
  32:   { bg: '#f67c5f', fg: '#f9f6f2' },
  64:   { bg: '#f65e3b', fg: '#f9f6f2' },
  128:  { bg: '#edcf72', fg: '#f9f6f2' },
  256:  { bg: '#edcc61', fg: '#f9f6f2' },
  512:  { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' }
};
var TILE_BG_EXTRA = '#3c3a32'; // 4096 及以上

var BG_COLOR = '#faf8ef';
var BOARD_BG = '#bbada0';
var CELL_BG = 'rgba(238, 228, 218, 0.35)';
var TEXT_MAIN = '#776e65';
var TEXT_SUB = '#a89b8c';
var BUTTON_BG = '#8f7a66';
var BUTTON_FG = '#f9f6f2';
var REVIVE_BG = '#edc22e'; // 广告复活按钮：金色突出
var REVIVE_FG = '#7a5c10';

var FLOAT_MS = 700;     // 得分飘字生命周期
var TOAST_MS = 2400;    // toast 提示生命周期

function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) {
  t = clamp01(t);
  var c1 = 1.70158;
  var c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function Renderer(canvas, view) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.view = view;
  this.dpr = view.dpr || 1;
  this.muted = false;
  this.computeLayout();
}

Renderer.prototype.computeLayout = function () {
  var w = this.view.width;
  var h = this.view.height;
  var uw = Math.min(w, 480); // 头部/按钮按手机宽度设计，宽屏时限制缩放

  var top = this.view.safeTop + 12;
  var margin = Math.max(14, Math.round(uw * 0.045));

  var titleFont = Math.round(uw * 0.12);
  var chipW = Math.round(uw * 0.205);
  var chipH = Math.round(uw * 0.14);
  var chipGap = 10;
  var chipY = top;
  var chip1X = w - margin - chipW * 2 - chipGap;
  var chip2X = w - margin - chipW;

  var subFont = Math.max(12, Math.round(uw * 0.034));
  var btnH = Math.max(32, Math.round(uw * 0.095));
  var btnNewW = Math.round(uw * 0.26);
  var row2Y = chipY + chipH + 10;
  var btnNew = { x: w - margin - btnNewW, y: row2Y, w: btnNewW, h: btnH };

  var boardTop = row2Y + btnH + 14;
  var footerH = btnH + 26 + Math.round(subFont * 1.8);
  var availH = h - this.view.safeBottom - 10 - boardTop - footerH;
  var boardSize = Math.max(Math.min(w - margin * 2, availH), Math.min(w, h) * 0.45);
  var gap = Math.max(4, boardSize * 0.028);
  var cell = (boardSize - gap * 5) / 4;
  var board = { x: (w - boardSize) / 2, y: boardTop, size: boardSize, gap: gap, cell: cell };

  var boardBottom = boardTop + boardSize;
  var btnShareW = Math.round(uw * 0.32);
  var btnShare = { x: (w - btnShareW) / 2, y: boardBottom + 16, w: btnShareW, h: btnH };
  var btnMute = { x: margin, y: boardBottom + 16, w: btnH, h: btnH };
  var hintY = btnShare.y + btnH + subFont * 1.4;

  var panelW = Math.min(w - 56, 320);
  var panelH = Math.round(panelW * 0.72);
  var panel = { x: (w - panelW) / 2, y: (h - panelH) / 2 - 24, w: panelW, h: panelH };
  // 游戏结束面板（带「看广告复活」按钮时更高）
  var panelOverH = Math.round(panelW * 0.84);
  var panelOver = { x: panel.x, y: (h - panelOverH) / 2 - 24, w: panelW, h: panelOverH };
  var btnW2 = Math.round(panelW * 0.4);
  var btnH2 = 44;
  var btnAgain = { x: panel.x + panel.w / 2 - btnW2 / 2, y: panel.y + panel.h - btnH2 - 24, w: btnW2, h: btnH2 };
  var btnKeep = { x: panel.x + 22, y: btnAgain.y, w: btnW2, h: btnH2 };
  var btnAgainWin = { x: panel.x + panel.w - 22 - btnW2, y: btnAgain.y, w: btnW2, h: btnH2 };
  // 广告复活 + 再来一局（上下排列）
  var wideW = Math.round(panelW * 0.68);
  var btnRevive = { x: panel.x + panel.w / 2 - wideW / 2, y: panelOver.y + panelOver.h - btnH2 * 2 - 14 - 22, w: wideW, h: btnH2 };
  var btnAgainOver = { x: panel.x + panel.w / 2 - wideW / 2, y: btnRevive.y + btnH2 + 14, w: wideW, h: btnH2 };

  this.layout = {
    margin: margin,
    top: top,
    titleFont: titleFont,
    titleY: top + titleFont,
    chipW: chipW,
    chipH: chipH,
    chip1X: chip1X,
    chip2X: chip2X,
    chipY: chipY,
    subFont: subFont,
    btnH: btnH,
    board: board,
    btnNew: btnNew,
    btnShare: btnShare,
    btnMute: btnMute,
    hintY: hintY,
    panel: panel,
    panelOver: panelOver,
    btnAgain: btnAgain,
    btnKeep: btnKeep,
    btnAgainWin: btnAgainWin,
    btnRevive: btnRevive,
    btnAgainOver: btnAgainOver
  };
};

Renderer.prototype.roundRect = function (ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

Renderer.prototype.draw = function (game, st, now) {
  var ctx = this.ctx;
  var v = this.view;
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, v.width, v.height);

  this.drawHeader(game, st, now);
  this.drawBoard(game, st, now);
  this.drawFooter();

  var overlay = null;
  if (st.phase === 'idle') {
    if (game.over) overlay = 'over';
    else if (st.showWin) overlay = 'win';
  }
  if (overlay) this.drawOverlay(game, overlay === 'win', st);
  this.drawToast(st, now);
};

Renderer.prototype.drawHeader = function (game, st, now) {
  var ctx = this.ctx;
  var L = this.layout;

  ctx.fillStyle = TEXT_MAIN;
  ctx.font = 'bold ' + L.titleFont + 'px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('2048', L.margin, L.titleY);

  this.drawChip(L.chip1X, '得分', game.score);
  this.drawChip(L.chip2X, '最高分', game.best || 0);

  ctx.fillStyle = TEXT_SUB;
  ctx.font = L.subFont + 'px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('滑动合并，冲击 2048！', L.margin, L.btnNew.y + L.btnNew.h / 2 + L.subFont * 0.36);

  this.drawButton(L.btnNew, '新游戏', Math.round(L.btnNew.h * 0.44));

  // 得分飘字
  var floats = st.floats || [];
  for (var i = 0; i < floats.length; i++) {
    var f = floats[i];
    var p = clamp01((now - f.t0) / FLOAT_MS);
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = TEXT_MAIN;
    ctx.font = 'bold ' + Math.round(L.chipW * 0.26) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+' + f.value, f.x, f.y - p * 26);
    ctx.globalAlpha = 1;
  }
};

Renderer.prototype.drawChip = function (x, label, value) {
  var ctx = this.ctx;
  var L = this.layout;
  ctx.fillStyle = BOARD_BG;
  this.roundRect(ctx, x, L.chipY, L.chipW, L.chipH, 8);
  ctx.fill();
  ctx.fillStyle = '#eee4da';
  ctx.font = Math.round(L.chipW * 0.15) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + L.chipW / 2, L.chipY + L.chipH * 0.3);
  ctx.fillStyle = '#ffffff';
  var str = String(value);
  var size = str.length > 6 ? 0.2 : (str.length > 4 ? 0.24 : 0.28);
  ctx.font = 'bold ' + Math.round(L.chipW * size) + 'px sans-serif';
  ctx.fillText(str, x + L.chipW / 2, L.chipY + L.chipH * 0.66);
};

Renderer.prototype.cellX = function (col) {
  var B = this.layout.board;
  return B.x + B.gap + col * (B.cell + B.gap);
};

Renderer.prototype.cellY = function (row) {
  var B = this.layout.board;
  return B.y + B.gap + row * (B.cell + B.gap);
};

Renderer.prototype.drawBoard = function (game, st, now) {
  var ctx = this.ctx;
  var B = this.layout.board;
  var r, c;

  ctx.fillStyle = BOARD_BG;
  this.roundRect(ctx, B.x, B.y, B.size, B.size, B.gap * 1.6);
  ctx.fill();

  ctx.fillStyle = CELL_BG;
  for (r = 0; r < 4; r++) {
    for (c = 0; c < 4; c++) {
      this.roundRect(ctx, this.cellX(c), this.cellY(r), B.cell, B.cell, B.cell * 0.11);
      ctx.fill();
    }
  }

  var slideP = easeOutCubic((now - st.start) / st.slideMs);
  var popP = easeOutBack((now - st.start) / st.popMs);

  for (r = 0; r < 4; r++) {
    for (c = 0; c < 4; c++) {
      var tile = game.board.cellAt(r, c);
      if (!tile) continue;

      if (st.phase === 'slide') {
        if (tile.isNew) continue; // 新块等滑动结束后再弹出
        if (tile.justMerged) {
          // 合并动画：静止块留在原地，滑动块飞入
          var stay = tile.mergedFrom[1];
          var moving = tile.mergedFrom[0];
          this.drawTile(this.cellX(stay.col), this.cellY(stay.row), stay.value, 1);
          var x = this.cellX(moving.col) + (this.cellX(tile.col) - this.cellX(moving.col)) * slideP;
          var y = this.cellY(moving.row) + (this.cellY(tile.row) - this.cellY(moving.row)) * slideP;
          this.drawTile(x, y, moving.value, 1);
          continue;
        }
        var px = this.cellX(tile.prevCol) + (this.cellX(tile.col) - this.cellX(tile.prevCol)) * slideP;
        var py = this.cellY(tile.prevRow) + (this.cellY(tile.row) - this.cellY(tile.prevRow)) * slideP;
        this.drawTile(px, py, tile.value, 1);
      } else if (st.phase === 'pop') {
        var scale = (tile.justMerged || tile.isNew) ? Math.max(0.0001, popP) : 1;
        this.drawTile(this.cellX(c), this.cellY(r), tile.value, scale);
      } else {
        this.drawTile(this.cellX(c), this.cellY(r), tile.value, 1);
      }
    }
  }
};

Renderer.prototype.drawTile = function (x, y, value, scale) {
  var ctx = this.ctx;
  var B = this.layout.board;
  var s = B.cell * (scale || 1);
  if (s < 1) return;
  var cx = x + B.cell / 2;
  var cy = y + B.cell / 2;
  var conf = TILE_PALETTE[value] || { bg: TILE_BG_EXTRA, fg: '#f9f6f2' };

  ctx.fillStyle = conf.bg;
  this.roundRect(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.12);
  ctx.fill();

  var str = String(value);
  var ratio = str.length <= 2 ? 0.44 : (str.length === 3 ? 0.35 : (str.length === 4 ? 0.28 : 0.23));
  ctx.fillStyle = conf.fg;
  ctx.font = 'bold ' + Math.round(s * ratio) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, cx, cy + s * 0.03);
};

Renderer.prototype.drawFooter = function () {
  var ctx = this.ctx;
  var L = this.layout;
  this.drawButton(L.btnShare, '分享成绩', Math.round(L.btnShare.h * 0.4));
  this.drawMute(L.btnMute);
  ctx.fillStyle = TEXT_SUB;
  ctx.font = Math.max(11, Math.round(L.subFont * 0.95)) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('上下左右滑动开始游戏', this.view.width / 2, L.hintY);
};

Renderer.prototype.drawButton = function (rect, label, fontPx, opts) {
  opts = opts || {};
  var ctx = this.ctx;
  ctx.fillStyle = opts.bg || BUTTON_BG;
  this.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(10, rect.h / 2));
  ctx.fill();
  ctx.fillStyle = opts.fg || BUTTON_FG;
  ctx.font = 'bold ' + fontPx + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
};

Renderer.prototype.drawMute = function (rect) {
  var ctx = this.ctx;
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;
  var u = rect.w * 0.085;

  ctx.fillStyle = BUTTON_BG;
  ctx.beginPath();
  ctx.arc(cx, cy, rect.w / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = BUTTON_FG;
  ctx.beginPath();
  ctx.moveTo(cx - 3.2 * u, cy - 1.8 * u);
  ctx.lineTo(cx - 1.1 * u, cy - 1.8 * u);
  ctx.lineTo(cx + 0.9 * u, cy - 3.5 * u);
  ctx.lineTo(cx + 0.9 * u, cy + 3.5 * u);
  ctx.lineTo(cx - 1.1 * u, cy + 1.8 * u);
  ctx.lineTo(cx - 3.2 * u, cy + 1.8 * u);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = BUTTON_FG;
  ctx.lineCap = 'round';
  if (this.muted) {
    ctx.lineWidth = Math.max(2, u * 0.7);
    ctx.beginPath();
    ctx.moveTo(cx + 1.9 * u, cy - 1.9 * u);
    ctx.lineTo(cx + 4.3 * u, cy + 1.9 * u);
    ctx.moveTo(cx + 4.3 * u, cy - 1.9 * u);
    ctx.lineTo(cx + 1.9 * u, cy + 1.9 * u);
    ctx.stroke();
  } else {
    ctx.lineWidth = Math.max(1.5, u * 0.55);
    ctx.beginPath();
    ctx.arc(cx + 1.5 * u, cy, 2 * u, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 1.5 * u, cy, 3.3 * u, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  }
};

Renderer.prototype.drawOverlay = function (game, isWin, st) {
  var ctx = this.ctx;
  var L = this.layout;
  var w = this.view.width;

  ctx.fillStyle = 'rgba(238, 228, 218, 0.8)';
  ctx.fillRect(0, 0, this.view.width, this.view.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (isWin) {
    var P = L.panel;
    ctx.fillStyle = BG_COLOR;
    this.roundRect(ctx, P.x, P.y, P.w, P.h, 16);
    ctx.fill();
    ctx.fillStyle = TEXT_MAIN;
    ctx.font = 'bold ' + Math.round(P.w * 0.1) + 'px sans-serif';
    ctx.fillText('你达成 2048！', w / 2, P.y + P.h * 0.24);
    ctx.fillStyle = TEXT_SUB;
    ctx.font = Math.round(P.w * 0.06) + 'px sans-serif';
    ctx.fillText('当前得分 ' + game.score + '，继续冲击更高分！', w / 2, P.y + P.h * 0.46);
    this.drawButton(L.btnKeep, '继续挑战', 19);
    this.drawButton(L.btnAgainWin, '再来一局', 19);
    return;
  }

  // 游戏结束：配置了广告位时显示「看广告复活」+「再来一局」双按钮
  var Q = st.adAvailable ? L.panelOver : L.panel;
  ctx.fillStyle = BG_COLOR;
  this.roundRect(ctx, Q.x, Q.y, Q.w, Q.h, 16);
  ctx.fill();
  ctx.fillStyle = TEXT_MAIN;
  ctx.font = 'bold ' + Math.round(Q.w * 0.1) + 'px sans-serif';
  ctx.fillText('游戏结束', w / 2, Q.y + 44);
  ctx.fillStyle = TEXT_SUB;
  ctx.font = Math.round(Q.w * 0.06) + 'px sans-serif';
  ctx.fillText('本局得分 ' + game.score + ' · 最高分 ' + (game.best || 0), w / 2, Q.y + 82);

  if (st.adAvailable) {
    ctx.fillStyle = TEXT_SUB;
    ctx.font = Math.round(L.subFont * 0.9) + 'px sans-serif';
    ctx.fillText('看广告复活：清除棋盘上数值最小的 4 个方块', w / 2, Q.y + 110);
    this.drawButton(L.btnRevive, '看广告复活', 19, { bg: REVIVE_BG, fg: REVIVE_FG });
    this.drawButton(L.btnAgainOver, '再来一局', 19);
  } else {
    this.drawButton(L.btnAgain, '再来一局', 19);
  }
};

// 按宽度折行（用于 toast 长文本）
Renderer.prototype.wrapText = function (text, maxW) {
  var ctx = this.ctx;
  ctx.font = this.layout.subFont + 'px sans-serif';
  var lines = [];
  var line = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (line && ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
};

Renderer.prototype.drawToast = function (st, now) {
  if (!st.toast || !st.toast.text) return;
  var age = now - st.toast.t0;
  if (age < 0 || age > TOAST_MS) return;

  var ctx = this.ctx;
  var v = this.view;
  var L = this.layout;
  var alpha = age > TOAST_MS - 400 ? (TOAST_MS - age) / 400 : 1;

  var lines = this.wrapText(st.toast.text, v.width - 96);
  var lineH = Math.round(L.subFont * 1.55);
  var textW = 0;
  for (var i = 0; i < lines.length; i++) {
    textW = Math.max(textW, ctx.measureText(lines[i]).width);
  }
  var boxW = Math.max(120, Math.ceil(textW) + 36);
  var boxH = lines.length * lineH + 22;
  var boxX = (v.width - boxW) / 2;
  var boxY = v.height - v.safeBottom - boxH - 52;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(60, 58, 50, 0.92)';
  this.roundRect(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.fillStyle = '#f9f6f2';
  ctx.font = L.subFont + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var j = 0; j < lines.length; j++) {
    ctx.fillText(lines[j], v.width / 2, boxY + 11 + lineH * (j + 0.5));
  }
  ctx.globalAlpha = 1;
};

module.exports = Renderer;
