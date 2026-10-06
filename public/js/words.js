/* ============================================================
   CET Go · 词库（离线：data/words_cet4.json + words_cet6.json）
   词条格式： { w:单词, ph:音标, tr:中文释义, pos:[词性], lv:"CET4"|"CET6" }
   ============================================================ */
/* 词库里的词性标记是「一串」而不是「一个」：
     「v.」「vt.&vi.」「n. & v.」「aux.v.&vi.」「vi.&vi.&n.」……
   只按「一个词性 + 点」去剥，就只能剥掉最前面那一个，剩下的「&n.」会原样印在题面上
   （实测 hoist 的释义「v. &n. 提升，举起」显示成「&n. 提升，举起」）。
   做法是先把连接符「&」统一焊成「.」（见 meaning 里第 1a 步），
   于是「一整串词性」就退化成 `(?:[a-z]{1,5}\.)+` 这种好写的形状。
   捕获组 1 是它前面的分隔符（句首时为空），用来决定替换成什么；
   `)）` 也在分隔符里 ——「(缩作 OK)a.&ad.对，好」的词性就紧跟在右括号后面。 */
const POS_RUN = /(^|[\s；;、，（()）])(?:[a-z]{1,5}\.)+\s*/gi;

/* 有 7 条数据的音标被并进了释义里（而且 ph 字段是空的），写法有三种：
     「ˈɑːbɪtrərɪ /adj. 1. 随意的，武断的…」   音标在「/」前面
     「/ˈraɪvəl n. 竞争者，对手，敌手」         音标在「/」后面
     「/ ˈplætəʊ n. 高原」                     同上，多一个空格
   共同点：第一个汉字之前的那一段里躺着一个「/」，而那段里全是音标 + 词性标记，
   没有一个是释义 —— 整段切掉最省事（剩下的词性标记后面还会再擦一遍）。
   只在「前导段里有斜杠」时才动手：释义中间拿「/」当同义分隔符的那 44 条（「可接受/合意的」）
   前面有汉字，够不到这里。 */
const PH_HEAD = /^[^\u4e00-\u9fff]*\/[^\u4e00-\u9fff]*/;

/* 另有一批词条把「另一个词性的读音」用方括号夹在释义中间：
     「v. 拥护，提倡 [ˈædvəkɪt] n. 提倡者，拥护者」（advocate）
     「adj. 交替的，轮流的，交错的  [ˈɔːltəneɪt] v. (使)交替…」（alternate）
   这些词条自带的主音标已经在 ph 里了（advocate → ˈædvəkeɪt），
   方括号那段是纯粹的重复，不删就整段印到题面上。
   判据必须落在「像音标」上，不能只看「方括号里没有汉字」——
   stumble 的释义里有「[on] sth」这种搭配说明，那是要留的。 */
const IPA_BRACKET = /\[[^\]\u4e00-\u9fff]*[ˈˌːəɪʊɒæθðʃʒŋʌɔɜɑ][^\]\u4e00-\u9fff]*\]/g;

/* 从被污染的前导段里把音标抠出来，回填给 ph：
   斜杠、词性标记、义项编号、空白全丢掉，剩下的就是音标（三种写法通吃）。 */
function phFromTr(tr) {
  const head = String(tr == null ? '' : tr).match(/^[^\u4e00-\u9fff]*/)[0];
  if (head.indexOf('/') < 0) return '';
  return head.replace(/[a-z]{1,5}\./gi, '').replace(/[\d.、\s/]+/g, '').trim();
}

const Words = {
  cet4: [],
  cet6: [],
  _all: [],
  _index: Object.create(null),
  loaded: false,

  async load() {
    const get = (u) => fetch(u, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error(u + ' → HTTP ' + r.status);
      return r.json();
    });
    const [c4, c6] = await Promise.all([
      get('/data/words_cet4.json'),
      get('/data/words_cet6.json')
    ]);

    this.cet4 = (Array.isArray(c4) ? c4 : []).filter(w => w && w.w);
    this.cet6 = (Array.isArray(c6) ? c6 : []).filter(w => w && w.w);

    // 合并去重：CET6 优先（后写入覆盖）
    const map = new Map();
    for (const w of this.cet4) map.set(w.w.toLowerCase(), w);
    for (const w of this.cet6) map.set(w.w.toLowerCase(), w);
    this._all = Array.from(map.values());

    // 索引，供错题本按单词反查
    this._index = Object.create(null);
    for (const w of this._all) this._index[w.w.toLowerCase()] = w;

    // 有 7 条数据的音标被并进了 tr、ph 却是空的（arbitrary / draft / rival / plateau …），
    // meaning() 会把那段音标从释义里切掉，这里顺手把它收进 ph ——
    // 否则作答后揭晓的那张卡上音标是空的。
    for (const w of this._all) {
      if (w.ph && String(w.ph).trim()) continue;
      const ph = phFromTr(w.tr);
      if (ph) w.ph = ph;
    }

    // 预计算主题词性：pos 数组 + 释义开头的词性前缀
    //（这版大纲词库很多词条的 pos 是空的，词性写在 tr 里，如 "ad.在船(车)上"）
    for (const w of this._all) w._p = this._derivePos(w);

    this.loaded = true;
    return this._all.length;
  },

  _addPos(set, x) {
    if (x === 'n') set.add('n');
    else if (x === 'v' || x === 'vt' || x === 'vi') set.add('v');
    else if (x === 'adj' || x === 'a') set.add('adj');
    else if (x === 'adv' || x === 'ad') set.add('adv');
  },
  _derivePos(w) {
    const set = new Set();
    if (w && Array.isArray(w.pos)) {
      for (const x of w.pos) this._addPos(set, String(x).toLowerCase());
    }
    const m = String((w && w.tr) || '').match(/^\s*([a-z]{1,5})\s*\./i);
    if (m) this._addPos(set, m[1].toLowerCase());
    return Array.from(set);
  },
  hasPos(w, key) {
    return !!(w && Array.isArray(w._p) && w._p.indexOf(key) >= 0);
  },

  /* 取指定词表池： 'cet4' | 'cet6' | 'all' */
  pool(list) {
    if (list === 'cet4') return this.cet4.slice();
    if (list === 'all') return this._all.slice();
    return this.cet6.slice();
  },

  find(word) {
    if (word == null) return null;
    return this._index[String(word).toLowerCase()] || null;
  },

  /* 显示的词性标签：优先用预计算的 _p，取不到就标「词」 */
  posOf(w) {
    const p = (w && Array.isArray(w._p)) ? w._p : [];
    return p.length ? p[0] : '词';
  },

  /* 主要词性（n / v / adj / adv），用于主题模式与统计 */
  posKey(w) {
    const p = (w && Array.isArray(w._p)) ? w._p : [];
    if (p.indexOf('n') >= 0) return 'n';
    if (p.indexOf('v') >= 0) return 'v';
    if (p.indexOf('adj') >= 0) return 'adj';
    if (p.indexOf('adv') >= 0) return 'adv';
    return '';
  },

  /* 中文释义清洗：
     「v. 1. 抛弃，放弃 2. 离弃(家园…) 3. 遗弃(妻、子女等)」
       → 「抛弃，放弃；离弃(家园…)」   */
  meaning(tr, max = 2) {
    let s = String(tr == null ? '' : tr).trim();
    if (!s) return '—';

    // 0) 有 7 条数据的音标被并进了释义里，而且 ph 字段是空的（写法有三种，见 PH_HEAD）。
    //    第一个汉字之前的那段里只要有「/」，整段就是音标 + 词性标记，切掉。
    //    （同一形状在 load() 里由 phFromTr 用来把音标捡回 ph，两处共用。）
    s = s.replace(PH_HEAD, '');

    // 0b) 方括号夹在句子中间的「另一个词性的读音」：
    //       「v. 拥护，提倡 [ˈædvəkɪt] n. 提倡者，拥护者」（advocate）
    //     词条自带的主音标已经在 ph 里（advocate → ˈædvəkeɪt），这段是重复的脏数据，
    //     不删就整段印到题面上。替换成一个空格而不是空串 ——
    //     后面接着的「n. / v.」还要靠前面那个空白才认得出是词性标记。
    s = s.replace(IPA_BRACKET, ' ');

    // 1) 擦掉词性标记。
    //    a) 「&」在本词库里只当词性连接符用，而且夹着空格写法还不统一（「v.&n.」「v. &n.」），
    //       甚至有「prep&conj.」这种漏了点号的脏数据。先统一焊成「.」，
    //       让它们变成一整串规规矩矩的词性标记，下一步才剥得干净。
    s = s.replace(/([a-z])\.?\s*&\s*/gi, '$1.');
    //    b) 剥掉整串词性标记：句首那串直接删干净；夹在句中的那串
    //       （「vt.使爆裂 vi.&n.爆炸」）用一个义项分隔符顶上，
    //       否则两个义项会被一个空格粘成「使爆裂 爆炸」这样的一句话。
    //       要反复剥到不再变化：「aux.v. vt.做，干，办」这种首尾相接的两串，
    //       一趟只吃得掉最前面那串，剩下的「vt.」还站在句首。
    const drop = function (_all, pre) {
      if (!pre) return '';
      return /\s/.test(pre) ? '；' : pre;
    };
    let prev;
    do { prev = s; s = s.replace(POS_RUN, drop); } while (s !== prev);

    // 2) 按「1. 2. 3.」义项编号切分
    let parts = s.split(/\s*\d+\s*[.、]\s*/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) parts = [s];

    /* 每一段都掐掉首尾的分隔符。这一步是必须的：切分点落在「1.」上时，
       前一段会以句子留下的「；」收尾（project → 「…项目；」），
       直接 join 就会印出「项目；；发射」这种双分号。
       顺手也把「中文标点前面多出来的空格」收掉：句中那串词性标记是被替换成
       「；」的，而它前面原本排着两三个空格（advocate → 「提倡 ；提倡者」）。 */
    parts = parts
      .map(p => p.replace(/\s{2,}/g, ' ')
                 .replace(/\s+([；;、，,。])/g, '$1')
                 .replace(/^[\s；;、,，]+|[\s；;、,，]+$/g, '')
                 .trim())
      .filter(Boolean);
    let out = parts.slice(0, max).join('；');
    out = out.replace(/^[\s；;、,，.。&]+/, '').replace(/[\s；;、,，&]+$/, '');
    out = out.replace(/；{2,}/g, '；');
    return out || s || '—';
  },

  /* 首字母提示： 单词 'abandon' → 'a _ _ _ _ _ _'
     空格 / 连字符 / 撇号 / 句点一律原样保留，不占「待填槽」。
     句点必须留在这里：判分**不忽略**句点（norm 只剥空格连字符撇号），
     `a.m` 打成 `am` 是错的。所以句点得直接亮出来告诉玩家这儿有个点，
     而不是混进一排 `_` 里 —— 否则槽位数就会比「N 字母」多，玩家按槽数去打必错。 */
  hintMask(word, reveal) {
    const w = String(word || '');
    const n = Math.max(0, Math.min(reveal | 0, w.length));
    let s = '';
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      if (/[\s\-'’.]/.test(c)) { s += c; continue; }
      s += i < n ? c : '_';
    }
    return s.split('').join(' ');
  },

  /* 单词的字母个数：只数英文字母，空格 / 连字符 / 撇号不算。
     题面要靠它提示「这词几个字母」，数法得跟玩家的直觉一致 ——
     玩家看到 'ice cream' 的第一反应是「8 个字母」，不是「9 个字符」。 */
  letterCount(word) {
    return String(word == null ? '' : word).replace(/[^a-zA-Z]/g, '').length;
  },

  /* 判分归一化：
     strict=false（宽松）→ 忽略大小写、空格、连字符、撇号 */
  norm(s, strict) {
    let x = String(s == null ? '' : s).trim().replace(/\u00A0/g, ' ');
    x = x.replace(/\s+/g, ' ');
    if (!strict) x = x.replace(/[\s\-'’]/g, '');
    return x.toLowerCase();
  },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
};
