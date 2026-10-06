/* ============================================================
   CET Go · 主逻辑
   ============================================================ */
(function () {
'use strict';

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

/* ---------------- 工具 ---------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function pad(n) { return n < 10 ? '0' + n : String(n); }
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function normAnswer(s, strict) {
  return Words.norm(s, strict);
}
function hearts(n) {
  n = Math.max(0, Math.min(9, n | 0));
  return n ? '♥'.repeat(n) : '—';
}
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + pad(s % 60);
}

let toastTimer = null;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'en-US';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

/* ---------------- 模式定义 ---------------- */
const MODES = {
  classic:  { key: 'classic',  name: '经典', en: 'CLASSIC',  icon: '★',
              desc: '无限出题 · 难度可选',
              detail: '稳扎稳打，答对连击加分' },
  rush:     { key: 'rush',     name: '极速', en: 'RUSH',     icon: '⚡',
              desc: '固定每题 5 秒',
              detail: '时间极短，连击就是一切' },
  survival: { key: 'survival', name: '生存', en: 'SURVIVAL', icon: '☠',
              desc: '固定 1 条命 · 错一次就结束',
              detail: '一次失误，满盘皆输' },
  topic:    { key: 'topic',    name: '主题', en: 'TOPIC',    icon: '◆',
              desc: '按词性分类出题',
              detail: '名词 / 动词 / 形容词 / 副词' }
};
const TOPICS = [
  { k: 'n',   label: '名词' },
  { k: 'v',   label: '动词' },
  { k: 'adj', label: '形容词' },
  { k: 'adv', label: '副词' }
];

/* ---------------- 难度 / 题量 ----------------
   对齐原作：难易度 ノーマル / ハード / 激ムズ / 地獄，出题数 7 / 10 / 16 */
const DIFFS = [
  { k: 'normal', name: 'NORMAL', cn: '普通', time: 15, lives: 3, hint: 3, minLen: 0,
    note: '15 秒 · 3 条命 · 提示 3 次' },
  { k: 'hard',   name: 'HARD',   cn: '困难', time: 10, lives: 3, hint: 2, minLen: 5,
    note: '10 秒 · 3 条命 · 提示 2 次 · 偏长词' },
  { k: 'geki',   name: '激ムズ', cn: '激难', time: 7,  lives: 2, hint: 1, minLen: 6,
    note: '7 秒 · 2 条命 · 提示 1 次 · 长词' },
  { k: 'hell',   name: 'HELL',   cn: '地狱', time: 5,  lives: 1, hint: 0, minLen: 8,
    note: '5 秒 · 1 条命 · 无提示 · 只出长词' }
];
const COUNTS = [7, 10, 16];

function diffOf(k) {
  for (let i = 0; i < DIFFS.length; i++) if (DIFFS[i].k === k) return DIFFS[i];
  return DIFFS[0];
}

/* ---------------- 持久化 ---------------- */
function defaultState() {
  return {
    version: 1,
    settings: {
      list: 'cet6',
      difficulty: 'normal',   // 难度档，决定时限 / 命数 / 提示次数 / 词长
      count: 10,              // 每局题量（7 / 10 / 16）
      hint: true,
      sound: true,
      speak: false,
      strict: false,
      fx: true,               // 粒子 / 闪屏 / 故障字效等视觉特效
      topic: 'n',
      lastMode: 'classic',
      lives: 3,               // 旧字段：已被难度档取代，保留只为兼容老存档
      timeLimit: 15
    },
    records: {
      classic:  { best: 0, plays: 0 },
      rush:     { best: 0, plays: 0 },
      survival: { best: 0, plays: 0 },
      topic:    { best: 0, plays: 0 }
    },
    wrongbook: {},
    history: [],
    days: {},
    savedAt: null
  };
}

let S = null;          // 持久化状态
let G = null;          // 当前对局
let saveTimer = null, saving = false, dirty = false;

function mergeState(def, saved) {
  const o = JSON.parse(JSON.stringify(def));
  if (!saved || typeof saved !== 'object') return o;
  if (saved.settings && typeof saved.settings === 'object') Object.assign(o.settings, saved.settings);
  if (saved.records && typeof saved.records === 'object') {
    for (const k of Object.keys(o.records)) {
      if (saved.records[k] && typeof saved.records[k] === 'object') {
        Object.assign(o.records[k], saved.records[k]);
      }
    }
  }
  if (saved.wrongbook && typeof saved.wrongbook === 'object' && !Array.isArray(saved.wrongbook)) o.wrongbook = saved.wrongbook;
  if (Array.isArray(saved.history)) o.history = saved.history.slice(0, 200);
  if (saved.days && typeof saved.days === 'object') o.days = saved.days;
  o.savedAt = saved.savedAt || null;
  return o;
}

async function loadState() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' }).then(x => x.json());
    if (r && r.ok && r.state) return mergeState(defaultState(), r.state);
  } catch (e) { /* ignore */ }
  return defaultState();
}

function save(immediate) {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, immediate ? 0 : 450);
}
async function doSave() {
  if (saving || !dirty) return;
  saving = true; dirty = false;
  try {
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(S)
    });
  } catch (e) { dirty = true; }
  saving = false;
  if (dirty) save();
}
function startHeartbeat() {
  setInterval(() => { fetch('/api/ping', { cache: 'no-store' }).catch(() => {}); }, 20000);
}

/* ---------------- 屏幕切换 ---------------- */
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  if (id === 's-game') setTimeout(() => { try { $('#gInput').focus(); } catch (e) {} }, 40);
  // 卡组要等这一屏真正显示出来（display:flex）才量得到宽度，否则居中算出来是 0
  if (id === 's-title') setTimeout(function () { sizeCards(); centerTrack(); }, 0);
}

/* ---------------- 弹窗 ---------------- */
function confirmBox(title, msg, okText, cancelText) {
  return new Promise(resolve => {
    const card = $('#modalCard');
    card.innerHTML =
      '<h3>' + esc(title) + '</h3><p>' + msg + '</p>' +
      '<div class="row">' +
        '<button class="btn primary" id="mkOk">' + esc(okText || '确定') + '</button>' +
        '<button class="btn ghost" id="mkNo">' + esc(cancelText || '取消') + '</button>' +
      '</div>';
    $('#modal').hidden = false;
    const done = v => { $('#modal').hidden = true; resolve(v); };
    card.querySelector('#mkOk').onclick = () => { SFX.click(); done(true); };
    card.querySelector('#mkNo').onclick = () => { SFX.click(); done(false); };
    card.querySelector('#mkOk').focus();
  });
}
function infoBox(title, msg, okText) {
  return new Promise(resolve => {
    const card = $('#modalCard');
    card.innerHTML =
      '<h3>' + esc(title) + '</h3><p>' + msg + '</p>' +
      '<div class="row"><button class="btn primary" id="mkOk">' + esc(okText || '知道了') + '</button></div>';
    $('#modal').hidden = false;
    card.querySelector('#mkOk').onclick = () => { $('#modal').hidden = true; resolve(true); };
    card.querySelector('#mkOk').focus();
  });
}

/* ---------------- 标题屏：卡组轮播 ---------------- */
function listLabel(v) {
  return v === 'cet4' ? 'CET4（3518 词）' : v === 'all' ? 'CET4 + CET6' : 'CET6（2271 词）';
}

let focusIdx = 0;                 // 当前选中的模式卡下标
function modeKeys() { return Object.keys(MODES); }

function renderTitle() {
  const track = $('#modeGrid');
  track.innerHTML = '';
  modeKeys().forEach(function (k, i) {
    const m = MODES[k];
    const el = document.createElement('button');
    el.className = 'car-card mc-' + k;
    el.setAttribute('data-key', k);
    el.innerHTML =
      '<img class="cc-art" src="/assets/mode-' + k + '.webp" alt="" draggable="false">' +
      '<span class="cc-tab">' + esc(m.name) + '<i class="cce">' + m.en + '</i></span>' +
      (k === 'classic' ? '<span class="cc-rec">推荐</span>' : '') +
      '<span class="cc-cap"><b>' + esc(m.desc) + '</b>' + esc(m.detail) + '</span>';
    el.onclick = function () {
      // 滑动翻页结束时浏览器会补发一次 click，别让它被当成点选
      if (swipeGuard) { swipeGuard = false; return; }
      SFX.unlock();
      SFX.click();
      // 点未选中的卡 = 先选它；点已选中的卡 = 直接开始
      if (i === focusIdx) startFlow(k); else setFocus(i);
    };
    track.appendChild(el);
  });
  buildDots();
  setFocus(Math.min(focusIdx, modeKeys().length - 1), true);
  renderTitleMeta();
}

/* 卡面尺寸：按视口实际可用空间算，不写死 vh —— 窗口一变矮，写死的高度会被 overflow 裁掉底边。
   两套模式：
     · 宽屏  —— 中间那张尽量吃满可用高度，两侧各露出 CARD_PEEK 像素，暗示「还能左右翻」；
     · 窄屏  —— 单卡铺满（手机），两侧完全让位，改由底部指示点提示还有别的模式。 */
const CARD_AR = 780 / 1000;      // 卡面素材宽高比
const CARD_GAP = 20;             // 与 .car-track 的 gap 保持一致
const CARD_SIDE = 0.9;           // 与 .car-card / .car-card.on 的 scale 保持一致
const CARD_SOLO = 760;           // 视口窄于它就切单卡模式（对齐 CSS 的窄屏断点）
const CARD_MAX_H = 760;          // 卡片高度上限，避免超大屏上卡片变成一堵墙
const CARD_PEEK = 54;            // 宽屏时两侧卡片至少露出的像素
const CARD_SOLO_AR_MIN = 0.70;   // 单卡模式的宽高比下限（比素材 0.78 更「高」）
/* 手机上竖向空间多、横向就那么宽，卡宽被屏幕锁死 —— 死守素材的 0.78 会让卡片
   只占半屏。允许把卡片做得更高（最矮到 0.70），溢出的是左右两侧的背景，
   object-fit:cover 自己裁掉，人物在正中，肉眼看不出。 */

function sizeCards() {
  const view = $('#carView');
  const track = $('#modeGrid');
  if (!view || !track) return;

  // padding 直接从计算样式读，改 CSS 不用回来同步这里的常数
  const cs = getComputedStyle(view);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availW = view.clientWidth - padX;
  const availH = view.clientHeight - padY;
  if (availW < 80 || availH < 80) return;      // 屏幕还没显示出来，等 show() 之后再算

  const solo = availW < CARD_SOLO;
  let cw, ch;
  if (solo) {
    ch = Math.min(availH, availW / CARD_SOLO_AR_MIN);   // 先按「最高能到多高」定高
    cw = Math.min(availW, ch * CARD_AR);               // 高度不够时自动收窄，保持素材比例
    ch = Math.min(ch, cw / CARD_SOLO_AR_MIN);          // 宽高比不得越过下限
  } else {
    // 中间那张必须完整落在视口里，同时两侧各留 CARD_PEEK 像素：
    // 邻卡的视觉内边缘 = ±(0.55w + gap)，要求它不越过「半个视口 − PEEK」，反解出宽度上限。
    // 0.55 = 半宽 0.5 + 缩放后露出的半宽 0.9/2；按「三张全尺寸」算会让卡片被硬压小。
    const wByPeek = (availW / 2 - CARD_GAP - CARD_PEEK) / 0.55;
    ch = Math.min(availH, wByPeek / CARD_AR, CARD_MAX_H);
    cw = ch * CARD_AR;
  }
  ch = Math.max(150, ch);
  cw = Math.max(110, cw);

  track.classList.toggle('solo', solo);
  // car-solo 挂在 body 上：CSS 靠它决定「显示指示点 / 收起箭头」，
  // 用同一个真源，免得 CSS 断点和这里的阈值各说各话
  document.body.classList.toggle('car-solo', solo);
  // --cw/--ch 设在 .car-view 上：卡片和两侧箭头都要读它（箭头靠它贴住卡片边缘）
  view.style.setProperty('--cw', Math.round(cw) + 'px');
  view.style.setProperty('--ch', Math.round(ch) + 'px');
}

/* 模式指示点：窄屏收起箭头后，靠它告诉手指「还有别的模式」，同时本身也可点 */
function buildDots() {
  const box = $('#carDots');
  if (!box) return;
  const keys = modeKeys();
  if (box.children.length === keys.length) return;
  box.innerHTML = '';
  keys.forEach(function (k, i) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'car-dot';
    b.setAttribute('aria-label', MODES[k].name);
    b.onclick = function () { SFX.unlock(); SFX.click(); setFocus(i); };
    box.appendChild(b);
  });
}
function paintDots() {
  const box = $('#carDots');
  if (!box) return;
  const kids = box.children;
  for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === focusIdx);
}

/* 读轨道当前的 translateX（过渡进行中读到的是中间值，正好用来算增量） */
function trackTranslateX(el) {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  let m = t.match(/^matrix\(([^)]+)\)$/);
  if (m) return parseFloat(m[1].split(',')[4]) || 0;
  m = t.match(/^matrix3d\(([^)]+)\)$/);
  if (m) return parseFloat(m[1].split(',')[12]) || 0;
  return 0;
}

/* 把选中的卡滑到视口正中间。
   不能用 offsetLeft 混算：.car-track 带 will-change:transform，它自己就成了
   卡片的 offsetParent，而 .car-view 的 offsetParent 是 .car —— 两套坐标系差着
   一个「箭头 + 间距」的宽度，算出来会整体偏左。
   改成比「卡片中心」和「视口中心」的实际差值，再把当前位移补回去，与布局无关。 */
let centerTarget = 0;                // centerTrack 算出的目标位移，跟手滑动时以它为基准

function centerTrack() {
  const view = $('#carView');
  const track = $('#modeGrid');
  if (!view || !track) return;
  const card = track.children[focusIdx];
  if (!card) return;
  const vr = view.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const cur = trackTranslateX(track);
  const dx = cur + (vr.left + vr.width / 2) - (cr.left + cr.width / 2);
  centerTarget = dx;
  track.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
}

/* 触控：左右滑动翻模式卡。判据很短（8px 定轴、44px 翻页），
   否则手指略微一抖就会把「点卡」吃掉。 */
let swipeState = null;
let swipeGuard = false;              // 滑动结束后浏览器补发的那次 click 要丢掉

function bindCarSwipe() {
  const car = document.querySelector('.car');
  if (!car) return;
  const TH = 44, LOCK = 8;

  car.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { swipeState = null; return; }
    swipeState = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, axis: '' };
  }, { passive: true });

  car.addEventListener('touchmove', function (e) {
    const s = swipeState;
    if (!s || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') swipeGuard = true;
    }
    if (s.axis !== 'x') return;      // 竖向手势交还给页面
    s.dx = dx;
    const track = $('#modeGrid');
    if (track) track.style.transform = 'translateX(' + (centerTarget + dx * 0.5).toFixed(1) + 'px)';
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  car.addEventListener('touchend', function () {
    const s = swipeState;
    swipeState = null;
    if (!s || s.axis !== 'x') return;
    const step = s.dx <= -TH ? 1 : (s.dx >= TH ? -1 : 0);   // 左滑 = 看下一个
    if (step) {
      const before = focusIdx;
      moveFocus(step);
      if (focusIdx === before) centerTrack();               // 已经在头/尾了，弹回原位
    } else {
      centerTrack();
    }
    setTimeout(function () { swipeGuard = false; }, 360);
  }, { passive: true });

  car.addEventListener('touchcancel', function () {
    const s = swipeState;
    swipeState = null;
    if (s && s.axis === 'x') centerTrack();
    setTimeout(function () { swipeGuard = false; }, 360);
  }, { passive: true });
}

function setFocus(i, silent) {
  const keys = modeKeys();
  focusIdx = Math.max(0, Math.min(keys.length - 1, i | 0));
  const cards = document.querySelectorAll('#modeGrid .car-card');
  for (let j = 0; j < cards.length; j++) cards[j].classList.toggle('on', j === focusIdx);

  const rec = S.records[keys[focusIdx]] || { best: 0, plays: 0 };
  $('#cfBest').textContent = rec.best || 0;
  $('#cfPlays').textContent = '已玩 ' + (rec.plays || 0) + ' 局';
  $('#carPrev').disabled = focusIdx === 0;
  $('#carNext').disabled = focusIdx === keys.length - 1;

  sizeCards();
  centerTrack();
  paintDots();
  if (!silent) SFX.move && SFX.move();
}

function moveFocus(step) {
  const n = modeKeys().length;
  const next = focusIdx + step;
  if (next < 0 || next >= n) return;
  setFocus(next);
}

function decide() {
  const k = modeKeys()[focusIdx];
  if (!k) return;
  SFX.unlock();
  SFX.click();
  startFlow(k);
}

function renderTitleMeta() {
  $('#ttlList').textContent = '词表：' + listLabel(S.settings.list) +
    (Words.loaded ? '（' + Words.pool(S.settings.list).length + ' 词）' : '');
  $('#wrongCount').textContent = Object.keys(S.wrongbook).length;
}

/* ---------------- 准备屏（準備 OK！） ---------------- */
let pending = null;      // 准备屏上待开局的配置

function startFlow(modeKey) {
  if (modeKey === 'topic') { openTopicPicker(); return; }
  openReady(modeKey);
}

function openTopicPicker() {
  const card = $('#modalCard');
  let html = '<h3>选择主题</h3><p>只出该词性的单词</p><div class="seg" style="flex-wrap:wrap;justify-content:center">';
  TOPICS.forEach(t => {
    html += '<button data-topic="' + t.k + '"' + (S.settings.topic === t.k ? ' class="on"' : '') + '>' + t.label + '</button>';
  });
  html += '</div><div class="row"><button class="btn ghost" id="mkNo">取消</button></div>';
  card.innerHTML = html;
  $('#modal').hidden = false;
  card.querySelectorAll('[data-topic]').forEach(b => {
    b.onclick = () => {
      const k = b.getAttribute('data-topic');
      S.settings.topic = k;
      save();
      $('#modal').hidden = true;
      SFX.click();
      openReady('topic', { topic: k });
    };
  });
  card.querySelector('#mkNo').onclick = () => { $('#modal').hidden = true; };
}

function openReady(modeKey, opts) {
  const m = MODES[modeKey];
  pending = { mode: modeKey, opts: opts || {} };

  $('#rdMode').textContent = m.en;
  $('#rdName').textContent = m.name;

  const dbox = $('#rdDiff');
  dbox.innerHTML = '';
  DIFFS.forEach(function (d) {
    const b = el('button', d.k === S.settings.difficulty ? 'on' : '',
      esc(d.cn) + '<i>' + esc(d.name) + '</i>');
    b.onclick = function () { SFX.click(); S.settings.difficulty = d.k; save(); openReady(modeKey, opts); };
    dbox.appendChild(b);
  });

  const over =
    modeKey === 'rush' ? '　※ 极速模式固定每题 5 秒' :
    modeKey === 'survival' ? '　※ 生存模式固定 1 条命' :
    modeKey === 'topic' ? '　※ 只出「' + topicLabel(pending.opts.topic || S.settings.topic) + '」' : '';
  $('#rdDiffNote').textContent = diffOf(S.settings.difficulty).note + over;

  const cbox = $('#rdCount');
  cbox.innerHTML = '';
  COUNTS.forEach(function (n) {
    const b = el('button', n === S.settings.count ? 'on' : '', n + ' 题');
    b.onclick = function () { SFX.click(); S.settings.count = n; save(); openReady(modeKey, opts); };
    cbox.appendChild(b);
  });

  $('#rdTip').textContent = '答完 ' + S.settings.count + ' 题即通关 · 时间条走完 = 单词撞到你脸上';
  show('s-ready');
}

function topicLabel(k) {
  for (let i = 0; i < TOPICS.length; i++) if (TOPICS[i].k === k) return TOPICS[i].label;
  return '全部';
}

function confirmReady() {
  if (!pending) return;
  const o = Object.assign({}, pending.opts, {
    difficulty: S.settings.difficulty,
    count: S.settings.count
  });
  SFX.ready();
  startGame(pending.mode, o);
}

function startGame(modeKey, opts) {
  opts = opts || {};
  const m = MODES[modeKey];
  if (!m || !Words.loaded) { toast('词库还没准备好', true); return; }

  let pool = opts.pool ? opts.pool.slice() : Words.pool(S.settings.list);

  if (modeKey === 'topic') {
    const key = opts.topic || S.settings.topic;
    const filtered = pool.filter(w => Words.hasPos(w, key));
    if (filtered.length >= 5) pool = filtered;
    else { toast('该词性词量太少，已改用全部词表'); }
  }

  // 只要「纯英文单词 + 有中文释义」的干净词条
  pool = pool.filter(w =>
    w && w.w &&
    /^[a-zA-Z][a-zA-Z\s'\-.]*$/.test(w.w) &&
    w.w.replace(/[^a-zA-Z]/g, '').length >= 2 &&
    Words.meaning(w.tr, 1) !== '—'
  );
  // 难度：长词软过滤（词量不够就退回全池，避免出不了题）
  const diff = diffOf(opts.difficulty || S.settings.difficulty);
  if (diff.minLen > 0) {
    const longer = pool.filter(w => w.w.replace(/[^a-zA-Z]/g, '').length >= diff.minLen);
    if (longer.length >= 30) pool = longer;
  }

  // 错题重练时词池本来就可能只有几个词，放宽下限
  const minPool = opts.practice ? 1 : 5;
  if (pool.length < minPool) { toast('可用词量不足，无法开局', true); return; }
  Words.shuffle(pool);

  const cfg = {
    time: modeKey === 'rush' ? 5 : diff.time,
    lives: modeKey === 'survival' ? 1 : diff.lives,
    hint: diff.hint,
    strict: !!S.settings.strict
  };
  // 错题重练按错词本走完即通关（count = 0 表示不按题量结束）
  const count = opts.practice ? 0 : (opts.count != null ? opts.count : S.settings.count);

  G = {
    mode: modeKey,
    practice: !!opts.practice,
    diff: diff, count: count,
    cfg: cfg,
    pool: pool,
    cursor: 0,
    cur: null, curAnswer: '',
    score: 0, combo: 0, maxCombo: 0, lives: cfg.lives,
    correct: 0, wrong: 0, qNo: 0, misses: 0,
    answers: [], wrongThisRound: [],
    startTs: Date.now(), deadline: 0, timer: null, raf: 0,
    paused: false, pauseLeft: 0, locked: false, over: false,
    reveal: 0, hintLeft: cfg.hint, curScale: 1
  };

  if (!G.practice) { S.settings.lastMode = modeKey; save(); }

  // 清理 UI
  $('#gScore').textContent = '0';
  $('#gCombo').textContent = '0';
  $('#gNo').textContent = '0';
  $('#gOf').textContent = count ? 'QUESTION / ' + count : 'QUESTION';
  $('#gLives').textContent = hearts(cfg.lives);
  $('#gComboCell').classList.remove('hot');
  $('#pauseBox').hidden = true;
  $('#gReveal').hidden = true;
  $('#gReveal').innerHTML = '';
  $('#gLen').hidden = true;      // 开局那一刻还没出题，别留个空标签
  resetRevealState();
  $('#timeFill').style.width = '100%';
  $('#timeBar').classList.remove('warn');

  updateHud();
  show('s-game');
  resetApproach();
  SFX.start();
  startApproachLoop();
  nextQuestion();
}

/* ---------------- 出题 ---------------- */
/* 提示掩码 → 字符槽 DOM。
   hintMask 返回的是「每个字符用空格隔开」的串（如 `a _ _ _`），
   这里拆开后渲染成：已揭开的亮字 / 未揭开的发光下划线槽 / 词间空隙。 */
function renderHint(mask) {
  return String(mask).split(' ').map(function (ch) {
    if (ch === '') return '<s></s>';                    // 单词之间的空隙
    if (ch === '_') return '<i class="u"></i>';         // 还没揭开
    if (/[a-zA-Z]/.test(ch)) return '<b>' + esc(ch) + '</b>';
    return '<span class="p">' + esc(ch) + '</span>';    // 连字符 / 撇号
  }).join('');
}

/* 释义逐字浮现：把每个字包成 span 并给递增的 animation-delay，
   形成「一个字一个字打出来」的节奏（换题时重新调用即可重播）。
   总时长封顶 700ms，长释义也不会拖得太久。 */
function typeCn(el, text) {
  if (!el) return;
  const chars = Array.from(String(text == null ? '' : text));
  let n = 0;
  let html = '';
  chars.forEach(function (ch) {
    if (ch === ' ') { html += ' '; return; }     // 词间空格不进槽，保留自然断行
    html += '<span style="animation-delay:' + Math.min(n * 32, 700) + 'ms">' + esc(ch) + '</span>';
    n++;
  });
  el.innerHTML = html;
}

function nextQuestion() {
  if (!G || G.over) return;

  // 题量答完 → 通关
  if (G.count && G.qNo >= G.count) { gameOver('clear'); return; }

  if (G.cursor >= G.pool.length) {
    if (G.practice) { gameOver('clear'); return; }
    Words.shuffle(G.pool); G.cursor = 0;
  }

  const w = G.pool[G.cursor++];
  G.cur = w;
  G.curAnswer = normAnswer(w.w, G.cfg.strict);
  G.locked = false;
  G.qNo++;
  G.misses = 0;                    // 本题打错几次（时间内可无限重试）
  G.hintLeft = G.cfg.hint;
  G.reveal = S.settings.hint ? 1 : 0;

  $('#gPos').textContent = Words.posOf(w);
  $('#gLv').textContent = w.lv || '';
  // 字母个数：出题瞬间就报数（下面那排槽也是这个长度，但数起来费眼）
  const nLet = Words.letterCount(w.w);
  $('#gLen').hidden = !nLet;
  $('#gLen').innerHTML = nLet ? '<b>' + nLet + '</b> 字母' : '';
  typeCn($('#gCn'), Words.meaning(w.tr, 2));   // 释义逐字浮现
  charaMood('n');                              // 新题 → 回到平常表情
  $('#gHint').hidden = false;
  $('#gHint').innerHTML = renderHint(Words.hintMask(w.w, G.reveal));
  $('#gReveal').hidden = true;
  $('#gReveal').innerHTML = '';
  resetRevealState();
  $('#btnSpeak').disabled = true;

  const inp = $('#gInput');
  inp.value = '';
  inp.disabled = false;
  $('#btnSubmit').disabled = false;

  updateHud();
  resetApproach();
  fitVerse();          // 极矮窗口下释义本身就放不下，出题时也要先收一次
  SFX.enter();
  if (document.activeElement !== inp) inp.focus();
  startTimer();
}

function updateHud() {
  if (!G) return;
  $('#gScore').textContent = G.score;
  $('#gCombo').textContent = G.combo;
  $('#gNo').textContent = G.qNo;
  $('#gLives').textContent = hearts(G.lives);
  $('#gComboCell').classList.toggle('hot', G.combo >= 3);
  $('#hintLeft').textContent = '(' + G.hintLeft + ')';
  $('#btnHint').disabled = G.hintLeft <= 0;
}

/* ---------------- 从远到近的逼近演出 ----------------
   刚出题时单词在很远的地方（小、暗、糊），
   随着时间流逝一路压过来；时间条走完 = 正好撞到你脸上。 */
/* 近端上限特意压在 1.3：再大长释义就会被屏幕裁掉，读不了就没法答题了。
   配合 .cn{max-width:68%}，就算最长的释义放大到 1.3 倍也仍然完整可见。 */
const FAR_SCALE = 0.50;
const NEAR_SCALE = 1.30;
/* 逼近到这个进度就是"撞到脸"：给一记白闪 + 震屏，
   再往后 3.5% 的时间才真正超时，形成"撞上 → TIME UP"的两拍节奏。 */
const IMPACT_AT = 0.965;
let lastBlur = -1;

function approachScale(p) {
  return FAR_SCALE + (NEAR_SCALE - FAR_SCALE) * Math.pow(p, 0.92);
}

function paintApproach() {
  if (!G || !G.cfg || G.over || G.locked || G.paused) return;
  if (!$('#s-game').classList.contains('show')) return;

  const total = G.cfg.time * 1000;
  const left = Math.max(0, G.deadline - Date.now());
  const p = Math.min(1, Math.max(0, 1 - left / total));   // 0 刚出题 → 1 时间耗尽
  const d = 1 - p;                                        // 1 最远 → 0 贴脸

  const s = approachScale(p);
  G.curScale = s;
  const card = $('#card');
  card.style.transform = 'scale(' + s.toFixed(4) + ')';

  // 雾：远处浓，靠近散开。
  // 上限压到 .24：浅色场景里雾是"白雾"，比原来的暗角更吃字，
  // 太浓会让刚出题的一瞬根本看不清释义（题都没看清就没法答题）。
  $('#fog').style.opacity = (Math.pow(d, 1.6) * 0.24).toFixed(3);

  // 远景略带模糊（只在远处做，省性能；同样别糊过头）
  const blur = d > 0.5 ? (d - 0.5) * 1.7 : 0;
  if (Math.abs(blur - lastBlur) > 0.08) {
    lastBlur = blur;
    card.style.filter = blur > 0.03 ? 'blur(' + blur.toFixed(2) + 'px)' : '';
  }

  // 冲刺速度线：最后 45% 时间才出现
  const rp = Math.max(0, (p - 0.55) / 0.45);
  const rush = $('#rush');
  rush.style.opacity = (rp * 0.42).toFixed(3);
  rush.style.transform = 'scale(' + (0.75 + rp * 1.05).toFixed(3) + ')';

  $('#timeFill').style.width = ((1 - p) * 100) + '%';
  $('#timeBar').classList.toggle('warn', (1 - p) <= 0.3);

  // 贴脸撞上来的一瞬：白闪 + 震屏。
  // paintApproach 每帧都会跑（rAF + 60ms 心跳两路），用标志位保证一题只炸一次。
  if (p >= IMPACT_AT && !G.impacted) {
    G.impacted = true;
    impact();
  }
}

function startApproachLoop() {
  if (!G) return;
  if (G.raf) cancelAnimationFrame(G.raf);
  const step = function () {
    if (!G || G.over) { if (G) G.raf = 0; return; }
    paintApproach();
    G.raf = requestAnimationFrame(step);
  };
  G.raf = requestAnimationFrame(step);
}

function resetApproach() {
  if (G) G.impacted = false;              // 新题重新允许"撞脸"
  const im = $('#impact');
  if (im) im.classList.remove('on');
  const card = $('#card');
  card.style.transition = '';
  card.style.transform = 'scale(' + FAR_SCALE + ')';
  card.style.filter = '';
  lastBlur = -1;
  const fog = $('#fog');
  fog.style.transition = '';
  fog.style.opacity = '0.45';
  const rush = $('#rush');
  rush.style.transition = '';
  rush.style.opacity = '0';
  rush.style.transform = 'scale(.75)';
}

/* 定格到指定大小：作答/超时后停住，方便看清答案 */
function freezeApproach(target, delay) {
  if (!G) return;
  setTimeout(function () {
    if (!G || G.over) return;
    const card = $('#card');
    card.style.transition = 'transform .22s ease-out, filter .22s ease-out';
    card.style.transform = 'scale(' + target.toFixed(4) + ')';
    card.style.filter = '';
    lastBlur = -1;
    const fog = $('#fog');
    fog.style.transition = 'opacity .22s ease-out';
    fog.style.opacity = '0';
    const rush = $('#rush');
    rush.style.transition = 'opacity .22s ease-out';
    rush.style.opacity = '0';
    setTimeout(function () {
      card.style.transition = '';
      fog.style.transition = '';
      rush.style.transition = '';
    }, 300);
  }, delay || 0);
}

function screenShake() {
  const g = $('#depth');
  g.classList.remove('shake');
  void g.offsetWidth;
  g.classList.add('shake');
}

/* 撞到脸的瞬间：全屏白光 + 一条水平撕裂线 + 震屏 + 低频轰鸣。
   这是「从远到近」的收尾打击 —— 玩家不答，字就真的怼上来。 */
function impact() {
  const el = $('#impact');
  if (el) {
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }
  screenShake();
  SFX.impact();
}

/* 印章：正解！ / × / TIME UP */
function stamp(text, kind) {
  const s = $('#stamp');
  s.className = 'stamp';
  s.textContent = text;
  void s.offsetWidth;
  s.classList.add('show');
  if (kind) s.classList.add(kind);

  // 印章出现时才让舞台顶部留出空间（平时不占位）；
  // 动画 0.66s，留 0.7s 后撤掉，避免文字被顶偏
  const dep = $('#depth');
  if (dep) {
    dep.classList.add('stamping');
    clearTimeout(stamp._t);
    stamp._t = setTimeout(function () { dep.classList.remove('stamping'); }, 700);
  }
}

/* ---------------- 计时 ---------------- */
function startTimer() {
  if (!G) return;
  clearInterval(G.timer);
  G.deadline = Date.now() + G.cfg.time * 1000;
  G.lastTickSec = -1;
  tickTimer();
  G.timer = setInterval(tickTimer, 60);
}
function tickTimer() {
  if (!G || G.over || G.paused || G.locked) return;
  // 兜底：窗口失焦时 requestAnimationFrame 会被节流，靠这个 60ms 心跳把逼近演出补上
  paintApproach();
  const left = G.deadline - Date.now();
  const sec = Math.ceil(left / 1000);
  if (sec !== G.lastTickSec) {
    G.lastTickSec = sec;
    if (sec <= 5 && sec > 0) SFX.tick();
  }
  if (left <= 0) onTimeout();
}

/* ---------------- 作答 ---------------- */
function submitAnswer() {
  if (!G || G.over || G.paused || G.locked) return;
  const raw = $('#gInput').value;
  if (!String(raw).trim()) {
    $('#gInput').classList.add('bad');
    setTimeout(() => { try { $('#gInput').classList.remove('bad'); } catch (e) {} }, 200);
    return;
  }
  judge(raw);
}

function judge(raw) {
  const ok = normAnswer(raw, G.cfg.strict) === G.curAnswer;
  /* 时间没走完，打错不算输：抖一下、清掉输入，接着试（无限次）。
     只有时间走完才判这题失败 —— 见 onTimeout。 */
  if (!ok) { onMiss(); return; }

  G.locked = true;
  clearInterval(G.timer);
  freezeApproach(1.0, 0);          // 单词停住并回到能看清的大小
  const inp = $('#gInput');
  inp.disabled = true;
  $('#btnSubmit').disabled = true;

  onCorrect(G.cur);
}

/* 时间内打错：不扣命、不亮答案、不锁题。
   反馈要「够明显但不挡事」：输入框红闪 + 震屏 + 断连击 + 看板娘沮丧。
   连击只在一次打对时才保得住 —— 无限重试不能等于白送分。 */
function onMiss() {
  G.misses = (G.misses || 0) + 1;
  G.combo = 0;
  const inp = $('#gInput');
  inp.value = '';
  inp.classList.add('bad');
  setTimeout(function () { try { inp.classList.remove('bad'); } catch (e) {} }, 340);
  try { inp.focus(); } catch (e) {}
  SFX.wrong();
  charaMood('s');
  flash('bad');
  screenShake();
  updateHud();
}

function onCorrect(w) {
  G.combo++;
  G.maxCombo = Math.max(G.maxCombo, G.combo);

  const total = G.cfg.time * 1000;
  const left = Math.max(0, G.deadline - Date.now());
  const timeBonus = Math.round(left / total * 50);
  const comboBonus = Math.min(G.combo, 12) * 10;
  let gain = 100 + timeBonus + comboBonus;
  if (G.hintLeft < 3) gain = Math.round(gain * (G.hintLeft <= 1 ? 0.4 : 0.7));
  G.score += gain;
  G.correct++;
  G.answers.push({ w: w.w, ok: true, m: G.misses });

  // 答对 → 错题本计数消减
  const rec = S.wrongbook[w.w];
  if (rec) {
    rec.c = (rec.c || 1) - 1;
    if (rec.c <= 0) delete S.wrongbook[w.w];
    else rec.last = Date.now();
  }

  SFX.correct(G.combo);
  SFX.stamp();
  charaMood('h');                  // 答对 → 看板娘欢呼
  flash('ok');
  cardAnim('ok');
  stamp('正解！', 'ok');
  updateHud();
  popCombo();
  burst(G.combo >= 5 ? 26 : 18, 'ok');
  punch($('#gScore'));
  if (G.combo >= 3) punch($('#gCombo'));

  showReveal(w, '+ ' + gain);
  setTimeout(() => {
    if (!G || G.over) return;
    nextQuestion();
  }, 950);
}

function onWrong(w, reason) {
  G.combo = 0;
  G.lives--;
  G.wrong++;
  G.answers.push({ w: w.w, ok: false, m: G.misses });
  if (G.wrongThisRound.indexOf(w.w) < 0) G.wrongThisRound.push(w.w);

  const rec = S.wrongbook[w.w] || { c: 0, last: 0 };
  rec.c = (rec.c || 0) + 1;
  rec.last = Date.now();
  S.wrongbook[w.w] = rec;

  if (reason === 'timeout') { SFX.crash(); stamp('TIME UP', 'bad'); }
  else { SFX.wrong(); stamp('✕', 'bad'); }
  charaMood('s');                  // 答错/超时 → 看板娘沮丧
  flash('bad');
  cardAnim('bad');
  screenShake();
  burst(12, 'bad');
  updateHud();
  save();

  showReveal(w, reason === 'timeout' ? 'TIMEOUT' : 'WRONG');

  const wait = G.lives <= 0 ? 1600 : 1500;
  setTimeout(() => {
    if (!G || G.over) return;
    if (G.lives <= 0) gameOver('dead');
    else nextQuestion();
  }, wait);
}

function onTimeout() {
  if (!G || G.over || G.locked) return;
  G.locked = true;
  clearInterval(G.timer);
  // 单词正好糊到脸上 → 先定格在最大，再退回能看清的大小
  freezeApproach(NEAR_SCALE, 0);
  setTimeout(function () { freezeApproach(1.0, 0); }, 640);
  $('#gInput').disabled = true;
  $('#btnSubmit').disabled = true;
  onWrong(G.cur, 'timeout');
}

/* 揭晓的答案是一个「不会断行」的英文单词：misunderstanding 这种长词
   在窄屏按全局字号会直接顶出卡片。这里按实际渲染宽度二分式收字号，
   以量到的 scrollWidth 为准（不受 transform 影响），比按字数猜字体宽度可靠。 */
function sizeAnswer(text) {
  const rw = document.querySelector('.reveal .rw');
  const depth = $('#depth');
  if (!rw || !depth) return;
  const availW = depth.clientWidth * 0.76 - 8;      // .verse 的宽度上限，留 8px 余量
  let px = Math.min(depth.clientWidth * 0.10, 64);   // 起点：不大于桌面观感的上限
  rw.style.fontSize = px.toFixed(1) + 'px';
  let guard = 0;
  while (rw.scrollWidth > availW && px > 15 && guard++ < 40) {
    px *= 0.93;
    rw.style.fontSize = px.toFixed(1) + 'px';
  }
}

function showReveal(w, tag) {
  const box = $('#gReveal');
  const short = Words.meaning(w.tr, 2);      // 题面已经显示过的
  const full = Words.meaning(w.tr, 3);
  // 题面写过的释义不再重复一遍；只有当完整释义确实更多时才补在下面
  const extra = full && full !== short ? full : '';

  box.innerHTML =
    '<div class="rw">' + esc(w.w) + '</div>' +
    (w.ph ? '<div class="rph">/' + esc(w.ph) + '/</div>' : '') +
    (extra ? '<div class="rtr">' + esc(extra) + '</div>' : '');
  box.hidden = false;
  // 答案把文字块撑高，收起顶部印章留白，把空间还给内容（CSS: .depth.answered）
  $('#depth').classList.add('answered');
  $('#gHint').hidden = true;
  $('#gLen').hidden = true;      // 答案都亮出来了，字母数就没意义了
  $('#btnSpeak').disabled = false;
  sizeAnswer(w.w);
  fitVerse();
  if (S.settings.speak) speak(w.w);
}

/* 题面自适应：内容（释义 + 答案）高于舞台时整体等比缩小，
   保证任何窗口尺寸下都完整可见，且不改变长宽比。
   注意：scale 写在 .verse 上会与 .card 的逼近 scale 叠加，二者互不干扰。 */
function fitVerse() {
  const depth = $('#depth');
  const cardEl = $('#card');
  const verse = document.querySelector('.verse');
  if (!depth || !verse || !cardEl) return;

  verse.style.transform = '';
  const cs = getComputedStyle(cardEl);
  // 真正能用的高度要扣掉 .card 自己的上下内边距
  const avail = cardEl.clientHeight -
                parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);

  // 关键：题卡一路会被放大到 NEAR_SCALE（贴脸那一瞬最大）。
  // 只拿布局高度跟 avail 比是"没开倍率"的假账——长释义会在贴脸时
  // 才突然顶出屏幕。这里直接按最坏情况（放满 1.30 倍）估，一次算准。
  //
  // 内容高度只能用 .verse 自己的布局盒（offsetHeight），**不能用 scrollHeight**：
  // .verse::before 是一块 180% 高的柔光装饰，绝对定位在 .verse 里，
  // 会把 scrollHeight 顶到布局盒的 1.4 倍。拿它当"需要多少高度"，
  // 等于每一题都多缩 40% —— 320px 手机上题面字号实测被压到 10.9px，
  // 而它本来能到 14px。子块万一真的溢出盒子，再取子块下沿兜底。
  let need = verse.offsetHeight;
  for (let i = 0; i < verse.children.length; i++) {
    const el = verse.children[i];
    if (el.hidden) continue;
    need = Math.max(need, el.offsetTop + el.offsetHeight);   // offsetParent 就是 .verse
  }
  need *= NEAR_SCALE;

  // 但 .card 自己的内容盒可能比舞台还高（矮窗口下部会被压扁），
  // 这种情况下真正能用的只有舞台高度本身，还要再除一次倍率换算回 1:1 坐标。
  // 少了这一步，横屏手机（420px 高的舞台配 127 字释义）会把题面顶到输入框上。
  // 同理这里要的是舞台的**内容盒**：矮屏给 .depth 垫了 6px 下内边距（给输入区
  // 留气口），题面在内容盒里居中，拿 clientHeight 当上限就会溢出到内边距里去。
  const ds = getComputedStyle(depth);
  const byStage = (depth.clientHeight - parseFloat(ds.paddingTop || 0) -
                   parseFloat(ds.paddingBottom || 0)) / NEAR_SCALE;

  // 横向同一笔账：被 .verse 框住的子元素本身可能比 .verse 还宽（音标、长释义行），
  // 纵向比例看不出这种溢出。`.verse` 宽 = 76% ≈ 舞台宽的 1/NEAR_SCALE，
  // 所以「最宽子元素 × NEAR_SCALE」不能超过舞台宽。
  let widest = 0;
  for (let i = 0; i < verse.children.length; i++) {
    const el = verse.children[i];
    if (el.hidden) continue;
    widest = Math.max(widest, el.scrollWidth || 0);
  }
  const needW = widest * NEAR_SCALE;
  const availW = depth.clientWidth;

  // 留 0.5% 余量：题面在贴脸那一帧是被 transform 放大的，浏览器按设备像素对齐，
  // 一个几百像素高的盒子外沿会挪动零点几像素。812x375 上实测就差这 0.3px 出屏。
  // 宁可留余量，也不去放宽测试的容差 —— 容差一放宽，真正的溢出也会被一起吞掉。
  const FIT_SAFE = 0.995;
  const availH = Math.min(avail, byStage) * FIT_SAFE;
  if (!availH || !need) return;
  let k = 1;
  if (need > availH) k = availH / need;
  if (availW && needW > availW * FIT_SAFE) k = Math.min(k, (availW * FIT_SAFE) / needW);
  if (k < 1) {
    // 下限 32%：再往下就真的看不清了。只有「横屏手机 + 词库里最长的条目」
    // 这种极端组合会摸到这个底，此时宁可挤一点也要让内容完整可见。
    // 取三位小数时向下取整：四舍五入有可能把 k 抬回去，刚才那点余量就白留了。
    k = Math.max(0.32, Math.floor(Math.min(k, 0.999) * 1000) / 1000);
    verse.style.transform = 'scale(' + k.toFixed(3) + ')';
  }
}

/* 换下一题时把「已作答」状态和题面缩放恢复 */
function resetRevealState() {
  const dep = $('#depth');
  if (dep) dep.classList.remove('answered');
  const verse = document.querySelector('.verse');
  if (verse) verse.style.transform = '';
}

/* ---------------- 环境与看板娘 ---------------- */
/* 樱花花瓣：只生成一次 DOM，之后全靠 CSS 动画循环，不占每帧开销。
   用负的 animation-delay 让开场时花瓣就已经散布在空中，而不是从零开始落。 */
function plantPetals() {
  const box = $('#petals');
  if (!box) return;
  let html = '';
  for (let i = 0; i < 18; i++) {
    const size = 6 + Math.random() * 8;
    const left = Math.random() * 100;
    const dur = 9 + Math.random() * 11;
    const delay = -Math.random() * 18;
    const dx = Math.random() * 200 - 70;      // 横向漂移：整体被风往右推
    const rt = Math.random() * 900 - 450;
    const op = 0.45 + Math.random() * 0.5;
    html += '<i style="left:' + left.toFixed(2) + '%;' +
            'width:' + size.toFixed(1) + 'px;' +
            'height:' + (size * 0.82).toFixed(1) + 'px;' +
            '--dx:' + dx.toFixed(0) + 'px;--rt:' + rt.toFixed(0) + 'deg;' +
            'opacity:' + op.toFixed(2) + ';' +
            'animation-duration:' + dur.toFixed(1) + 's;' +
            'animation-delay:' + delay.toFixed(1) + 's"></i>';
  }
  box.innerHTML = html;
}

/* 看板娘表情：n 平常 / h 高兴 / s 沮丧。
   三张立绘同画布、底部中心对齐，所以这里只切 data-mood，不会位移。 */
function charaMood(m) {
  const el = $('#chara');
  if (!el || el.dataset.mood === m) return;
  el.dataset.mood = m;
  el.classList.remove('mood-pop');
  void el.offsetWidth;
  if (m !== 'n') el.classList.add('mood-pop');   // 高兴/沮丧时轻轻弹一下
}

/* ---------------- 动画 ---------------- */
function flash(kind) {
  const f = $('#flash');
  f.className = 'flash';
  void f.offsetWidth;
  f.classList.add(kind);
}
function cardAnim(kind) {
  const c = $('#card');
  c.classList.remove('ok', 'bad');
  void c.offsetWidth;
  c.classList.add(kind);
}
function popCombo() {
  const el = $('#gComboCell');
  el.classList.remove('combo-pop');
  void el.offsetWidth;
  el.classList.add('combo-pop');
}
/* 数字弹跳（分数/连击变化时用） */
function punch(el) {
  if (!el || !fxOn()) return;
  el.classList.remove('punch');
  void el.offsetWidth;
  el.classList.add('punch');
}

/* ---------------- 粒子特效 ---------------- */
function fxOn() { return !!(S && S.settings && S.settings.fx); }

/* 从舞台中心向四周炸开一把像素火花 */
function burst(n, kind) {
  if (!fxOn()) return;
  const layer = $('#fx');
  if (!layer) return;
  let host = $('#depth');
  if (!host || !host.getBoundingClientRect().width) host = $('#card');
  if (!host) return;
  const r = host.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  const pal = kind === 'ok'
    ? ['#2fe8d0', '#7dffa8', '#ffd63d', '#ffffff']
    : ['#ff4d6d', '#ff5cc8', '#ffd63d', '#ffffff'];

  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const dist = 80 + Math.random() * 280;
    const size = 3 + Math.random() * 6;
    const color = pal[i % pal.length];
    el.style.cssText =
      'left:' + cx + 'px;' +
      'top:' + cy + 'px;' +
      'width:' + size + 'px;' +
      'height:' + size + 'px;' +
      'background:' + color + ';' +
      'color:' + color + ';' +
      'animation-delay:' + (Math.random() * 90).toFixed(0) + 'ms;' +
      '--dx:' + (Math.cos(ang) * dist).toFixed(1) + 'px;' +
      '--dy:' + (Math.sin(ang) * dist).toFixed(1) + 'px;' +
      '--rt:' + (Math.random() * 720 - 360).toFixed(0) + 'deg;';
    layer.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 1150);
  }
}

/* 纸屑：从屏幕顶部往下飘，用在通关结算 */
function confetti(n) {
  if (!fxOn()) return;
  const layer = $('#fx');
  if (!layer) return;
  const pal = ['#2fe8d0', '#7dffa8', '#ffd63d', '#ff5cc8', '#ff4d6d', '#ffffff'];
  const W = window.innerWidth;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    const size = 5 + Math.random() * 7;
    const color = pal[i % pal.length];
    el.style.cssText =
      'left:' + (Math.random() * W).toFixed(0) + 'px;' +
      'top:-20px;' +
      'width:' + size + 'px;' +
      'height:' + (size * 0.6).toFixed(1) + 'px;' +
      'background:' + color + ';' +
      'color:' + color + ';' +
      'animation:confettiFall ' + (1.5 + Math.random() * 1.4).toFixed(2) + 's linear ' +
        (Math.random() * 0.45).toFixed(2) + 's forwards;' +
      '--dx:' + (Math.random() * 160 - 80).toFixed(0) + 'px;' +
      '--rt:' + (Math.random() * 1080 - 540).toFixed(0) + 'deg;';
    layer.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 3400);
  }
}

/* ---------------- 提示 / 朗读 / 跳过 / 暂停 ---------------- */
function useHint() {
  if (!G || G.over || G.locked || G.paused) return;
  const w = G.cur;
  if (!w) return;
  if (G.hintLeft <= 0) { toast('本题提示已用完'); return; }
  if (G.reveal >= w.w.length) { toast('已经没有可揭示的字母了'); return; }
  G.reveal = Math.min(w.w.length, G.reveal + 1);
  G.hintLeft--;
  $('#gHint').innerHTML = renderHint(Words.hintMask(w.w, G.reveal));
  updateHud();
  SFX.hint();
}
function speakCurrent() {
  if (!G || !G.cur) return;
  if ($('#gReveal').hidden) return;
  speak(G.cur.w);
}
function skipQuestion() {
  if (!G || G.over || G.locked || G.paused) return;
  G.locked = true;
  clearInterval(G.timer);
  freezeApproach(1.0, 0);
  $('#gInput').disabled = true;
  $('#btnSubmit').disabled = true;
  onWrong(G.cur, 'skip');
}
function pauseGame() {
  if (!G || G.over || G.paused || G.locked) return;
  G.paused = true;
  G.pauseLeft = Math.max(0, G.deadline - Date.now());
  clearInterval(G.timer);
  $('#pauseBox').hidden = false;
}
function resumeGame() {
  if (!G || G.over || !G.paused) return;
  G.paused = false;
  G.deadline = Date.now() + G.pauseLeft;
  clearInterval(G.timer);
  G.timer = setInterval(tickTimer, 60);
  $('#pauseBox').hidden = true;
  $('#gInput').focus();
}
async function quitGame(fromPause) {
  if (!G || G.over) return;
  if (!fromPause) {
    const ok = await confirmBox('结束本局？', '本局成绩会正常记录。', '结束', '继续玩');
    if (!ok) return;
  }
  setTimeout(() => gameOver('quit'), 120);
}

/* ---------------- 结算 ---------------- */
function gameOver(reason) {
  if (!G || G.over) return;
  G.over = true;
  clearInterval(G.timer);
  if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
  $('#pauseBox').hidden = true;

  const dur = Date.now() - G.startTs;
  const answered = G.correct + G.wrong;
  const acc = answered ? Math.round(G.correct / answered * 100) : 0;
  let isBest = false;

  if (!G.practice) {
    const rec = S.records[G.mode] || (S.records[G.mode] = { best: 0, plays: 0 });
    rec.plays = (rec.plays || 0) + 1;
    isBest = G.score > (rec.best || 0);
    if (isBest) rec.best = G.score;

    S.history.unshift({ mode: G.mode, score: G.score, acc: acc, combo: G.maxCombo, ts: Date.now() });
    S.history = S.history.slice(0, 100);

    const k = todayKey();
    const day = S.days[k] || (S.days[k] = { games: 0, words: 0, correct: 0, ms: 0 });
    day.games++;
    day.words += answered;
    day.correct += G.correct;
    day.ms += dur;
  }

  save(true);

  if (reason === 'clear' || isBest) SFX.best(); else SFX.over();
  renderOver(reason, { dur: dur, answered: answered, acc: acc, isBest: isBest });
}

function renderOver(reason, stat) {
  const titleEl = $('#overTitle');
  titleEl.classList.remove('win');
  if (reason === 'dead') { titleEl.textContent = 'GAME OVER'; }
  else if (reason === 'clear') { titleEl.textContent = 'CLEAR!'; titleEl.classList.add('win'); }
  else { titleEl.textContent = G.practice ? 'DONE' : 'FINISH'; }

  $('#oScore').textContent = G.score;
  $('#oNewBest').hidden = !stat.isBest;
  punch($('#oScore'));

  // 评级：正确率为主，连击与得分加权；没打完（挂掉）要扣一点
  const cleared = reason === 'clear';
  const rv = stat.acc * 0.55 + Math.min(G.maxCombo, 14) * 2.4 +
             Math.min(G.score / 70, 18) - (cleared ? 0 : 12);
  const rank = rv >= 76 ? 'S' : rv >= 58 ? 'A' : rv >= 40 ? 'B' : rv >= 22 ? 'C' : 'D';
  const rankEl = $('#oRank');
  if (rankEl) {
    rankEl.setAttribute('data-r', rank);
    rankEl.querySelector('b').textContent = rank;
  }

  $('#oGrid').innerHTML = [
    ['✔ 答对', G.correct],
    ['✘ 答错', G.wrong],
    ['% 正确率', stat.acc + '%'],
    ['★ 最高连击', G.maxCombo],
    ['⏱ 用时', fmtDur(stat.dur)],
    ['◆ 题型', G.practice ? '错题重练' : (MODES[G.mode] ? MODES[G.mode].name : '—')]
  ].map(function (p) {
    return '<div class="stat"><small>' + p[0] + '</small><b>' + p[1] + '</b></div>';
  }).join('');

  if (cleared || stat.isBest) confetti(cleared ? 60 : 30);

  const list = $('#oWrongList');
  const uniq = G.wrongThisRound.filter(function (v, i, a) { return a.indexOf(v) === i; });
  $('#oWrongN').textContent = uniq.length;
  if (!uniq.length) {
    list.innerHTML = '<div class="ow-empty">全对，一个错的都没有 🎉</div>';
    $('#btnRetryWrong').disabled = true;
  } else {
    list.innerHTML = uniq.map(function (key) {
      const w = Words.find(key);
      if (!w) return '';
      return '<div class="ow-item"><span class="w">' + esc(w.w) + '</span>' +
             '<span class="t">' + esc(Words.meaning(w.tr, 2)) + '</span></div>';
    }).join('');
    $('#btnRetryWrong').disabled = false;
  }

  show('s-over');
}

/* ---------------- 设置屏 ---------------- */
function el(tag, cls, html) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}
function seg(options, current, onChange) {
  const box = el('div', 'seg');
  options.forEach(function (o) {
    const b = el('button', o[0] === current ? 'on' : '', esc(o[1]));
    b.onclick = function () { SFX.click(); onChange(o[0]); };
    box.appendChild(b);
  });
  return box;
}
function stepper(min, max, step, value, onChange, fmt) {
  const box = el('div', 'stepper');
  const minus = el('button', '', '−');
  const val = el('div', 'val', esc(fmt ? fmt(value) : String(value)));
  const plus = el('button', '', '＋');
  minus.onclick = function () {
    const v = Math.max(min, value - step);
    if (v !== value) { SFX.click(); onChange(v); }
  };
  plus.onclick = function () {
    const v = Math.min(max, value + step);
    if (v !== value) { SFX.click(); onChange(v); }
  };
  box.appendChild(minus); box.appendChild(val); box.appendChild(plus);
  return box;
}
function switchEl(value, onChange) {
  const s = el('div', 'sw' + (value ? ' on' : ''));
  s.appendChild(el('i'));
  s.onclick = function () { SFX.click(); onChange(!value); };
  return s;
}
function setRow(label, sub, ctl) {
  const r = el('div', 'set-row');
  const l = el('div', 'lb', esc(label) + (sub ? '<i>' + esc(sub) + '</i>' : ''));
  const c = el('div', 'ctl');
  c.appendChild(ctl);
  r.appendChild(l); r.appendChild(c);
  return r;
}

function renderSettings() {
  const box = $('#setList');
  box.innerHTML = '';
  const s = S.settings;

  box.appendChild(setRow('词表范围', '从哪些大纲词里抽题（约 ' +
    (Words.loaded ? Words.pool(s.list).length : 0) + ' 词）',
    seg([['cet4', 'CET4'], ['cet6', 'CET6'], ['all', '全部']], s.list, function (v) {
      s.list = v; save(); renderSettings(); renderTitleMeta();
    })));

  box.appendChild(setRow('默认难度', diffOf(s.difficulty).note + '　·　开局前随时能改',
    seg(DIFFS.map(function (d) { return [d.k, d.cn]; }), s.difficulty, function (v) {
      s.difficulty = v; save(); renderSettings();
    })));

  box.appendChild(setRow('默认题量', '每局出多少题，答完就是通关',
    seg(COUNTS.map(function (n) { return [n, n + ' 题']; }), s.count, function (v) {
      s.count = v; save(); renderSettings();
    })));

  box.appendChild(setRow('首字母提示', '开局默认显示单词首字母',
    switchEl(s.hint, function (v) { s.hint = v; save(); renderSettings(); })));

  box.appendChild(setRow('音效', '8-bit 合成音效',
    switchEl(s.sound, function (v) { s.sound = v; SFX.on = v; if (v) SFX.click(); save(); renderSettings(); })));

  box.appendChild(setRow('答后朗读', '答完后用系统语音读出单词',
    switchEl(s.speak, function (v) { s.speak = v; save(); renderSettings(); if (v) speak('hello'); })));

  box.appendChild(setRow('严格判分', '开启后必须逐字拼对；关闭则忽略大小写、空格与连字符',
    switchEl(s.strict, function (v) { s.strict = v; save(); renderSettings(); })));

  box.appendChild(setRow('视觉特效', '粒子火花、闪屏、霓虹流光与故障字效',
    switchEl(s.fx, function (v) {
      s.fx = v; save(); renderSettings();
      if (v) { burst(16, 'ok'); }
      else { const f = $('#fx'); if (f) f.innerHTML = ''; }
    })));

  // 数据操作
  const openDir = el('button', 'btn ghost sm', '打开数据文件夹');
  openDir.onclick = function () {
    fetch('/api/open-dir').catch(function () {});
    toast('已打开数据文件夹');
  };
  box.appendChild(setRow('数据位置', '所有记录只存在这台电脑上', openDir));

  const backup = el('button', 'btn ghost sm', '立即备份');
  backup.onclick = async function () {
    try {
      const r = await fetch('/api/backup').then(function (x) { return x.json(); });
      toast(r.ok ? '已备份到 ' + r.file : '备份失败', !r.ok);
    } catch (e) { toast('备份失败', true); }
  };
  box.appendChild(setRow('手动备份', '把当前记录另存一份', backup));

  const wipe = el('button', 'btn ghost sm', '清空所有记录');
  wipe.onclick = async function () {
    const ok = await confirmBox('清空所有记录？',
      '将删除 <b>最高分、错题本、历史统计</b>，无法恢复。', '确认清空', '算了');
    if (!ok) return;
    S = defaultState();
    SFX.on = true;
    save(true);
    await doSave();
    renderSettings(); renderTitleMeta();
    toast('记录已清空');
  };
  box.appendChild(setRow('清空记录', '重置一切进度与设置', wipe));

  const quit = el('button', 'btn ghost sm', '退出应用');
  quit.onclick = async function () {
    const ok = await confirmBox('退出应用？', '关闭本地服务并关掉窗口。', '退出', '取消');
    if (!ok) return;
    try { await fetch('/api/quit'); } catch (e) {}
    // 先尝试直接关窗；关不掉就提示一句
    try { window.close(); } catch (e) {}
    setTimeout(function () {
      if (document.visibilityState === 'hidden') return;
      toast('服务已退出，点右上角 × 关闭窗口');
    }, 400);
  };
  box.appendChild(setRow('退出应用', '关闭后台本地服务', quit));

  $('#btnSetBack').textContent = '返回';
}

/* ---------------- 错题本屏 ---------------- */
function wrongItems() {
  return Object.keys(S.wrongbook).map(function (k) {
    const w = Words.find(k);
    return w ? { key: k, w: w, c: S.wrongbook[k].c || 1, last: S.wrongbook[k].last || 0 } : null;
  }).filter(Boolean).sort(function (a, b) { return (b.c - a.c) || (b.last - a.last); });
}
function renderWrong() {
  const items = wrongItems();
  const box = $('#wrongList');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<div class="ow-empty">还没有错词，先去玩一局吧</div>';
  } else {
    items.forEach(function (it) {
      const r = el('div', 'ow-item');
      r.innerHTML = '<span class="w">' + esc(it.w.w) + '</span>' +
        (it.w.ph ? '<span class="t">/' + esc(it.w.ph) + '/</span>' : '') +
        '<span class="t">' + esc(Words.meaning(it.w.tr, 2)) + '</span>' +
        '<span class="c">×' + it.c + '</span>';
      box.appendChild(r);
    });
  }
  $('#btnWrongPractice').disabled = items.length < 1;
  $('#btnWrongClear').disabled = items.length < 1;
  $('#wrongCount').textContent = items.length;
}

function practiceWrong() {
  const items = wrongItems();
  if (!items.length) { toast('错题本是空的'); return; }
  const pool = items.map(function (x) { return x.w; });
  startGame('classic', { pool: pool, practice: true });
}

/* ---------------- 事件绑定 ---------------- */
function bindEvents() {
  // 标题屏
  $('#btnSettings').onclick = function () { SFX.click(); renderSettings(); show('s-set'); };
  $('#btnWrong').onclick = function () { SFX.click(); renderWrong(); show('s-wrong'); };
  $('#carPrev').onclick = function () { SFX.unlock(); moveFocus(-1); };
  $('#carNext').onclick = function () { SFX.unlock(); moveFocus(1); };
  $('#btnDecide').onclick = function () { decide(); };
  $('#btnHelp').onclick = function () {
    SFX.click();
    infoBox('玩法', [
      '单词从<b>远处朝你压过来</b>，你来拼出它 —— 时间条走完，它就撞到你脸上。',
      '',
      '屏幕给出<b>中文释义</b>，拼出对应的<b>英文单词</b>，回车提交。',
      '时间内<b>打错不扣命</b>：抖一下接着改，可以无限次重试；' +
      '只有<b>超时</b>才扣一条命并亮出正确答案。',
      '连击越高单题加分越多；用「提示」会扣分。',
      '',
      '<b>四种模式</b>：经典 · 极速（每题 5 秒）· 生存（1 条命）· 主题（按词性）。',
      '<b>四档难度</b>：普通 / 困难 / 激难 / 地狱 —— 决定时限、命数、提示次数和词长。',
      '<b>题量</b>：7 / 10 / 16 题，答完就是通关。',
      '',
      '错过的词会自动进「错题本」，可一键重练。',
      '',
      '出品：<b>深蓝书签</b> · <a href="https://space.bilibili.com/484110391" target="_blank" rel="noopener">space.bilibili.com/484110391</a><br>粉丝群：<b>1124017564</b>（左下角水印点击即复制）'
    ].join('<br>'));
  };

  // 作者水印：点「粉丝群」复制群号（127.0.0.1 是安全上下文走剪贴板 API，
  // 局域网 IP 分享时不是 https，得退回 execCommand 兜底）
  $('#wmGroup').onclick = async function () {
    SFX.click();
    const num = '1124017564';
    let copied = false;
    try {
      await navigator.clipboard.writeText(num);
      copied = true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = num;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      } catch (e2) { copied = false; }
    }
    if (copied) toast('粉丝群号已复制：' + num);
    else toast('复制失败，群号：' + num, true);
  };

  // 准备屏
  $('#btnReady').onclick = function () { confirmReady(); };
  $('#btnReadyBack').onclick = function () { SFX.click(); renderTitle(); show('s-title'); };

  // 游戏屏
  $('#btnSubmit').onclick = function () { submitAnswer(); };
  $('#gInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
  });
  $('#btnHint').onclick = function () { useHint(); };
  $('#btnSpeak').onclick = function () { speakCurrent(); };
  $('#btnSkip').onclick = function () { skipQuestion(); };
  $('#btnPause').onclick = function () { SFX.click(); pauseGame(); };
  $('#btnQuit').onclick = function () { quitGame(false); };
  $('#btnResume').onclick = function () { SFX.click(); resumeGame(); };
  $('#btnGiveUp').onclick = function () { quitGame(true); };

  // 结算屏
  $('#btnAgain').onclick = function () {
    SFX.click();
    const mode = G ? G.mode : 'classic';
    if (G && G.practice) practiceWrong(); else startGame(mode);
  };
  $('#btnRetryWrong').onclick = function () { SFX.click(); practiceWrong(); };
  $('#btnHome').onclick = function () { SFX.click(); renderTitle(); show('s-title'); };

  // 设置屏
  $('#btnSetBack').onclick = function () { SFX.click(); renderTitle(); show('s-title'); };

  // 错题本屏
  $('#btnWrongPractice').onclick = function () { SFX.click(); practiceWrong(); };
  $('#btnWrongClear').onclick = async function () {
    const ok = await confirmBox('清空错题本？', '删除全部 ' + Object.keys(S.wrongbook).length + ' 个错词记录。', '清空', '取消');
    if (!ok) return;
    S.wrongbook = {};
    save(true);
    renderWrong(); renderTitleMeta();
    toast('错题本已清空');
  };
  $('#btnWrongBack').onclick = function () { SFX.click(); renderTitle(); show('s-title'); };

  // 全局
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modal').hidden) $('#modal').hidden = true;
    // 标题屏：← → 换卡，回车/空格 决定（鼠标党用两侧箭头和「决定」按钮，功能等价）
    if ($('#modal').hidden && $('#s-title').classList.contains('show')) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); SFX.unlock(); moveFocus(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); SFX.unlock(); moveFocus(1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); decide(); }
    }
  });
  window.addEventListener('beforeunload', function () { try { navigator.sendBeacon && navigator.sendBeacon('/api/ping'); } catch (e) {} });
}

/* ---------------- 启动 ---------------- */
async function init() {
  S = await loadState();
  SFX.on = !!S.settings.sound;

  try {
    const n = await Words.load();
    $('#bootMsg').textContent = '词库就绪 · ' + n + ' 词';
  } catch (e) {
    $('#bootMsg').innerHTML = '词库加载失败：' + esc(e.message) + '<br>请确认 data/ 下的词库文件存在。';
    return;
  }

  bindEvents();
  renderTitle();
  renderTitleMeta();
  show('s-title');
  startHeartbeat();
  plantPetals();

  document.addEventListener('pointerdown', function () { SFX.unlock(); }, { once: true });
  bindCarSwipe();
  window.addEventListener('blur', function () { if (G && !G.over && !G.paused && !G.locked) pauseGame(); });

  // 窗口尺寸变化时重算题面缩放，避免拉伸后内容出界
  let rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (G && !G.over) fitVerse();
      if ($('#s-title').classList.contains('show')) { sizeCards(); centerTrack(); }
    }, 120);
  });
}

/* 供自测脚本/控制台调试读取当前状态（不影响正常使用） */
window.App = {
  start: init,
  getState: function () { return S; },
  getGame: function () { return G; },
  MODES: MODES,
  DIFFS: DIFFS,
  COUNTS: COUNTS,
  openReady: openReady,
  confirmReady: confirmReady,
  startGame: startGame,
  startFlow: startFlow,
  judge: judge,
  onTimeout: onTimeout,
  showReveal: showReveal,
  fitVerse: fitVerse,
  /* 自测用：把攒在防抖里的存档立刻落盘。 */
  flushSave: function () { dirty = true; return doSave(); },
  typeCn: typeCn,
  charaMood: charaMood,
  plantPetals: plantPetals,
  impact: impact,
  nextQuestion: nextQuestion,
  approachScale: approachScale,
  paintApproach: paintApproach,
  FAR_SCALE: FAR_SCALE,
  NEAR_SCALE: NEAR_SCALE,
  IMPACT_AT: IMPACT_AT,
  /* 调试/截图用：直接跳屏、直接结算、直接渲染子页 */
  _show: show,
  _gameOver: gameOver,
  _renderSettings: renderSettings,
  _renderWrong: renderWrong,
  _renderTitle: renderTitle,
  _submit: submitAnswer,
  // 标题屏卡组（截图/自测用）
  setFocus: setFocus,
  moveFocus: moveFocus,
  decide: decide,
  centerTrack: centerTrack,
  sizeCards: sizeCards,
  buildDots: buildDots,
  Words: Words
};
document.addEventListener('DOMContentLoaded', init);

})();
