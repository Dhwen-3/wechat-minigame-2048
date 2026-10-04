'use strict';

/**
 * 2048 核心玩法（纯逻辑，不依赖任何平台 API）。
 * 同一份代码可在微信小游戏、浏览器、Node 中直接运行。
 */

var SIZE = 4;
var WIN_VALUE = 2048;

function Tile(row, col, value) {
  this.value = value;
  this.row = row;
  this.col = col;
  this.prevRow = row;      // 上一回合位置（供滑动动画使用）
  this.prevCol = col;
  this.mergedFrom = null;  // 合并来源 [{row, col, value}, ...]，仅合并块持有
  this.isNew = false;      // 本回合新生成
  this.justMerged = false; // 本回合刚完成合并
}

function Board(size) {
  this.size = size;
  this.cells = [];
  for (var r = 0; r < size; r++) {
    var row = [];
    for (var c = 0; c < size; c++) row.push(null);
    this.cells.push(row);
  }
}

Board.prototype.eachCell = function (fn) {
  for (var r = 0; r < this.size; r++) {
    for (var c = 0; c < this.size; c++) {
      fn(this.cells[r][c], r, c);
    }
  }
};

Board.prototype.cellAt = function (row, col) {
  return this.cells[row][col];
};

Board.prototype.insertTile = function (tile) {
  this.cells[tile.row][tile.col] = tile;
};

Board.prototype.removeTile = function (tile) {
  this.cells[tile.row][tile.col] = null;
};

Board.prototype.inBounds = function (row, col) {
  return row >= 0 && row < this.size && col >= 0 && col < this.size;
};

Board.prototype.emptyCells = function () {
  var list = [];
  this.eachCell(function (tile, r, c) {
    if (!tile) list.push({ row: r, col: c });
  });
  return list;
};

Board.prototype.randomAvailableCell = function () {
  var cells = this.emptyCells();
  if (cells.length === 0) return null;
  return cells[Math.floor(Math.random() * cells.length)];
};

// 相邻是否存在等值块（判断棋盘是否已无路可走）
Board.prototype.hasMatches = function () {
  for (var r = 0; r < this.size; r++) {
    for (var c = 0; c < this.size; c++) {
      var tile = this.cells[r][c];
      if (!tile) continue;
      if (c + 1 < this.size && this.cells[r][c + 1] && this.cells[r][c + 1].value === tile.value) return true;
      if (r + 1 < this.size && this.cells[r + 1][c] && this.cells[r + 1][c].value === tile.value) return true;
    }
  }
  return false;
};

Board.prototype.serialize = function () {
  var grid = [];
  for (var r = 0; r < this.size; r++) {
    var row = [];
    for (var c = 0; c < this.size; c++) row.push(this.cells[r][c] ? this.cells[r][c].value : 0);
    grid.push(row);
  }
  return grid;
};

Board.prototype.restore = function (grid) {
  if (!Array.isArray(grid) || grid.length !== this.size) throw new Error('invalid save');
  for (var r = 0; r < this.size; r++) {
    var row = grid[r];
    if (!Array.isArray(row) || row.length !== this.size) throw new Error('invalid save');
    for (var c = 0; c < this.size; c++) {
      var v = row[c];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) throw new Error('invalid save');
      this.cells[r][c] = v > 0 ? new Tile(r, c, v) : null;
    }
  }
};

// 方向向量：0 上 / 1 右 / 2 下 / 3 左
var VECTORS = [
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 0, col: -1 }
];

function Game(size) {
  this.size = size || SIZE;
  this.board = new Board(this.size);
  this.score = 0;
  this.over = false;
  this.won = false;
  this.keepPlaying = false;
  this.setup();
}

Game.prototype.setup = function () {
  this.board = new Board(this.size);
  this.score = 0;
  this.over = false;
  this.won = false;
  this.keepPlaying = false;
  this.addRandomTile();
  this.addRandomTile();
};

// 新块：90% 是 2，10% 是 4
Game.prototype.addRandomTile = function () {
  var cell = this.board.randomAvailableCell();
  if (!cell) return null;
  var tile = new Tile(cell.row, cell.col, Math.random() < 0.9 ? 2 : 4);
  tile.isNew = true;
  this.board.insertTile(tile);
  return tile;
};

Game.prototype.terminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

Game.prototype.movesAvailable = function () {
  return this.board.emptyCells().length > 0 || this.board.hasMatches();
};

// 依移动方向决定遍历顺序：靠边先动，保证一次移动内每块只合并一次
Game.prototype.buildTraversals = function (vector) {
  var rows = [];
  var cols = [];
  for (var i = 0; i < this.size; i++) {
    rows.push(i);
    cols.push(i);
  }
  if (vector.row === 1) rows.reverse();
  if (vector.col === 1) cols.reverse();
  return { rows: rows, cols: cols };
};

Game.prototype.farthestPosition = function (cell, vector) {
  var prev = { row: cell.row, col: cell.col };
  var row = cell.row + vector.row;
  var col = cell.col + vector.col;
  while (this.board.inBounds(row, col) && !this.board.cellAt(row, col)) {
    prev = { row: row, col: col };
    row += vector.row;
    col += vector.col;
  }
  return { row: prev.row, col: prev.col, next: { row: row, col: col } };
};

/**
 * 执行一步移动。
 * @param {number} direction 0 上 / 1 右 / 2 下 / 3 左
 * @returns {{moved: boolean, gained: number, merged: Array<{row: number, col: number, value: number}>}}
 */
Game.prototype.move = function (direction) {
  if (this.terminated()) return { moved: false, gained: 0, merged: [] };
  var vector = VECTORS[direction];
  if (!vector) return { moved: false, gained: 0, merged: [] };

  var self = this;
  var moved = false;
  var gained = 0;
  var mergedCells = [];

  // 清除上一回合的动画标记
  this.board.eachCell(function (tile) {
    if (tile) {
      tile.isNew = false;
      tile.justMerged = false;
    }
  });

  var traversals = this.buildTraversals(vector);
  traversals.rows.forEach(function (row) {
    traversals.cols.forEach(function (col) {
      var tile = self.board.cellAt(row, col);
      if (!tile) return;
      tile.prevRow = row;
      tile.prevCol = col;

      var farthest = self.farthestPosition({ row: row, col: col }, vector);
      var nextRow = farthest.next.row;
      var nextCol = farthest.next.col;
      var nextTile = self.board.inBounds(nextRow, nextCol) ? self.board.cellAt(nextRow, nextCol) : null;

      if (nextTile && nextTile.value === tile.value && !nextTile.justMerged) {
        // 合并：新块落在被撞块的位置
        var merged = new Tile(nextRow, nextCol, tile.value * 2);
        merged.mergedFrom = [
          { row: tile.row, col: tile.col, value: tile.value },
          { row: nextTile.row, col: nextTile.col, value: nextTile.value }
        ];
        merged.justMerged = true;
        self.board.removeTile(tile);
        self.board.removeTile(nextTile);
        self.board.insertTile(merged);
        gained += merged.value;
        mergedCells.push({ row: merged.row, col: merged.col, value: merged.value });
        if (merged.value >= WIN_VALUE) self.won = true;
        moved = true;
      } else if (farthest.row !== row || farthest.col !== col) {
        // 仅滑动
        self.board.removeTile(tile);
        tile.row = farthest.row;
        tile.col = farthest.col;
        self.board.insertTile(tile);
        moved = true;
      }
    });
  });

  if (moved) {
    this.score += gained;
    this.addRandomTile();
    if (!this.movesAvailable()) this.over = true;
  } else if (!this.movesAvailable()) {
    this.over = true;
  }

  return { moved: moved, gained: gained, merged: mergedCells };
};

/**
 * 复活：清除数值最小的 count 个方块（由激励视频广告奖励触发）。
 * 能走到无路可走时棋盘必然已满，清除后必定出现空位，可继续游戏。
 * @param {number} count 要清除的方块数
 * @returns {Array<{row: number, col: number, value: number}>} 被清除的方块
 */
Game.prototype.revive = function (count) {
  var tiles = [];
  this.board.eachCell(function (tile, r, c) {
    if (tile) tiles.push({ row: r, col: c, value: tile.value });
  });
  tiles.sort(function (a, b) { return a.value - b.value; });
  var removed = tiles.slice(0, Math.max(0, count));
  for (var i = 0; i < removed.length; i++) {
    this.board.cells[removed[i].row][removed[i].col] = null;
  }
  this.over = false;
  return removed;
};

Game.prototype.serialize = function () {
  return {
    size: this.size,
    grid: this.board.serialize(),
    score: this.score,
    won: this.won,
    keepPlaying: this.keepPlaying,
    over: this.over
  };
};

// 从存档恢复；数据非法时抛错，由调用方兜底
Game.restore = function (data) {
  if (!data || typeof data !== 'object') return null;
  var game = new Game(SIZE);
  game.board.restore(data.grid);
  game.score = typeof data.score === 'number' ? data.score : 0;
  game.won = !!data.won;
  game.keepPlaying = !!data.keepPlaying;
  game.over = !!data.over;
  if (!game.over && !game.movesAvailable()) game.over = true;
  return game;
};

module.exports = {
  SIZE: SIZE,
  WIN_VALUE: WIN_VALUE,
  Tile: Tile,
  Board: Board,
  Game: Game
};
