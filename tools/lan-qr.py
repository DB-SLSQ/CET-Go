# -*- coding: utf-8 -*-
"""
生成「手机访问 CET Go」的二维码，贴在屏幕上拿手机扫一下就能打开。

用法：
    python tools/lan-qr.py                # 自动取本机局域网 IP + 默认端口 27656
    python tools/lan-qr.py 192.168.1.9    # 指定 IP
    python tools/lan-qr.py 192.168.1.9 27656   # 指定 IP 和端口

输出：docs/lan-qr.png（以及终端里的一份字符版，方便直接看）

依赖：pip install qrcode  （纯 Python，无需 Pillow 也能出 ASCII 版；
      装了 Pillow 才会同时输出 PNG）
"""
import socket
import sys
import os

PORT_DEFAULT = 27656
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'lan-qr.png')


def lan_ip():
    """拿到本机在同一 Wi-Fi 下的地址。用 UDP connect 探一下出口路由，
    不会真的发包，只是让内核选一张网卡 —— 比遍历网卡更准。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


def main():
    ip = sys.argv[1] if len(sys.argv) > 1 else lan_ip()
    port = sys.argv[2] if len(sys.argv) > 2 else str(PORT_DEFAULT)
    url = 'http://%s:%s/' % (ip, port)

    try:
        import qrcode
    except ImportError:
        print('缺少 qrcode 库：pip install qrcode')
        return 1

    # box_size 要够大：这张图是给「手机对着显示器扫」用的，
    # 太小的话（10 → 290px）站远一点就对不上焦。留 4 格静默区是规范要求的下限之上。
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=16,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    # 终端里的字符版：手机扫不了屏，但能肉眼核对 IP 有没有写错
    qr.print_ascii(invert=True)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    try:
        img = qr.make_image(fill_color='#1b1520', back_color='#fdf4ee')
    except Exception:
        img = qr.make_image()
    img.save(OUT)

    print('地址：' + url)
    print('二维码：' + OUT)
    print('（用手机相机对着这一张扫，注意电脑和手机要在同一个 Wi-Fi）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
