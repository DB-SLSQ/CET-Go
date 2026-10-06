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
      // 前端靠这几个字段决定要不要亮出「手机玩」按钮：
      // 只有 --lan 启动 + 确实拿到了局域网地址时才亮。
      const urls = IS_LAN_HOST
        ? lanAddresses().map(ip => 'http://' + ip + ':' + PORT + '/')
        : [];
      const hasApk = IS_LAN_HOST && fs.existsSync(APK_FILE);
      const hasPc = IS_LAN_HOST && fs.existsSync(PC_ZIP);
      const origin = urls.length ? urls[0].replace(/\/$/, '') : '';
      return json(res, 200, {
        ok: true,
        pid: process.pid,
        lan: IS_LAN_HOST,
        port: PORT,
        urls,
        apk: hasApk ? origin + '/apk' : null,
        pc: hasPc ? origin + '/pc' : null,
        qr: LAN_QR.app ? '/api/lan-qr.png?t=app' : null,
        qrApk: LAN_QR.apk ? '/api/lan-qr.png?t=apk' : null,
        qrPc: LAN_QR.pc ? '/api/lan-qr.png?t=pc' : null
      });
    }

    /* ---------- 手机访问的二维码 ---------- */
    if (pathname === '/api/lan-qr.png') {
      const t = url.searchParams.get('t');
      const q = LAN_QR[t === 'apk' || t === 'pc' ? t : 'app'];
      if (!q) return json(res, 404, { ok: false, error: 'no qr' });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': q.length,
        'Cache-Control': 'no-store'
      });
      return res.end(q);
    }

    /* ---------- 把打包好的安装包发给手机 ----------
       手机连上同一个 Wi-Fi，扫「手机玩」里的码直接下载，不用数据线。
       只在局域网模式下开放：本机自用没有这个需求，少开一个口子。 */
    if (pathname === '/apk') {
      if (!IS_LAN_HOST) return json(res, 404, { ok: false, error: 'not in lan mode' });
      if (!fs.existsSync(APK_FILE)) {
        return json(res, 404, { ok: false, error: '还没打包，先在电脑上跑 tools/build-apk.sh' });
      }
      const st = fs.statSync(APK_FILE);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': st.size,
        'Content-Disposition': 'attachment; filename="CETGo.apk"',
        'Cache-Control': 'no-store'
      });
      return fs.createReadStream(APK_FILE).pipe(res);
    }

    /* ---------- 把电脑版（绿色免安装包）发给别人 ----------
       和 /apk 一个套路：手机或另一台电脑连上同一个 Wi-Fi 就能下。
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

/* ============================================================
   手机访问用的二维码
   ------------------------------------------------------------
   两张：一张指向网页版（手机浏览器直接玩），一张指向 /apk
   （扫码直接下载安装包，不用数据线）。用 Python 的 qrcode 库生成，
   缓存在内存里由 /api/lan-qr.png?t=app|apk 发出。
   为什么不自己写 QR 编码器：这是纯便利性的装饰功能，不值得让这个
   「零第三方依赖」的服务里多出两百行 Reed-Solomon。
   生成失败（没装 Python / 没装 qrcode）就静默跳过 ——
   前端会退化成「只显示网址，自己手输」，其余功能一切照旧。
   ============================================================ */
const APK_FILE = path.join(ROOT, 'dist', 'CETGo.apk');
const PC_ZIP = path.join(ROOT, 'dist', 'CETGo-PC.zip');
const LAN_QR = { app: null, apk: null, pc: null };

function pyCandidates() {
  const list = [];
  // 本机这台机器上装了 qrcode 的解释器优先（WorkBuddy 自带的隔离 venv）
  try {
    const home = require('os').homedir();
    const venv = path.join(home, '.workbuddy', 'binaries', 'python', 'envs', 'default',
      'Scripts', 'python.exe');
    if (fs.existsSync(venv)) list.push({ cmd: venv, args: [] });
  } catch (_) { /* ignore */ }
  // 系统里常见的那几个
  list.push({ cmd: 'py', args: ['-3'] });
  list.push({ cmd: 'python', args: [] });
  list.push({ cmd: 'python3', args: [] });
  return list;
}

const QR_PY = [
  'import sys, io, base64',
  'try:',
  '    import qrcode',
  'except ImportError:',
  '    sys.exit(3)',
  'q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=16, border=4)',
  'q.add_data(sys.argv[1]); q.make(fit=True)',
  'img = q.make_image(fill_color="#4c3542", back_color="#fffaf6")',
  'buf = io.BytesIO(); img.save(buf, "PNG")',
  'sys.stdout.write(base64.b64encode(buf.getvalue()).decode())'
].join('\n');

function makeQr(url) {
  const { execFileSync } = require('child_process');
  for (const c of pyCandidates()) {
    try {
      const out = execFileSync(c.cmd, c.args.concat(['-c', QR_PY, url]), {
        encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
      });
      const buf = Buffer.from(String(out).trim(), 'base64');
      if (buf.length > 100) return buf;
    } catch (_) { /* 换下一个解释器 */ }
  }
  return null;
}

server.listen(PORT, HOST, () => {
  const when = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${when}] CET Go 已启动  http://127.0.0.1:${PORT}/`);
  if (IS_LAN_HOST) {
    const ips = lanAddresses();
    if (ips.length) {
      const web = 'http://' + ips[0] + ':' + PORT + '/';
      console.log('手机访问（同一 Wi-Fi 下打开浏览器输入）：');
      ips.forEach(ip => console.log(`    http://${ip}:${PORT}/`));
      if (fs.existsSync(APK_FILE)) {
        console.log(`安装包直链（手机浏览器打开即下载）：`);
        console.log(`    ${web}apk`);
      } else {
        console.log('还没打包安装包 —— 先在电脑上跑 bash tools/build-apk.sh');
      }
      // 二维码只是「省得手输」的加分项，失败不该影响启动
      LAN_QR.app = makeQr(web);
      if (fs.existsSync(APK_FILE)) LAN_QR.apk = makeQr(web + 'apk');
      if (fs.existsSync(PC_ZIP)) LAN_QR.pc = makeQr(web + 'pc');
      console.log(LAN_QR.app
        ? '      游戏窗口右上角的「手机玩」里有二维码，扫一下就能打开。'
        : '      （没找到可用的 Python + qrcode，二维码不可用；地址照上面手输即可。）');
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
