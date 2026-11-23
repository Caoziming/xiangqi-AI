// 象棋引擎正确性测试:从 xiangqi.html 中提取引擎源码并在 Node 中运行
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./xiangqi.html', import.meta.url), 'utf8');
const src = html.match(/<script id="engine-src">([\s\S]*?)<\/script>/)[1];
(0, eval)(src); // 全局作用域执行, 挂载 globalThis.XQ
const XQ = globalThis.XQ;

let failed = 0;
function check(name, actual, expect) {
  const ok = actual === expect;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + ': ' + actual + (ok ? '' : '  (期望 ' + expect + ')'));
  if (!ok) failed++;
}

/* ---------- 1. perft(走法生成 + 合法性过滤的正确性基准) ---------- */
function perft(st, d) {
  if (d === 0) return 1;
  const ms = XQ.legalMoves(st);
  let n = 0;
  for (const m of ms) {
    const cap = XQ.make(st, m);
    n += perft(st, d - 1);
    XQ.unmake(st, m, cap);
  }
  return n;
}
const st0 = { board: XQ.initialBoard(), side: 0 };
st0.key = XQ.keyOf(st0.board, 0);

console.log('[perft 初始局面]');
check('perft(1)', perft(st0, 1), 44);
check('perft(2)', perft(st0, 2), 1920);
check('perft(3)', perft(st0, 3), 79666);
const t4 = Date.now();
const p4 = perft(st0, 4);
console.log('  · perft(4) = ' + p4 + ' (期望 3290240)  耗时 ' + (Date.now() - t4) + 'ms');
if (p4 !== 3290240) { console.log('  ✗ perft(4) 不匹配'); failed++; }

/* ---------- 2. Zobrist 键在 make/unmake 后恢复 ---------- */
{
  const st = { board: XQ.initialBoard(), side: 0 };
  st.key = XQ.keyOf(st.board, 0);
  const k0 = st.key;
  let rng = 12345;
  const rand = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  for (let i = 0; i < 500; i++) {
    const ms = XQ.legalMoves(st);
    if (!ms.length) break;
    const m = ms[(rand() * ms.length) | 0];
    const cap = XQ.make(st, m);
    if (rand() < 0.5) XQ.unmake(st, m, cap); // 一半概率直接撤销
    else {
      const ms2 = XQ.legalMoves(st);
      if (ms2.length) {
        const m2 = ms2[(rand() * ms2.length) | 0];
        const cap2 = XQ.make(st, m2);
        XQ.unmake(st, m2, cap2);
      }
      XQ.unmake(st, m, cap);
    }
    if (st.key !== k0 || st.side !== 0) { check('zobrist 往返 #' + i, st.key, k0); break; }
  }
  console.log('  ✓ zobrist make/unmake 往返一致(500 次随机)');
  check('棋盘还原', JSON.stringify(st.board), JSON.stringify(XQ.initialBoard()));
}

/* ---------- 3. 白吃车: 搜索应找到吃无根车 ---------- */
{
  const b = new Array(90).fill(0);
  b[9*9+3] = 'K'; b[0*9+4] = 'k';   // 两王错开列, 避免对脸
  b[5*9+0] = 'R'; b[5*9+8] = 'r';   // 同排双车, 黑车无根
  const r = XQ.think(b, 0, [], 1000, 6, 0);
  const expect = (5*9+0) << 7 | (5*9+8);
  check('白吃车', r.move, expect);
}

/* ---------- 4. 一步杀: 马(4,4)→(2,5) 成杀 ---------- */
{
  const b = new Array(90).fill(0);
  b[9*9+3] = 'K';                    // 红帅
  b[1*9+1] = 'R';                    // 红车封一线
  b[4*9+4] = 'N';                    // 红马
  b[0*9+4] = 'k';                    // 黑将
  b[0*9+3] = 'a'; b[0*9+5] = 'a';    // 黑双士堵住将门
  const r = XQ.think(b, 0, [], 1000, 4, 0);
  const expect = (4*9+4) << 7 | (2*9+5);
  check('一步杀着法', r.move, expect);
  check('一步杀评分(应为杀棋分)', r.score > 29900, true);
}

/* ---------- 5. 对脸将规则 ---------- */
{
  const b = new Array(90).fill(0);
  b[9*9+4] = 'K'; b[0*9+4] = 'k';   // 同列无遮挡 → 双方都视为被将
  check('对脸将检测(红)', XQ.inCheck(b, 0), true);
  check('对脸将检测(黑)', XQ.inCheck(b, 1), true);
  b[5*9+4] = 'P';                    // 中间挡一兵 → 不算对脸
  check('遮挡后不算对脸', XQ.inCheck(b, 0), false);
}

/* ---------- 6. 搜索冒烟: 中炮后让 AI 思考 2 秒 ---------- */
{
  const st = { board: XQ.initialBoard(), side: 0, key: 0 };
  st.key = XQ.keyOf(st.board, 0);
  XQ.make(st, (7*9+1) << 7 | (7*9+4));   // 先行一步中炮, 避开开局库
  const t = Date.now();
  const r = XQ.think(st.board, st.side, [], 2000, 64, 0);
  const ms = XQ.legalMoves(st);
  check('返回合法着法', ms.indexOf(r.move) >= 0, true);
  check('搜索深度 ≥ 6', r.depth >= 6, true);
  console.log('  · 深度 ' + r.depth + ' · ' + (r.nodes/1000).toFixed(0) + 'k 节点 · '
    + (Date.now()-t) + 'ms · 评分 ' + r.score);
}

console.log(failed ? '\n✗ ' + failed + ' 项失败' : '\n全部测试通过 ✓');
process.exit(failed ? 1 : 0);
