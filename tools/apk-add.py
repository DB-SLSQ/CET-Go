# -*- coding: utf-8 -*-
"""
往一个已经打好的 APK 里追加条目（我们只用来塞 classes.dex）。

    python tools/apk-add.py dist/CETGo.apk android/build/dex/classes.dex

为什么不用 zip / jar 命令：
  · Git Bash 里没有 zip；
  · jar uf 会**重写整个归档**，可能把 resources.arsc 重新压一遍。
    而 Android 11+ 对 targetSdk 30+ 的应用有一条硬要求：
    resources.arsc 必须是「不压缩 + 4 字节对齐」，压了就直接装不上。
  · Python 的 zipfile 以 'a' 打开时只在文件末尾追加新条目，
    已有条目的字节一个都不动 —— 这是这里最稳的做法。
"""
import os
import sys
import zipfile


def main():
    if len(sys.argv) < 3:
        print(__doc__.strip())
        return 2
    apk, entries = sys.argv[1], sys.argv[2:]
    if not os.path.exists(apk):
        print('APK 不存在：' + apk)
        return 1

    with zipfile.ZipFile(apk, 'a', zipfile.ZIP_DEFLATED) as z:
        have = set(z.namelist())
        for src in entries:
            name = os.path.basename(src)
            if name in have:
                print('已存在，跳过：' + name)
                continue
            z.write(src, name)
            print('已加入：%s (%.1f KB)' % (name, os.path.getsize(src) / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
