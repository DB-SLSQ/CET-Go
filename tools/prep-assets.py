# -*- coding: utf-8 -*-
"""CET Go 素材预处理
   1) 立绘去白底 → 带 alpha 的 WebP（用「从四边洪水填充」而不是阈值，
      这样被轮廓线包围的白衬衫不会被一起扣掉）
   2) 背景裁掉底部生成水印 → 压缩 WebP
   用法：python prep-assets.py <模式> <输入> <输出>
       模式：cutout | bg
"""
import sys
from PIL import Image, ImageDraw, ImageChops, ImageFilter

MAGIC = (255, 0, 255)          # 品红，用作「背景」标记色
WHITE_MIN = 224                # 判定为背景的最低通道值
WHITE_SAT = 30                 # 判定为背景的最大饱和度（max-min）


def cutout(src, dst):
    img = Image.open(src).convert('RGB')
    w, h = img.size
    print('  尺寸 %dx%d' % (w, h))

    # ---- 1. 从四条边布种子点做洪水填充 ----
    # 背景是渐变的（上白下灰），所以沿边多点开花，而不是只取四角
    seeds = []
    step = 16
    for x in range(0, w, step):
        seeds.append((x, 0))
        seeds.append((x, h - 1))
    for y in range(0, h, step):
        seeds.append((0, y))
        seeds.append((w - 1, y))

    filled = 0
    for (x, y) in seeds:
        p = img.getpixel((x, y))
        if p == MAGIC:
            continue                      # 已经被前一个种子填过了
        if min(p) >= WHITE_MIN and (max(p) - min(p)) <= WHITE_SAT:
            ImageDraw.floodfill(img, (x, y), MAGIC, thresh=WHITE_SAT + 6)
            filled += 1
    print('  洪水填充种子命中 %d 个' % filled)

    # ---- 2. 标记色 → alpha（用 ImageChops 做，C 实现，比逐像素快几个数量级）----
    diff = ImageChops.difference(img, Image.new('RGB', img.size, MAGIC))
    r, g, b = diff.split()
    diff = ImageChops.lighter(ImageChops.lighter(r, g), b)
    alpha = diff.point(lambda v: 0 if v == 0 else 255)

    # 轻微羽化：把硬边磨成抗锯齿边，避免人物轮廓出现台阶
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.55))

    out = img.convert('RGBA')
    out.putalpha(alpha)

    # ---- 3. 收掉四周全透明的空边，减小体积 ----
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
        print('  裁掉空边 → %dx%d' % (out.size[0], out.size[1]))

    out.save(dst, 'WEBP', quality=90, method=6)
    print('  → %s' % dst)


def bg(src, dst, cut_bottom=132):
    img = Image.open(src).convert('RGB')
    w, h = img.size
    print('  尺寸 %dx%d' % (w, h))
    img = img.crop((0, 0, w, h - cut_bottom))
    print('  裁掉底部 %dpx 去水印 → %dx%d' % (cut_bottom, img.size[0], img.size[1]))
    img.save(dst, 'WEBP', quality=86, method=6)
    print('  → %s' % dst)


def align(srcs, dsts, target_h=1400):
    """把多张立绘统一到同一画布：底部中心对齐 + 高度归一。
       否则切换表情时人物会左右/上下跳动，看起来像廉价贴图。"""
    parts = []
    for p in srcs:
        im = Image.open(p).convert('RGBA')
        bb = im.getbbox()
        if bb:
            im = im.crop(bb)
        k = target_h / im.size[1]
        im = im.resize((max(1, round(im.size[0] * k)), target_h), Image.LANCZOS)
        parts.append(im)
        print('  %s → %dx%d' % (p.split('/')[-1], im.size[0], im.size[1]))

    maxw = max(p.size[0] for p in parts)
    print('  统一画布 %dx%d' % (maxw, target_h))
    for im, d in zip(parts, dsts):
        canvas = Image.new('RGBA', (maxw, target_h), (0, 0, 0, 0))
        canvas.paste(im, ((maxw - im.size[0]) // 2, target_h - im.size[1]), im)
        canvas.save(d, 'WEBP', quality=90, method=6)
        print('  → %s' % d)


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'cutout':
        cutout(sys.argv[2], sys.argv[3])
    elif mode == 'bg':
        cut_bottom = int(sys.argv[4]) if len(sys.argv) > 4 else 132
        bg(sys.argv[2], sys.argv[3], cut_bottom)
    elif mode == 'align':
        # 用法：align <a|b|c> <A|B|C>  （竖线分隔）
        srcs = sys.argv[2].split('|')
        dsts = sys.argv[3].split('|')
        align(srcs, dsts)
    else:
        print('未知模式:', mode)
        sys.exit(1)
