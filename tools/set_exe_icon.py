"""给 CETGo-Setup.exe 换上自己的图标（app.ico）。

IExpress 打出来的自解压包只能用自带的图标（SED 里没有指定图标这一项），
所以打包之后再用 Windows 的资源更新 API 把图标换掉：
    删掉旧的 RT_ICON 1..13 / RT_GROUP_ICON 3000 -> 写进 app.ico 的 7 张图 -> 重写索引表

只用 kernel32 的 BeginUpdateResourceW / UpdateResourceW / EndUpdateResourceW，零三方依赖。
改的是资源节，不影响可执行代码，也不动里面嵌的 CAB。

⚠️ 枚举资源**不能用 LoadLibraryEx**（本机安全策略会拦，Python 直接崩），
   所以读那一步走 tools/_peres.py 的纯 Python PE 解析，只有写用 API。
"""
import ctypes
import os
import struct
import sys
from ctypes import wintypes

import _peres

RT_ICON = 3
RT_GROUP_ICON = 14
LANG = 0x0409          # 1033，跟 IExpress 自带的图标资源同一语言

k32 = ctypes.WinDLL('kernel32', use_last_error=True)
k32.BeginUpdateResourceW.restype = wintypes.HANDLE
k32.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
k32.UpdateResourceW.restype = wintypes.BOOL
k32.UpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.LPCWSTR, wintypes.LPCWSTR,
                                wintypes.WORD, ctypes.c_void_p, wintypes.DWORD]
k32.EndUpdateResourceW.restype = wintypes.BOOL
k32.EndUpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.BOOL]


def rid(n):
    return ctypes.cast(ctypes.c_void_p(n), wintypes.LPCWSTR)


def parse_ico(path):
    raw = open(path, 'rb').read()
    _res, typ, cnt = struct.unpack_from('<HHH', raw, 0)
    if typ != 1:
        raise ValueError('不是图标文件（type=%d）' % typ)
    out = []
    for i in range(cnt):
        o = 6 + i * 16
        w, h, cc, _r, planes, bits, size, off = struct.unpack_from('<BBBBHHII', raw, o)
        out.append({'w': w or 256, 'h': h or 256, 'colors': cc, 'planes': planes,
                    'bits': bits, 'data': raw[off:off + size]})
    return out


def existing_icon_ids(exe):
    """返回 (RT_ICON 的 id 列表, RT_GROUP_ICON 的 id 列表)"""
    pe = _peres.PE(exe)
    icons, groups = [], []
    for t, n, _lang in pe.walk():
        if t == RT_ICON and isinstance(n, int):
            icons.append(n)
        elif t == RT_GROUP_ICON and isinstance(n, int):
            groups.append(n)
    return sorted(set(icons)), sorted(set(groups))


def set_icon(exe, ico):
    images = parse_ico(ico)
    print('  app.ico: %d 张图（%s）'
          % (len(images), ', '.join('%dx%d' % (i['w'], i['h']) for i in images)))

    old_icons, old_groups = existing_icon_ids(exe)
    print('  原有资源: RT_ICON %s / RT_GROUP_ICON %s' % (old_icons, old_groups))

    h = k32.BeginUpdateResourceW(exe, False)
    if not h:
        print('  !! BeginUpdateResource 失败 (%d)' % ctypes.get_last_error())
        return 1

    # ---------- 1. 删掉 IExpress 自带的旧图标（lpData=NULL, cbData=0 就是删除）----------
    deleted = 0
    for i in old_icons:
        if k32.UpdateResourceW(h, rid(RT_ICON), rid(i), LANG, None, 0):
            deleted += 1
    for g in old_groups:
        if k32.UpdateResourceW(h, rid(RT_GROUP_ICON), rid(g), LANG, None, 0):
            deleted += 1
    print('  清掉旧图标: %d 个' % deleted)

    # ---------- 2. 写进新的 RT_ICON ----------
    for i, img in enumerate(images, 1):
        blob = img['data']
        buf = ctypes.create_string_buffer(blob, len(blob))
        if not k32.UpdateResourceW(h, rid(RT_ICON), rid(i), LANG,
                                   ctypes.cast(buf, ctypes.c_void_p), len(blob)):
            print('  !! 写 RT_ICON #%d 失败 (%d)' % (i, ctypes.get_last_error()))
            k32.EndUpdateResourceW(h, True)
            return 1
    print('  写入 RT_ICON: %d 张' % len(images))

    # ---------- 3. 写 RT_GROUP_ICON（沿用原来的 id 3000）----------
    # GRPICONDIR: reserved(2) type(2) count(2)；每条 GRPICONDIRENTRY 最后是 WORD 的 nId
    grp = struct.pack('<HHH', 0, 1, len(images))
    for i, img in enumerate(images, 1):
        grp += struct.pack('<BBBBHHI', img['w'] % 256, img['h'] % 256,
                           img['colors'], 0, img['planes'], img['bits'],
                           len(img['data']))
        grp += struct.pack('<H', i)
    buf = ctypes.create_string_buffer(grp, len(grp))
    gid = old_groups[0] if old_groups else 1
    if not k32.UpdateResourceW(h, rid(RT_GROUP_ICON), rid(gid), LANG,
                               ctypes.cast(buf, ctypes.c_void_p), len(grp)):
        print('  !! 写 RT_GROUP_ICON 失败 (%d)' % ctypes.get_last_error())
        k32.EndUpdateResourceW(h, True)
        return 1
    print('  写入 RT_GROUP_ICON: id=%d（%d 字节索引表）' % (gid, len(grp)))

    if not k32.EndUpdateResourceW(h, False):
        print('  !! EndUpdateResource 失败 (%d)' % ctypes.get_last_error())
        return 1
    return 0


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    exe = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'dist', 'CETGo-Setup.exe')
    ico = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, 'app.ico')
    for p in (exe, ico):
        if not os.path.exists(p):
            print('!! 找不到 %s' % p)
            return 1
    print('==> 给 %s 换图标 (%s)' % (os.path.basename(exe), os.path.basename(ico)))
    before = os.path.getsize(exe)
    if set_icon(exe, ico):
        return 1
    after = os.path.getsize(exe)
    print('  体积: %d -> %d  (%+d 字节)' % (before, after, after - before))

    # 校验不能只看数量 —— 真把字节读回来跟 app.ico 逐张比对
    images = parse_ico(ico)
    icons, groups = existing_icon_ids(exe)
    print('  校验: RT_ICON=%s  RT_GROUP_ICON=%s' % (icons, groups))
    pe = _peres.PE(exe)
    same = 0
    for i, img in enumerate(images, 1):
        got = _peres.read_resource(pe, RT_ICON, i, LANG)
        if got == img['data']:
            same += 1
        else:
            print('    #%d 不一致（读到 %s 字节，源 %d 字节）'
                  % (i, len(got) if got else 'None', len(img['data'])))
    print('  图标内容逐张比对: %d/%d 一致' % (same, len(images)))

    grp = _peres.read_resource(pe, RT_GROUP_ICON, groups[0], LANG)
    cnt = struct.unpack_from('<H', grp, 4)[0] if grp else -1
    ok = (icons == list(range(1, len(images) + 1)) and len(groups) == 1
          and same == len(images) and cnt == len(images))
    print('  结论: %s' % ('图标已换成 app.ico' if ok else '!! 换图标失败'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
