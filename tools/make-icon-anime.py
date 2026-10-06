# -*- coding: utf-8 -*-
"""用看板娘头像生成应用图标（圆形粉底 + 人物）。
   输出：app.ico（多尺寸）+ public/icon.png
   用法：python make-icon-anime.py
"""
from PIL import Image, ImageDraw, ImageChops

SRC = 'public/assets/girl_happy.webp'      # 已抠好底、三张同画布
OUT_ICO = 'app.ico'
OUT_PNG = 'public/icon.png'
OUT_PNG512 = 'public/icon-512.png'
SIZE = 256

# 头部裁剪框（画布 757x1400，人物位于中部；这里取头肩范围）
BOX = (190, 8, 566, 384)


def main():
    girl = Image.open(SRC).convert('RGBA')
    head = girl.crop(BOX)
    w, h = head.size
    print('裁出头肩 %dx%d' % (w, h))

    # 圆形底：樱花粉竖向渐变
    grad = Image.new('RGBA', (SIZE, SIZE))
    gd = ImageDraw.Draw(grad)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        gd.line([(0, y), (SIZE, y)],
                fill=(int(255 - 20 * t), int(202 - 62 * t), int(222 - 44 * t), 255))

    circle = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, SIZE - 1, SIZE - 1), fill=255)

    base = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    base.paste(grad, (0, 0), circle)

    # 人物：等比缩到略小于圆，让四周露出一圈粉底，脸才不会顶满
    scale = SIZE / w * 1.00
    hw, hh = int(w * scale), int(h * scale)
    big = head.resize((hw, hh), Image.LANCZOS)

    layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    layer.paste(big, (SIZE // 2 - hw // 2, -int(hh * 0.02)), big)

    # 用圆 mask 裁掉人物溢出的部分
    a = layer.split()[3]
    a = ImageChops.multiply(a, circle)
    layer.putalpha(a)

    out = Image.alpha_composite(base, layer)

    # 外圈描白，桌面上更立体
    ring = ImageDraw.Draw(out)
    ring.ellipse((1, 1, SIZE - 2, SIZE - 2), outline=(255, 255, 255, 235), width=9)

    out.save(OUT_PNG)
    out.save(OUT_ICO, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # 手机主屏图标要 512，直接从 256 放大两倍（合成时是矢量式绘制，放大后依然干净）
    out.resize((512, 512), Image.LANCZOS).save(OUT_PNG512)
    print('→ %s / %s / %s' % (OUT_PNG, OUT_PNG512, OUT_ICO))


if __name__ == '__main__':
    main()
