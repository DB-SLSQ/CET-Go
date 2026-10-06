/* ============================================================
   CET Go · 自测脚本（Node 直跑，不需要浏览器）
     node tools/selftest.js
   覆盖：词库加载 / 释义清洗 / 判分归一化 / 提示掩码 / 词性归类
        + index.html 的 id 与 app.js 引用一致性检查
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const PUB = path.join(ROOT, 'public');

/* 可选： node tools/selftest.js <outFile>  —— 结果同时以 UTF-8 落盘 */
const OUT_FILE = process.argv[2];
if (OUT_FILE) {
  const _log = console.log.bind(console);
  const lines = [];
  console.log = function () {
    const s = Array.prototype.map.call(arguments, String).join(' ');
    lines.push(s);
    _log(s);
  };
  const flush = () => { try { fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8'); } catch (e) {} };
  process.on('exit', flush);
  process.on('uncaughtException', e => { lines.push('UNCAUGHT: ' + (e && e.stack || e)); flush(); });
}

let fail = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '   → ' + extra : '')); }
}
function head(t) { console.log('\n== ' + t + ' =='); }

/* ---------- 载入 words.js（mock fetch 指向本地 data/） ---------- */
const sandbox = {
  console,
  fetch: (url) => {
    const p = path.join(ROOT, 'data', path.basename(String(url)));
    const exists = fs.existsSync(p);
    return Promise.resolve({
      ok: exists,
      status: exists ? 200 : 404,
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8')))
    });
  }
};
vm.createContext(sandbox);
const wordsSrc = fs.readFileSync(path.join(PUB, 'js', 'words.js'), 'utf8');
vm.runInContext(wordsSrc + '\nglobalThis.__W = Words;', sandbox);
const Words = sandbox.__W;

(async function main() {
  head('词库加载');
  const n = await Words.load();
  ok(n > 4500, '合并词条数 = ' + n + '（期望 > 4500）');
  ok(Words.cet6.length > 2000, 'CET6 = ' + Words.cet6.length);
  ok(Words.cet4.length > 3000, 'CET4 = ' + Words.cet4.length);
  ok(Words.find('Abandon') !== null, 'find() 大小写不敏感');
  ok(Words.find('__nope__') === null, 'find() 查不到返回 null');

  head('释义清洗');
  const cases = [
    ['v. 1. 抛弃，放弃 2. 离弃(家园、船只、飞机等) 3. 遗弃(妻、子女等)', '抛弃，放弃'],
    ['adj. 不正常的', '不正常的'],
    ['art.一(个)；每一(个)', '一(个)'],
    ['n. 1. 流产，小产，堕胎 2. (计划、工程等的)中途失败;中止，中辍的计划', '流产，小产，堕胎'],
    /* 词性用 & 串起来写的（旧版正则只剥掉最前面一个，剩下「&n.」会印在题面上；
       hoist 实测显示成「&n. 提升，举起」） */
    ['v. &n. 提升，举起', '提升，举起'],
    ['vt.&vi. 打，敲；打败', '打，敲；打败'],
    ['vt.&vi.&n. 打赌', '打赌'],
    ['aux.v.&vi.是，在，做', '是，在，做'],
    /* 句中那串要变成义项分隔符，不能被一个空格粘成一句话 */
    ['vt.使爆裂 vi.&n.爆炸', '使爆裂；爆炸'],
    /* 词性紧贴在右括号后 / 漏写点号的脏数据 */
    ['(缩作 OK)a.&ad.对，好', '(缩作 OK)对，好'],
    ['prep&conj.直到…为止', '直到…为止'],
    /* 首尾相接的两串词性，一趟只吃得掉一串，要反复剥 */
    ['aux.v. vt.做，干，办', '做，干，办'],
    /* 音标被并进 tr、ph 是空的（三种写法） */
    ['ˈɑːbɪtrərɪ /adj. 1. 随意的，武断的 2. 霸道的，专横的', '随意的，武断的'],
    ['/ˈraɪvəl n. 竞争者，对手，敌手', '竞争者，对手，敌手'],
    ['/ ˈplætəʊ n. 高原', '高原'],
    /* 句子中间用方括号夹着「另一个词性的读音」（advocate / alternate / project …），
       词条自带的主音标已经在 ph 里，这段要整段消失，还不能把两边的词性粘在一起 */
    ['v. 拥护，提倡 [ˈædvəkɪt] n. 提倡者，拥护者', '拥护，提倡；提倡者，拥护者'],
    ['adj. 交替的，轮流的，交错的  [ˈɔːltəneɪt] v. (使)交替，(使)轮流',
     '交替的，轮流的，交错的；(使)交替，(使)轮流'],
    /* 反例：方括号里是搭配说明，不是音标，必须留着 */
    ['v. 绊脚，绊跌 [on] sth 偶然碰见', '[on] sth'],
    /* 义项编号切分点留下的「；」不能和 join 的分隔符叠成双分号 */
    ['n. 方案，规划，工程，项目 [prəˈdʒekt] v. 1. 发射，投掷 2. 使凸出',
     '方案，规划，工程，项目；发射，投掷'],
  ];
  for (const [tr, want] of cases) {
    const got = Words.meaning(tr, 2);
    ok(got.indexOf(want) >= 0, '「' + tr.slice(0, 22) + '…」→ ' + got);
  }

  // 全库体检：清洗后不应残留词性标记 / 不应为空
  const POS_LEFTOVER = /(^|[\s；;、（(])(n|v|adj|adv|ad|a|art|prep|conj|pron|int|num|vt|vi)\.\s/;
  const AMP_LEAK = /&/;                 // 词性连接符剥干净后不该再出现
  const LEAD_POS = /^[a-z]{1,5}\./i;    // 释义开头就是词性标记
  const SLASH_POS = /[/（(][a-z]{1,4}\./i;   // 紧跟斜杠/左括号的词性
  const PH_LEAK = /\[[^\]\u4e00-\u9fff]*[ˈˌːəɪʊɒæθðʃʒŋʌɔɜɑ][^\]\u4e00-\u9fff]*\]/; // 句中的音标
  const DBL_SEP = /；{2,}/;             // 双分号
  let leftover = 0, empty = 0, tooLong = 0, ampLeak = 0, leadPos = 0, slashPos = 0;
  let phLeak = 0, dblSep = 0;
  for (const w of Words._all) {
    const m = Words.meaning(w.tr, 2);
    if (m === '—') { empty++; continue; }
    if (POS_LEFTOVER.test(m)) leftover++;
    if (AMP_LEAK.test(m)) ampLeak++;
    if (LEAD_POS.test(m)) leadPos++;
    if (SLASH_POS.test(m)) slashPos++;
    if (PH_LEAK.test(m)) phLeak++;
    if (DBL_SEP.test(m)) dblSep++;
    if (m.length > 60) tooLong++;
  }
  ok(empty <= 5, '释义缺失的词条 = ' + empty + '（期望很少）');
  ok(leftover === 0, '清洗后仍残留词性标记 = ' + leftover);
  ok(ampLeak === 0, '清洗后仍带词性连接符 & = ' + ampLeak);
  ok(leadPos === 0, '清洗后释义仍以词性标记开头 = ' + leadPos);
  ok(slashPos === 0, '清洗后仍有紧贴斜杠的词性标记 = ' + slashPos);
  ok(phLeak === 0, '清洗后释义里仍夹着音标 = ' + phLeak);
  ok(dblSep === 0, '清洗后仍出现双分号 = ' + dblSep);
  ok(tooLong / Words._all.length < 0.02, '过长释义(>60字) 占比 = ' +
     (tooLong / Words._all.length * 100).toFixed(2) + '%');

  // 音标被并进 tr 的那几条，load() 应该把音标捡回 ph（否则揭晓卡上音标是空的）
  const lostPh = Words._all.filter(w =>
    /^[^\u4e00-\u9fff]*\//.test(String(w.tr || '').trim()) &&
    (!w.ph || !String(w.ph).trim()));
  ok(lostPh.length === 0, '音标并进 tr 的词条已回填 ph = ' + lostPh.length +
     (lostPh.length ? '（' + lostPh.slice(0, 3).map(w => w.w).join(', ') + '）' : ''));

  head('判分归一化');
  ok(Words.norm('Abandon', false) === 'abandon', '宽松：大小写');
  ok(Words.norm('  ice cream ', false) === 'icecream', '宽松：空格');
  ok(Words.norm('well-known', false) === 'wellknown', '宽松：连字符');
  ok(Words.norm("don't", false) === 'dont', '宽松：撇号');
  ok(Words.norm('ice cream', true) === 'ice cream', '严格：保留单空格');
  ok(Words.norm('ice  cream', true) === 'ice cream', '严格：多空格折叠');
  ok(Words.norm('Abandon', false) === Words.norm('abandon', false), '答案两侧一致');

  head('提示掩码');
  ok(Words.hintMask('abandon', 1) === 'a _ _ _ _ _ _', 'hintMask(abandon,1) → ' + Words.hintMask('abandon', 1));
  ok(Words.hintMask('abandon', 0) === '_ _ _ _ _ _ _', 'hintMask(abandon,0)');
  ok(Words.hintMask('ice cream', 3) === 'i c e   _ _ _ _ _', 'hintMask(ice cream,3) → ' + Words.hintMask('ice cream', 3));
  ok(Words.hintMask('abandon', 99) === 'a b a n d o n', 'hintMask 不越界');
  /* 句点不占槽：它必须亮出来（判分不忽略句点，玩家得知道这儿有个点） */
  ok(Words.hintMask('a.m', 0) === '_ . _', 'hintMask(a.m,0) → ' + Words.hintMask('a.m', 0));

  head('字母个数');
  ok(Words.letterCount('abandon') === 7, 'abandon → ' + Words.letterCount('abandon'));
  ok(Words.letterCount('ice cream') === 8, '空格不算：ice cream → ' + Words.letterCount('ice cream'));
  ok(Words.letterCount('well-known') === 9, '连字符不算：well-known → ' + Words.letterCount('well-known'));
  ok(Words.letterCount("don't") === 4, '撇号不算：don\'t → ' + Words.letterCount("don't"));
  ok(Words.letterCount('') === 0 && Words.letterCount(null) === 0, '空值不炸');
  /* 槽位数必须跟报出来的字母数对上 —— 题面是「17 字母」配一排槽，
     两边不一致玩家按槽数去数就会数错。
     只查**可出题池**：全库里还有 100 条 `attribute 1` 这种同形词消歧条目
     （词面带数字后缀），被 app.js 的 /^[a-zA-Z][a-zA-Z\s'\-.]*$/ 挡在局外，
     它们的槽位数天生对不上，但永远不会出现在题面上。 */
  const playable = Words._all.filter(w =>
    w && w.w && /^[a-zA-Z][a-zA-Z\s'\-.]*$/.test(w.w) &&
    w.w.replace(/[^a-zA-Z]/g, '').length >= 2 &&
    Words.meaning(w.tr, 1) !== '—');
  const mismatch = playable.filter(w => {
    const slots = Words.hintMask(w.w, 0).split('').filter(c => c === '_').length;
    return slots !== Words.letterCount(w.w);
  });
  ok(mismatch.length === 0, '可出题池 ' + playable.length + ' 条：槽位数 = 字母数' +
     (mismatch.length ? '（不符 ' + mismatch.length + ' 条，如 ' +
       mismatch.slice(0, 3).map(w => w.w).join(', ') + '）' : ''));
  /* 题面里的字符集必须是白名单内的，不然槽位 / 判分 / 报数三方还会再错位 */
  const odd = playable.filter(w => /[^a-zA-Z\s'\-.]/.test(w.w));
  ok(odd.length === 0, '可出题池词面字符干净' +
     (odd.length ? '（异常 ' + odd.length + ' 条：' + odd.slice(0, 3).map(w => w.w).join(', ') + '）' : ''));

  head('词性归类 / 词表池');
  ok(Words.posKey(Words.find('abandon')) === 'v', 'abandon → v');
  const dist = { n: 0, v: 0, adj: 0, adv: 0 };
  for (const w of Words._all) {
    for (const k of ['n', 'v', 'adj', 'adv']) if (Words.hasPos(w, k)) dist[k]++;
  }
  console.log('  · 主题词性覆盖 ' + JSON.stringify(dist));
  ok(dist.n > 800, '名词主题可用 = ' + dist.n);
  ok(dist.v > 500, '动词主题可用 = ' + dist.v);
  ok(dist.adj > 300, '形容词主题可用 = ' + dist.adj);
  ok(dist.adv > 80, '副词主题可用 = ' + dist.adv);
  ok(Words.pool('cet6').length === Words.cet6.length, 'pool(cet6) 数量一致');
  ok(Words.pool('all').length === Words._all.length, 'pool(all) 数量一致');

  // 出题池过滤规则（与 app.js startGame 保持一致）
  const clean = Words.pool('cet6').filter(w =>
    w && w.w && /^[a-zA-Z][a-zA-Z\s'\-.]*$/.test(w.w) &&
    w.w.replace(/[^a-zA-Z]/g, '').length >= 2 &&
    Words.meaning(w.tr, 1) !== '—');
  ok(clean.length > 2000, 'CET6 可出题词条 = ' + clean.length);

  head('HTML id ↔ app.js 引用一致性');
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const ids = new Set(Array.prototype.slice.call(html.matchAll(/id="([^"]+)"/g)).map(m => m[1]));
  const appjs = fs.readFileSync(path.join(PUB, 'js', 'app.js'), 'utf8');
  const refs = Array.prototype.slice.call(appjs.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)).map(m => m[1]);
  const dyn = new Set(['mkOk', 'mkNo']);   // 弹窗里动态生成的 id
  const missing = Array.from(new Set(refs)).filter(r => !ids.has(r) && !dyn.has(r));
  ok(missing.length === 0, 'app.js 引用的 id 全部存在于 index.html', missing.join(', '));

  const unused = Array.from(ids).filter(i => refs.indexOf(i) < 0 && appjs.indexOf("'" + i + "'") < 0);
  console.log('  · 未被 app.js 直接引用的 id：' + (unused.length ? unused.join(', ') : '（无）'));

  head('结果');
  console.log(fail === 0 ? '  ✅ 全部通过' : '  ❌ 失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('自测崩溃：', e); process.exit(2); });
