# -*- coding: utf-8 -*-
"""CET Go 卡面素材处理：把生成的竖版插画统一裁成同一比例的卡面。

处理链（按顺序）：
  1) cut_bottom   裁掉底部若干像素（去生成水印）
  2) trim_blank   从下往上裁掉"近乎纯白"的空白行（模型把"留白"画成死白）
  3) focus_y      按目标比例做 cover 裁切，focus_y 决定保留哪一段（0=顶部,1=底部）
  4) bright       整体提亮 / 压暗（生存模式那张太暗）
  5) 缩放输出 WebP

用法：python prep-modes.py
"""
import os
from PIL import Image, ImageEnhance

SRC = r'D:\CetGo\assets-src\modes'
DST = r'D:\CetGo\public\assets'
TW, TH = 780, 1000          # 目标卡面尺寸（比例 0.78）

JOBS = [
    # (源文件相对路径, 输出名, cut_bottom, trim_blank, pre_crop, focus_y, bright, sat)
    ('一位日系动漫风格的高中少女_及肩棕色短发_左侧系着红色蝴蝶结_2026-10-06T11-25-06.png',
     'mode-classic.webp', 96, False, None, 0.40, 1.02, 1.04),
    ('solo1/一位日系动漫风格的高中少女_及肩棕色短发_左侧系着红色蝴蝶结_2026-10-06T11-26-12.png',
     'mode-rush.webp', 0, True, None, 0.18, 1.02, 1.04),
    ('surv/一位日系动漫风格的高中少女_及肩棕色短发_左侧系着红色蝴蝶结_2026-10-06T11-25-40.png',
     'mode-survival.webp', 96, False, (0.16, 0.0, 0.86, 0.62), 0.5, 1.42, 1.12),
    ('一位日系动漫风格的高中少女_及肩棕色短发_左侧系着红色蝴蝶结_2026-10-06T11-25-04.png',
     'mode-topic.webp', 96, False, None, 0.45, 1.02, 1.04),
]

BLANK_MIN = 246     # 判定"白"的最低通道值
BLANK_ROWS = 3      # 连续这么多行都白才算空白起点


def trim_blank_bottom(im):
    """从下往上找第一行"不是纯白"的位置，裁掉下面的所有空白。"""
    w, h = im.size
    px = im.load()
    step = max(1, w // 120)          # 横向抽样，别逐像素扫 100 万次
    y = h - 1
    guard = 0
    while y > h * 0.3 and guard < h:
        guard += 1
        white = True
        for x in range(0, w, step):
            p = px[x, y]
            if min(p[:3]) < BLANK_MIN:
                white = False
                break
        if white:
            y -= 1
            # 连续空白不足 BLANK_ROWS 就当成内容，停
            if y < h - BLANK_ROWS:
                pass
        else:
            break
    cut = h - 1 - y
    if cut > 8:
        print('  底部空白 %dpx 已裁掉' % cut)
        im = im.crop((0, 0, w, max(10, y + 1)))
    return im


def cover(im, focus_y):
    """按目标比例 cover 裁切：先按需要的边放大，再按 focus_y 取窗口。"""
    iw, ih = im.size
    scale = max(TW / iw, TH / ih)
    nw, nh = max(TW, round(iw * scale)), max(TH, round(ih * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - TW) // 2
    top = round((nh - TH) * focus_y)
    top = max(0, min(nh - TH, top))
    return im.crop((left, top, left + TW, top + TH))


def main():
    for rel, out, cut_bottom, tb, pre_crop, focus_y, bright, sat in JOBS:
        src = os.path.join(SRC, rel)
        im = Image.open(src).convert('RGB')
        print('%-22s %dx%d' % (out, im.size[0], im.size[1]))

        if cut_bottom:
            w, h = im.size
            im = im.crop((0, 0, w, h - cut_bottom))
            print('  去水印裁底 %dpx → %dx%d' % (cut_bottom, im.size[0], im.size[1]))
        if tb:
            im = trim_blank_bottom(im)
        if pre_crop:
            w, h = im.size
            l, t, r, b = pre_crop
            im = im.crop((round(w * l), round(h * t), round(w * r), round(h * b)))
            print('  预裁切 → %dx%d' % im.size)
        im = cover(im, focus_y)
        if abs(bright - 1.0) > 0.001:
            im = ImageEnhance.Brightness(im).enhance(bright)
            print('  亮度 ×%.2f' % bright)
        if abs(sat - 1.0) > 0.001:
            im = ImageEnhance.Color(im).enhance(sat)
            print('  饱和 ×%.2f' % sat)

        dst = os.path.join(DST, out)
        im.save(dst, 'WEBP', quality=88, method=6)
        print('  → %s  (%dx%d, %.0f KB)' % (dst, im.size[0], im.size[1],
                                            os.path.getsize(dst) / 1024))


if __name__ == '__main__':
    main()
