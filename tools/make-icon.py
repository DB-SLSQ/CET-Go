# -*- coding: utf-8 -*-
"""
CET Go · 生成像素风图标
纯 Python 标准库（zlib/struct），不依赖 Pillow。
输出：
  D:\\CetGo\\app.ico        —— 多尺寸 ICO（16/32/48/64/128/256）
  D:\\CetGo\\public\\icon.png —— 256x256 PNG
"""
import zlib, struct, os

W = H = 256

BG    = (0x0d, 0x0b, 0x1e, 255)   # 深紫黑底
FRAME = (0x2f, 0xe8, 0xd0, 255)   # 霓虹青描边
WHITE = (0xff, 0xff, 0xff, 255)   # G
YELL  = (0xff, 0xd6, 0x3d, 255)   # O

GLYPH_G = ["01110",
           "10001",
           "10000",
           "10111",
           "10001",
           "10001",
           "01110"]

GLYPH_O = ["01110",
           "10001",
           "10001",
           "10001",
           "10001",
           "10001",
           "01110"]


def canvas(w, h, color):
    return [list(color) for _ in range(w * h)]


def rect(buf, w, x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        if y < 0:
            continue
        for x in range(x0, x1 + 1):
            if 0 <= x < w and 0 <= y < (len(buf) // w):
                buf[y * w + x] = list(color)


def draw_glyph(buf, w, glyph, ox, oy, cell, color):
    for i, row in enumerate(glyph):
        for j, ch in enumerate(row):
            if ch == '1':
                rect(buf, w,
                     ox + j * cell, oy + i * cell,
                     ox + (j + 1) * cell - 1, oy + (i + 1) * cell - 1,
                     color)


def build():
    buf = canvas(W, H, BG)

    # 外描边（像素风直角边框）
    t = 12
    rect(buf, W, 0, 0, W - 1, t - 1, FRAME)
    rect(buf, W, 0, H - t, W - 1, H - 1, FRAME)
    rect(buf, W, 0, 0, t - 1, H - 1, FRAME)
    rect(buf, W, W - t, 0, W - 1, H - 1, FRAME)

    # 中央 GO
    cell = 16
    gw, gh = 5, 7
    gap = 16
    total_w = gw * cell * 2 + gap
    total_h = gh * cell
    x0 = (W - total_w) // 2
    y0 = (H - total_h) // 2

    draw_glyph(buf, W, GLYPH_G, x0, y0, cell, WHITE)
    draw_glyph(buf, W, GLYPH_O, x0 + gw * cell + gap, y0, cell, YELL)

    # 底部填空小横线（呼应「拼写」玩法）
    y = y0 + total_h + 18
    line_w = 22
    line_h = 8
    gap2 = 12
    n = 5
    total2 = n * line_w + (n - 1) * gap2
    sx = (W - total2) // 2
    for i in range(n):
        x = sx + i * (line_w + gap2)
        rect(buf, W, x, y, x + line_w - 1, y + line_h - 1, FRAME)

    return buf


def png_bytes(w, h, buf):
    raw = bytearray()
    for yy in range(h):
        raw.append(0)
        for xx in range(w):
            raw += bytes(buf[yy * w + xx])

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', zlib.compress(bytes(raw), 9)) +
            chunk(b'IEND', b''))


def downscale(buf, w, h, nw, nh):
    out = [None] * (nw * nh)
    for y in range(nh):
        sy = min(h - 1, int(y * h / nh))
        for x in range(nw):
            sx = min(w - 1, int(x * w / nw))
            out[y * nw + x] = buf[sy * w + sx]
    return out


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    buf = build()

    # PNG
    png_path = os.path.join(root, 'public', 'icon.png')
    with open(png_path, 'wb') as f:
        f.write(png_bytes(W, H, buf))

    # ICO（多尺寸，PNG 压缩条目）
    sizes = [16, 32, 48, 64, 128, 256]
    blobs = []
    for s in sizes:
        b = buf if s == W else downscale(buf, W, H, s, s)
        blobs.append(png_bytes(s, s, b))

    header = struct.pack('<HHH', 0, 1, len(sizes))
    offset = 6 + 16 * len(sizes)
    entries = b''
    data = b''
    for i, s in enumerate(sizes):
        d = blobs[i]
        wb = 0 if s >= 256 else s
        hb = 0 if s >= 256 else s
        entries += struct.pack('<BBBBHHII', wb, hb, 0, 0, 1, 32, len(d), offset + len(data))
        data += d

    ico_path = os.path.join(root, 'app.ico')
    with open(ico_path, 'wb') as f:
        f.write(header + entries + data)

    print('PNG ->', png_path)
    print('ICO ->', ico_path)


if __name__ == '__main__':
    main()
