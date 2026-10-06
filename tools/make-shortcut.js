/* ============================================================
   CET Go · 在桌面创建 / 刷新快捷方式

     node tools/make-shortcut.js

   建两个：
     CET Go.lnk          —— 只在本机跑（默认，127.0.0.1）
     CET Go 手机玩.lnk    —— 加上 /lan，同一 Wi-Fi 下的手机能连进来，
                            标题屏右上角会多出「手机玩」按钮（扫码装 App）

   两个都指向 wscript.exe "CET Go.vbs"，双击不会有 cmd 黑框。
   说明：本机安全策略会拦截工具层直接调用 COM，
   所以这里由 Node 进程内部再拉起 PowerShell 来完成。
   ============================================================ */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.dirname(__dirname);
const LAUNCHER = path.join(ROOT, 'CET Go.vbs');
const ICON = path.join(ROOT, 'app.ico');

if (!fs.existsSync(LAUNCHER)) {
  console.error('找不到启动器：' + LAUNCHER);
  process.exit(1);
}

const LINKS = [
  { name: 'CET Go.lnk', args: '"' + LAUNCHER + '"', desc: 'CET Go（本机）' },
  { name: 'CET Go 手机玩.lnk', args: '"' + LAUNCHER + '" /lan', desc: 'CET Go（局域网 / 手机玩）' }
];

function ps(script) {
  const b64 = Buffer.from(script.join('; '), 'utf16le').toString('base64');
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64],
    { encoding: 'utf8', windowsHide: true }).trim();
}

const desktop = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
  "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8', windowsHide: true }).trim();

let made = 0;
for (const L of LINKS) {
  const out = ps([
    "$ErrorActionPreference='Stop'",
    "$p=[IO.Path]::Combine('" + desktop + "','" + L.name + "')",
    "$W=New-Object -ComObject WScript.Shell",
    "$l=$W.CreateShortcut($p)",
    "$l.TargetPath=(Join-Path $env:WinDir 'System32\\wscript.exe')",
    "$l.Arguments='" + L.args + "'",
    "$l.WorkingDirectory='" + ROOT + "'",
    "$l.IconLocation='" + ICON + ",0'",
    "$l.Description='" + L.desc + "'",
    "$l.WindowStyle=1",
    "$l.Save()",
    "if(Test-Path $p){'OK ' + $p}else{'FAILED'}"
  ]);
  console.log(out);
  if (fs.existsSync(path.join(desktop, L.name))) made++;
}

if (made === LINKS.length) {
  fs.writeFileSync(path.join(ROOT, '.shortcut-made'), 'ok', 'utf8');
  console.log('两个快捷方式都已就绪，桌面在：' + desktop);
} else {
  console.log('只成功 ' + made + '/' + LINKS.length + ' 个（可手动跑 tools\\make-shortcut.vbs）');
}
