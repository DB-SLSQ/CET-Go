/**
 * CET Go · 本地服务
 * ------------------------------------------------------------
 * 零第三方依赖，只用 Node 内置模块。
 *  - 静态托管 public/ 下的前端
 *  - /data/*.json 只读暴露离线词库
 *  - /api/state  GET 读取 / PUT 写入，数据落盘到 data/state.json
 *  - /api/ping   前端心跳；超过 IDLE_LIMIT 没有心跳则自动退出进程
 * 所有数据都在这台电脑上，不联网、不上传。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA, 'state.json');
const BACKUP_DIR = path.join(DATA, 'backup');

// 端口：取第一个纯数字参数；--keep-alive 开关让进程不因空闲而自动退出（仅供预览/调试）
// --lan 开关把服务绑到 0.0.0.0，让同一 Wi-Fi 下的手机也能打开（默认只绑本机 127.0.0.1）
const _args = process.argv.slice(2);
const KEEP_ALIVE = _args.includes('--keep-alive');
const LAN = _args.includes('--lan');
const _portArg = _args.find(a => /^\d+$/.test(a));
const PORT = Number(_portArg || 27656);
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const IDLE_LIMIT = 150 * 1000;   // 前端关闭后多久自动结束进程
const IS_LAN_HOST = HOST === '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

let lastPing = Date.now();
let everConnected = false;
let writeQueue = Promise.resolve();

function ensureDirs() {
  for (const d of [DATA, BACKUP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('[state] 读取失败，尝试备份恢复：', e.message);
    try {
      const files = fs.readdirSync(BACKUP_DIR).sort().reverse();
      for (const f of files) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8'));
          if (s && typeof s === 'object') return s;
        } catch (_) { /* 继续找下一个 */ }
      }
    } catch (_) { /* ignore */ }
    return null;
  }
}

function writeStateAtomic(state) {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
  // 每天留一份备份，最多保留 14 份
  const today = new Date().toISOString().slice(0, 10);
  const bak = path.join(BACKUP_DIR, `state-${today}.json`);
  if (!fs.existsSync(bak)) {
    try { fs.copyFileSync(STATE_FILE, bak); } catch (_) { /* ignore */ }
    try {
      const old = fs.readdirSync(BACKUP_DIR).filter(f => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      while (old.length > 14) fs.unlinkSync(path.join(BACKUP_DIR, old.shift()));
    } catch (_) { /* ignore */ }
  }
}

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendFile(res, file, noCache) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': noCache ? 'no-store' : 'public, max-age=3600'
    });
    res.end(buf);
  });
}

function readBody(req, limit = 24 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  everConnected = true;
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  try {
    /* ---------- 心跳 ---------- */
    if (pathname === '/api/ping') {
      lastPing = Date.now();
      const urls = IS_LAN_HOST
        ? lanAddresses().map(ip => 'http://' + ip + ':' + PORT + '/')
        : [];
      const hasPc = IS_LAN_HOST && fs.existsSync(PC_ZIP);
      const origin = urls.length ? urls[0].replace(/\/$/, '') : '';
      return json(res, 200, {
        ok: true,
        pid: process.pid,
        lan: IS_LAN_HOST,
        port: PORT,
        urls,
        pc: hasPc ? origin + '/pc' : null
      });
    }

    /* ---------- 把电脑版（绿色免安装包）发给别人 ----------
       另一台电脑连上同一个 Wi-Fi 就能下。
       包是 zip，解开双击「CET Go.vbs」就能玩，不用装 Node。 */
    if (pathname === '/pc') {
      if (!IS_LAN_HOST) return json(res, 404, { ok: false, error: 'not in lan mode' });
      if (!fs.existsSync(PC_ZIP)) {
        return json(res, 404, { ok: false, error: '还没打包，先在电脑上跑 tools/build-pc-zip.py' });
      }
      const st = fs.statSync(PC_ZIP);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': st.size,
        'Content-Disposition': 'attachment; filename="CETGo-PC.zip"',
        'Cache-Control': 'no-store'
      });
      return fs.createReadStream(PC_ZIP).pipe(res);
    }

    /* ---------- 游戏数据读写 ---------- */
    if (pathname === '/api/state') {
      if (req.method === 'GET') return json(res, 200, { ok: true, state: readState() });
      if (req.method === 'PUT' || req.method === 'POST') {
        const text = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(text); } catch (e) { return json(res, 400, { ok: false, error: 'JSON 解析失败' }); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return json(res, 400, { ok: false, error: '数据格式不合法' });
        }
        parsed.savedAt = new Date().toISOString();
        writeQueue = writeQueue.then(() => {
          ensureDirs();
          writeStateAtomic(parsed);
        });
        await writeQueue;
        return json(res, 200, { ok: true, savedAt: parsed.savedAt });
      }
      return json(res, 405, { ok: false, error: 'method not allowed' });
    }

    /* ---------- 手动备份 / 列出备份 ---------- */
    if (pathname === '/api/backup') {
      ensureDirs();
      const s = readState();
      if (!s) return json(res, 404, { ok: false, error: '暂无数据' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const f = path.join(BACKUP_DIR, `manual-${stamp}.json`);
      fs.writeFileSync(f, JSON.stringify(s), 'utf8');
      return json(res, 200, { ok: true, file: path.relative(ROOT, f) });
    }
    if (pathname === '/api/backup/list') {
      ensureDirs();
      const files = fs.readdirSync(BACKUP_DIR).sort().reverse()
        .map(f => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size }));
      return json(res, 200, { ok: true, files, path: BACKUP_DIR });
    }

    /* ---------- 退出应用（设置页的「退出」按钮） ---------- */
    if (pathname === '/api/quit') {
      json(res, 200, { ok: true });
      setTimeout(() => { console.log('收到退出请求，服务已关闭。'); process.exit(0); }, 300);
      return;
    }

    /* ---------- 打开数据文件夹 ---------- */
    if (pathname === '/api/open-dir') {
      try {
        require('child_process').execFile('explorer.exe', [DATA], () => { });
        return json(res, 200, { ok: true, dir: DATA });
      } catch (e) {
        return json(res, 500, { ok: false, error: String(e.message || e), dir: DATA });
      }
    }

    /* ---------- 静态资源 ---------- */
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { ok: false, error: 'method not allowed' });
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const target = path.resolve(PUB, '.' + pathname);
    if (!target.startsWith(PUB)) { res.writeHead(403); return res.end('403'); }
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      return sendFile(res, target, /\.(html|js|css)$/i.test(target));
    }
    // 词库等 data 目录只读暴露
    if (pathname.startsWith('/data/')) {
      const d = path.resolve(DATA, '.' + pathname.slice(5));
      if (d.startsWith(DATA) && fs.existsSync(d) && fs.statSync(d).isFile()) return sendFile(res, d, true);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (e) {
    console.error('[server]', e);
    json(res, 500, { ok: false, error: String(e.message || e) });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用 —— 应用可能已经在运行了。`);
    console.error(`直接打开 http://127.0.0.1:${PORT}/ 即可。`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

ensureDirs();

/* 找一个能对外访问的局域网 IPv4（手机要用它来打开这个页面）
   排序规则：常用私网段优先，169.254.x（链路本地，手机连不上）直接丢掉。 */
function lanAddresses() {
  const out = [];
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const it of ifaces[name] || []) {
        if (it.family !== 'IPv4' || it.internal) continue;
        const ip = it.address;
        if (/^169\.254\./.test(ip)) continue;      // 链路本地，没用
        let rank = 9;
        if (/^192\.168\./.test(ip)) rank = 0;      // 家用路由器最常见
        else if (/^10\./.test(ip)) rank = 1;
        else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) rank = 2;
        out.push({ ip, rank });
      }
    }
  } catch (_) { /* ignore */ }
  return out.sort((a, b) => a.rank - b.rank).map(o => o.ip);
}

/* 电脑版绿色包的位置：--lan 模式下 /pc 直链把它发给同一网络的其他电脑 */
const PC_ZIP = path.join(ROOT, 'dist', 'CETGo-PC.zip');

server.listen(PORT, HOST, () => {
  const when = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${when}] CET Go 已启动  http://127.0.0.1:${PORT}/`);
  if (IS_LAN_HOST) {
    const ips = lanAddresses();
    if (ips.length) {
      const web = 'http://' + ips[0] + ':' + PORT + '/';
      console.log('局域网访问（同一 Wi-Fi 下的其他设备，浏览器输入）：');
      ips.forEach(ip => console.log(`    http://${ip}:${PORT}/`));
      if (fs.existsSync(PC_ZIP)) {
        console.log('电脑版绿色包（发给同学 / 另一台电脑）：');
        console.log(`    ${web}pc`);
      }
    } else {
      console.log('没找到局域网地址 —— 确认这台电脑已连上 Wi-Fi / 网线。');
    }
    console.log('提示：此时同一网络下的设备都能读写本机数据，用完关掉窗口即可。');
  }
  console.log(`数据目录：${DATA}${KEEP_ALIVE ? '   [keep-alive]' : ''}`);
});

// 空闲自动退出：前端页面关掉后不再占资源
setInterval(() => {
  if (KEEP_ALIVE) return;
  if (everConnected && Date.now() - lastPing > IDLE_LIMIT) {
    console.log('前端已关闭，服务自动退出。');
    process.exit(0);
  }
}, 15000).unref?.();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
