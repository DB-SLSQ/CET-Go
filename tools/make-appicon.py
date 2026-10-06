# -*- coding: utf-8 -*-
"""
从 public/icon-512.png 生成 Android 需要的整套图标。

  python tools/make-appicon.py

产出（都写进 android/res/）：
  mipmap-*/ic_launcher.png             传统图标（API 26 以下、以及部分启动器用它）
  mipmap-*/ic_launcher_foreground.png   自适应图标的前景层（108dp 画布，内容缩进安全区）
  values/ic_launcher_background.xml     自适应图标的底色

为什么要拆前景/背景：Android 8.0 起图标会被系统裁成圆形、方形、水滴等不同形状，
整张图直接塞进去会被裁掉边角。规范是「前景只占中间 72/108，四周留白给你裁」，
所以这里把原图缩到 68% 再居中贴上去。
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'icon-512.png')
RES = os.path.join(ROOT, 'android', 'res')

BG = '#ffe3ec'          # 底：和界面主色（樱花粉）一脉相承
LEGACY = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
ADAPTIVE = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
SAFE = 0.68             # 前景内容占画布的比例，略小于 72/108 留点余量


def main():
    src = Image.open(SRC).convert('RGBA')

    for dens, px in LEGACY.items():
        d = os.path.join(RES, 'mipmap-' + dens)
        os.makedirs(d, exist_ok=True)
        src.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'), 'PNG')

    for dens, px in ADAPTIVE.items():
        d = os.path.join(RES, 'mipmap-' + dens)
        os.makedirs(d, exist_ok=True)
        canvas = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        inner = max(1, int(round(px * SAFE)))
        face = src.resize((inner, inner), Image.LANCZOS)
        off = (px - inner) // 2
        canvas.alpha_composite(face, (off, off))
        canvas.save(os.path.join(d, 'ic_launcher_foreground.png'), 'PNG')

    os.makedirs(os.path.join(RES, 'values'), exist_ok=True)
    with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                '<resources>\n'
                '    <color name="ic_launcher_background">%s</color>\n'
                '</resources>\n' % BG)

    print('图标已生成：')
    print('  传统  ', ', '.join('%s=%dpx' % (k, v) for k, v in LEGACY.items()))
    print('  自适应', ', '.join('%s=%dpx' % (k, v) for k, v in ADAPTIVE.items()), '(前景占 %d%%)' % (SAFE * 100))
    print('  底色  ', BG)


if __name__ == '__main__':
    main()
