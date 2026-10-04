'use strict';

/**
 * 核心逻辑单元测试（Node 环境）：node test/core.test.js
 * 覆盖：四个方向的移动合并、一次只合并一对、无效移动、胜负判定、存档往返。
 */

const path = require('path');
const core = require(path.join(__dirname, '..', 'js', 'core.js'));
const { Game, Tile } = core;

let passed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    passed++;
  } else {
    failures.push(name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
  }
}

function makeGame(gridValues) {
  const game = new Game(4);
  game.board.cells = [];
  for (let r = 0; r < 4; r++) game.board.cells.push([null, null, null, null]);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = gridValues[r][c];
      if (v) game.board.insertTile(new Tile(r, c, v));
    }
  }
  game.score = 0;
  game.over = false;
  game.won = false;
  game.keepPlaying = false;
  return game;
}

function gridOf(game) {
  return game.board.serialize();
}

// 1. 基本左移合并
{
  const g = makeGame([[2, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = g.move(3);
  check('左移 2+2=4', gridOf(g)[0][0] === 4 && r.moved && r.gained === 4, gridOf(g));
  check('移动后生成新块（共 2 块）', g.board.emptyCells().length === 14);
}

// 2. 一行四块各合并一次
{
  const g = makeGame([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = g.move(3);
  check('2,2,2,2 → 4,4', gridOf(g)[0].join(',') === '4,4,0,0', gridOf(g)[0]);
  check('得分 8', r.gained === 8, r);
}

// 3. 合并产生的新块不与原块再次合并
{
  const g = makeGame([[4, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move(3);
  check('4,4,8 → 8,8', gridOf(g)[0].join(',') === '8,8,0,0', gridOf(g)[0]);
}
{
  const g = makeGame([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move(3);
  check('2,2,4 → 4,4', gridOf(g)[0].join(',') === '4,4,0,0', gridOf(g)[0]);
}

// 4. 右移 / 上移 / 下移
{
  const g = makeGame([[0, 2, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move(1);
  check('右移 2+2=4', gridOf(g)[0][3] === 4, gridOf(g)[0]);
}
{
  const g = makeGame([[0, 0, 0, 0], [0, 2, 0, 0], [0, 0, 0, 0], [0, 2, 0, 0]]);
  g.move(0);
  check('上移 2+2=4', gridOf(g)[0][1] === 4, gridOf(g));
}
{
  const g = makeGame([[0, 0, 0, 0], [0, 2, 0, 0], [0, 0, 0, 0], [0, 2, 0, 0]]);
  g.move(2);
  check('下移 2+2=4', gridOf(g)[3][1] === 4, gridOf(g));
}

// 5. 无效移动：不生成新块，并判定结束
{
  const g = makeGame([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  const before = JSON.stringify(gridOf(g));
  const r = g.move(3);
  check('无法移动时 moved=false', r.moved === false);
  check('无法移动时不生成新块', JSON.stringify(gridOf(g)) === before);
  check('无路可走 → over=true', g.over === true);
}

// 6. 满盘但存在可合并 → 不结束
{
  const g = makeGame([[2, 2, 4, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  const r = g.move(3);
  check('满盘但有合并可继续', r.moved === true && g.over === false);
}

// 7. 达成 2048 判胜，继续游戏解锁
{
  const g = makeGame([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = g.move(3);
  check('合成 2048 → won=true', g.won === true && r.moved);
  check('胜利后 terminated', g.terminated() === true);
  g.keepPlaying = true;
  check('继续游戏后可继续操作', g.terminated() === false);
}

// 8. 存档往返
{
  const g = makeGame([[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2, 4], [0, 0, 0, 0]]);
  g.score = 1234;
  const g2 = Game.restore(g.serialize());
  check('存档恢复棋盘一致', JSON.stringify(gridOf(g2)) === JSON.stringify(gridOf(g)));
  check('存档恢复分数一致', g2.score === 1234);
}

// 9. 非法存档抛错
{
  let threw = false;
  try { Game.restore({ grid: [[2], [3]] }); } catch (e) { threw = true; }
  check('非法存档抛错', threw);
}

// 10. 随机生成块取值 2/4，比例约 9:1
{
  let fours = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const g = new Game(4);
    g.board.cells = [];
    for (let r = 0; r < 4; r++) g.board.cells.push([null, null, null, null]);
    const t = g.addRandomTile();
    if (t.value === 4) fours++;
  }
  const ratio = fours / N;
  check('生成 4 的比例约 10%', ratio > 0.05 && ratio < 0.16, ratio);
}

// 11. 终局后不再接受移动
{
  const g = makeGame([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  g.over = true;
  const r = g.move(3);
  check('结束后 moved=false', r.moved === false);
}

// 12. 复活：清除最小的方块并恢复可玩
{
  const g = makeGame([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  g.over = true;
  g.score = 500;
  const removed = g.revive(4);
  check('复活清除 4 个方块', removed.length === 4, removed);
  check('清除的都是最小值 2', removed.every((t) => t.value === 2), removed);
  check('复活后 over=false', g.over === false);
  check('复活后出现空位', g.board.emptyCells().length >= 4);
  check('复活后可继续移动', g.movesAvailable() === true);
  check('复活不清分数', g.score === 500);
}
{
  // 数量少于 count 时清空全部
  const g = makeGame([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 4]]);
  const removed = g.revive(4);
  check('方块不足时全部清除', removed.length === 2 && g.board.emptyCells().length === 16, removed);
}

console.log('通过 ' + passed + ' 项');
if (failures.length) {
  console.error('失败 ' + failures.length + ' 项:');
  failures.forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}
