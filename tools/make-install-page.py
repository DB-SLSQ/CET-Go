# -*- coding: utf-8 -*-
"""
把「怎么拿到 CET Go」做成一页自包含的 HTML —— 手机版 + 电脑版。

为什么不用现成的网页：
  · 这一页要在**电脑屏幕上打开给手机扫**，所以要能离线、单文件、双击就开
  · 二维码直接以 base64 内嵌，不依赖服务在跑，也不怕路径乱

用法：
    python tools/make-install-page.py [ip] [port]
输出：
    docs/install.html
"""
import base64
import os
import sys

PORT_DEFAULT = 27656
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')


def lan_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


def b64(path):
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')


def human(path):
    if not os.path.exists(path):
        return ''
    n = os.path.getsize(path)
    return ('%.1f MB' % (n / 1048576.0)) if n >= 1048576 else ('%d KB' % (n / 1024))


TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CET Go · 下载</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  min-height:100vh;
  font-family:"PingFang SC","Microsoft YaHei","Hiragino Sans GB",system-ui,sans-serif;
  color:#4c3542;
  background:
    radial-gradient(1200px 600px at 12% -8%, #ffe9f0 0%, transparent 60%),
    radial-gradient(900px 520px at 100% 0%, #eaf3ff 0%, transparent 62%),
    radial-gradient(900px 700px at 50% 118%, #fff2e0 0%, transparent 60%),
    linear-gradient(180deg,#fffaf6 0%,#fdf4ee 100%);
  padding:34px 20px 46px;
  display:flex;justify-content:center;
}
.wrap{width:100%;max-width:940px}

.head{text-align:center;margin-bottom:26px}
.kicker{
  display:inline-block;font-size:12px;letter-spacing:.22em;font-weight:700;
  color:#c96b8b;background:#fff;border:1px solid #ffd8e4;
  padding:5px 14px;border-radius:999px;margin-bottom:12px;
  box-shadow:0 4px 14px rgba(255,168,196,.22);
}
h1{font-size:31px;line-height:1.25;letter-spacing:.01em}
h1 em{font-style:normal;color:#e2729a}
.sub{margin-top:9px;font-size:13.5px;color:#8a7480}

.grid{display:grid;grid-template-columns:320px 1fr;gap:22px;align-items:start}
.grid + .grid{margin-top:24px}

.card{
  background:rgba(255,255,255,.86);
  border:1px solid #ffe0ea;
  border-radius:24px;
  padding:22px;
  box-shadow:0 12px 34px rgba(214,158,180,.16), 0 2px 6px rgba(214,158,180,.08);
  backdrop-filter:blur(6px);
}

.sechead{
  font-size:17px;font-weight:800;color:#5d3b4a;margin-bottom:18px;
  padding-bottom:12px;border-bottom:2px dashed #ffe1ea;
}

.qrwrap{text-align:center}
.qrwrap .cap{
  font-size:14px;font-weight:800;margin-bottom:14px;color:#7b5a68;
  letter-spacing:.03em;
}
.qrwrap img{
  width:100%;max-width:262px;display:block;margin:0 auto;
  border-radius:16px;border:9px solid #fff;
  box-shadow:0 8px 24px rgba(200,140,165,.26);
}
.noqr{
  width:262px;height:262px;margin:0 auto;border-radius:16px;
  border:2px dashed #ffc9db;color:#b98aa0;font-size:14px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
}
.noqr span{font-size:11.5px;color:#c9a5b3}
.qrwrap .hint{margin-top:13px;font-size:12.5px;color:#96707f;line-height:1.75}
.qrwrap .hint b{color:#c9557d}

.steps{list-style:none}
.steps li{
  position:relative;padding:0 0 17px 40px;
  border-left:2px solid #ffe1ea;margin-left:13px;
}
.steps li:last-child{border-left-color:transparent;padding-bottom:0}
.steps li::before{
  content:attr(data-n);
  position:absolute;left:-14px;top:-2px;width:27px;height:27px;
  border-radius:50%;background:linear-gradient(160deg,#ffb3cc,#f686ac);
  color:#fff;font-size:13px;font-weight:800;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 11px rgba(238,124,164,.4);
}
.steps b{display:block;font-size:14.5px;margin-bottom:5px;color:#5d3b4a}
.steps p{font-size:13px;line-height:1.72;color:#7d6270}
.steps code{
  font-family:"Cascadia Code",Consolas,monospace;font-size:12.5px;
  background:#fff3f7;border:1px solid #ffdbe7;color:#c9557d;
  padding:2px 7px;border-radius:7px;word-break:break-all;
}

.manual{
  margin-top:20px;padding:15px 17px;border-radius:18px;
  background:linear-gradient(180deg,#fff8fb,#fff2f7);
  border:1px dashed #ffcbdd;
}
.manual .t{font-size:12.5px;font-weight:800;color:#b9779a;margin-bottom:8px;letter-spacing:.04em}
.manual .u{
  font-family:"Cascadia Code",Consolas,monospace;font-size:16px;font-weight:700;
  color:#d1568a;word-break:break-all;letter-spacing:.02em;
}
.manual .d{margin-top:7px;font-size:12px;color:#a98b98;line-height:1.65}

.two{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:24px}
.mini{display:flex;gap:15px;align-items:center}
.mini img{width:104px;border-radius:12px;border:6px solid #fff;box-shadow:0 6px 18px rgba(200,140,165,.22);flex:0 0 auto}
.mini .txt h3{font-size:14.5px;margin-bottom:6px;color:#5d3b4a}
.mini .txt p{font-size:12.5px;line-height:1.7;color:#7d6270}
.mini .txt .u{margin-top:7px;font-family:Consolas,monospace;font-size:12px;color:#c9557d;word-break:break-all}

.foot{
  margin-top:26px;text-align:center;font-size:12px;color:#a8919c;line-height:1.9;
}
.foot b{color:#c96b8b}

@media (max-width:820px){
  .grid{grid-template-columns:1fr}
  .two{grid-template-columns:1fr}
  h1{font-size:25px}
}
</style>
</head>
<body>
<div class="wrap">

  <div class="head">
    <div class="kicker">CET GO · 下载</div>
    <h1>下载 <em>CET Go</em></h1>
    <p class="sub">手机版 + 电脑版，都在这儿了 —— 扫一下就能拿</p>
  </div>

  <!-- ==================== 手机版 ==================== -->
  <div class="grid">
    <div class="card qrwrap">
      <div class="cap">📱 手机版 · 扫这张</div>
      __QR_APK__
      <div class="hint">
        安卓安装包 <b>__APK_MB__</b><br>
        完全离线 · 零权限 · 扫完直接下
      </div>
    </div>

    <div class="card">
      <div class="sechead">装到手机上</div>
      <ol class="steps">
        <li data-n="1">
          <b>手机连上同一个 Wi-Fi</b>
          <p>和这台电脑同一个路由器就行（手机热点不行）。</p>
        </li>
        <li data-n="2">
          <b>扫码，或者直接输地址</b>
          <p>地址是 <code>__APK_URL__</code> —— 打开就是下载，不用点别的。</p>
        </li>
        <li data-n="3">
          <b>装上（会拦一下，正常）</b>
          <p>安卓会提示「不允许安装未知来源应用」，去<b>设置</b>里给浏览器/微信放开权限，再回来点一次「安装」。</p>
        </li>
        <li data-n="4">
          <b>装完直接玩，不用联网</b>
          <p>词库在包里，飞行模式照样跑。分数、错题本存在手机上。</p>
        </li>
      </ol>

      <div class="manual">
        <div class="t">懒得扫码？手输这个</div>
        <div class="u">__APK_URL__</div>
        <div class="d">在手机浏览器地址栏敲进去，回车即可。</div>
      </div>
    </div>
  </div>

  <!-- ==================== 电脑版 ==================== -->
  <div class="grid">
    <div class="card qrwrap">
      <div class="cap">💻 电脑版 · 扫这张</div>
      __QR_PC__
      <div class="hint">
        Windows 绿色免安装 <b>__PC_MB__</b><br>
        自带运行环境 · 解压双击就能玩
      </div>
    </div>

    <div class="card">
      <div class="sechead">装到电脑上（Windows）</div>
      <ol class="steps">
        <li data-n="1">
          <b>扫码下载，或者手输地址</b>
          <p>地址是 <code>__PC_URL__</code>，下到一个 <code>CETGo-PC.zip</code>。</p>
        </li>
        <li data-n="2">
          <b>解压到任意位置</b>
          <p>右键 →「全部解压缩」即可。放桌面、放 D 盘都行，文件夹整个拷走也能用。</p>
        </li>
        <li data-n="3">
          <b>双击里面的「CET Go.vbs」</b>
          <p>第一次会问「是否允许」，允许即可，然后游戏窗口就出来了。
            <b>不用装 Node.js</b> —— 包里的 node.exe 会自己用。
            万一 .vbs 被安全软件拦了，就改双击「CET Go.bat」。</p>
        </li>
      </ol>

      <div class="manual">
        <div class="t">懒得扫码？手输这个</div>
        <div class="u">__PC_URL__</div>
        <div class="d">在浏览器地址栏敲进去，回车即开始下载。__PC_MB__ 的包，本地网速几秒钟。</div>
      </div>
    </div>
  </div>

  <div class="two">
    <div class="card mini">
      __QR_APP_MINI__
      <div class="txt">
        <h3>不想装 · 先试试</h3>
        <p>手机浏览器直接开，功能一模一样，存档存在浏览器里。</p>
        <div class="u">__APP_URL__</div>
      </div>
    </div>
    <div class="card mini" style="display:block">
      <h3 style="font-size:14.5px;color:#5d3b4a;margin-bottom:8px">玩起来是这样的</h3>
      <p style="font-size:12.5px;line-height:1.8;color:#7d6270">
        看中文释义、限时拼英文单词，连击加分、答错自动进错题本。<br>
        难度四档（normal / hard / veryhard / hell），题量 7 / 10 / 16 自选。<br>
        词表 CET4(3518) / CET6(2271) / 全部，设置里切换。
      </p>
    </div>
  </div>

  <div class="foot">
    手机版 <b>CETGo.apk</b> · 包名 com.cetgo.app · 安卓 7.0 以上 · 签名 v2+v3 已验证 · 无网络权限<br>
    电脑版 <b>CETGo-PC.zip</b> · Windows 10 / 11 · 绿色免安装 · 完全离线
  </div>

</div>
</body>
</html>
"""


def qr_block(data, alt, mini=False):
    if not data:
        return '<div class="noqr">二维码没生成出来<br><span>（没装 qrcode 库）</span></div>'
    style = ' style="width:104px;max-width:none"' if mini else ''
    return '<img src="%s" alt="%s"%s>' % (data, alt, style)


def main():
    ip = sys.argv[1] if len(sys.argv) > 1 else lan_ip()
    port = sys.argv[2] if len(sys.argv) > 2 else str(PORT_DEFAULT)
    base = 'http://%s:%s/' % (ip, port)
    apk_url = base + 'apk'
    pc_url = base + 'pc'

    html = (TEMPLATE
            .replace('__QR_APK__', qr_block(b64(os.path.join(DOCS, 'qr-apk.png')), '下载安卓安装包'))
            .replace('__QR_PC__', qr_block(b64(os.path.join(DOCS, 'qr-pc.png')), '下载电脑版'))
            .replace('__QR_APP_MINI__', qr_block(b64(os.path.join(DOCS, 'qr-app.png')), '浏览器直接玩', mini=True))
            .replace('__APK_URL__', apk_url)
            .replace('__PC_URL__', pc_url)
            .replace('__APP_URL__', base)
            .replace('__APK_MB__', human(os.path.join(ROOT, 'dist', 'CETGo.apk')) or '2.1 MB')
            .replace('__PC_MB__', human(os.path.join(ROOT, 'dist', 'CETGo-PC.zip')) or '35 MB'))

    out = os.path.join(DOCS, 'install.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('已写出 %s' % out)
    print('手机版地址 %s' % apk_url)
    print('电脑版地址 %s' % pc_url)
    print('网页版地址 %s' % base)
    return 0


if __name__ == '__main__':
    sys.exit(main())
