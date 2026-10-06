# -*- coding: utf-8 -*-
"""
打「电脑版」的绿色免安装包。

两个变体：
  CETGo-PC.zip       自带 node.exe —— 拷到任何 Windows 上解压就能玩，
                     对方不用装 Node。（约 32 MB）
  CETGo-PC-lite.zip  不带 node.exe —— 约 1.5 MB，但对方电脑得已经装了
                     Node.js（或者把 node.exe 丢进解压出来的文件夹）。

两个包的结构完全一样，双击里面的「CET Go.vbs」启动。
启动器会**优先用同目录下的 node.exe**，找不到才去找系统里的，
所以「有就自带、没有也能跑」这两种情况都不用改脚本。

用法：
    python tools/build-pc-zip.py              # 两个都打
    python tools/build-pc-zip.py --full       # 只打完整版
    python tools/build-pc-zip.py --lite       # 只打精简版
    python tools/build-pc-zip.py --node <path>  # 指定 node.exe 来源
"""
import argparse
import hashlib
import os
import shutil
import sys
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
STAGE = os.path.join(DIST, '_pc')
NAME = 'CETGo'          # 解压出来的顶层文件夹名

# 进包的文件（相对 ROOT）
FILES = [
    'server.js',
    'CET Go.vbs',
    'CET Go.bat',
    'Stop CET Go.vbs',
    'app.ico',
]
# 进包的目录
DIRS = [
    'public',
]
# 词库要带上，存档（state.json / backup）不能带 —— 那是使用者自己的记录
WORDS = ['words_cet4.json', 'words_cet6.json']

NODE_CANDIDATES = [
    # 不写死用户名路径：expanduser 在谁机器上就解析成谁的家目录
    os.path.join(os.path.expanduser('~'), '.workbuddy', 'binaries',
                 'node', 'versions', '22.22.2-6', 'node.exe'),
    r'D:\nodejs\node.exe',
    r'C:\Program Files\nodejs\node.exe',
]

README = """\
CET Go —— 电脑版（绿色免安装）
============================================================

怎么玩
------------------------------------------------------------
  双击本文件夹里的「CET Go.vbs」就行。

  第一次会弹一个窗口问「是否允许」，允许即可。
  它会自己在后台起一个小服务，然后打开游戏窗口。

  如果 .vbs 被安全软件 / 组织策略拦住打不开，就改用
  「CET Go.bat」—— 功能一样，只是会多出一个黑色小窗口
  （那个窗口就是服务本体，关掉它就等于退出）。

  没装 Node.js 也能玩 —— 完整版已经把 node.exe 放在同一个
  文件夹里了，启动器会优先用它。

  （精简版不带 node.exe：如果打不开，说明这台电脑没装
    Node.js。去 https://nodejs.org 装一个，或者把任意
    node.exe 复制到本文件夹里，再双击一次即可。）


怎么玩（说明）
------------------------------------------------------------
  看中文释义，限时拼出对应的英文单词，回车提交。

  连击加分、提示扣分。时间内打错不扣命，可以无限次重试；
  超时才扣命，答错/超时的词自动进「错题本」，随时重练。

  先选难度（normal / hard / veryhard / hell），再选题量
  （7 / 10 / 16）。词表在「设置」里切 CET4 / CET6 / 全部。


给别的电脑玩
------------------------------------------------------------
  把整个文件夹（或这个 zip）直接拷给对方就行。

  同一局域网内也可以直接下载：让本机带 /lan 参数启动
  （右键「CET Go.vbs」→ 发送到 → 桌面快捷方式，右键那个
  快捷方式 → 属性 → 在「目标」最后加一个空格再加  /lan ），
  启动后控制台会打印一个 /pc 直链，别的电脑浏览器打开
  即可下载这个绿色包。


东西都存在哪
------------------------------------------------------------
  全部在本文件夹里：
    data\\state.json     分数、最高分、错题本
    .browser\\           游戏窗口的缓存（Edge 生成，别删）
  完全离线，不联网、不上传任何东西。

  想重置成绩：删掉 data\\state.json 即可。


文件说明
------------------------------------------------------------
  CET Go.vbs        启动（双击这个，推荐）
  CET Go.bat        同上，备胎（.vbs 被拦时用）
  Stop CET Go.vbs   关掉后台服务（一般不用，关窗口 150 秒后自己退）
  server.js         本地服务，端口 27656
  node.exe          自带的运行环境（只有完整版有）
  public\\           界面和游戏本体
  data\\             词库 + 你的记录
"""


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def find_node(explicit=None):
    for p in ([explicit] if explicit else []) + NODE_CANDIDATES:
        if p and os.path.exists(p):
            return p
    return None


def skip_public(name):
    # 调试/自测页不进发行包
    return name.startswith('_')


def stage_files(include_node, node_src):
    if os.path.exists(STAGE):
        shutil.rmtree(STAGE)
    dest = os.path.join(STAGE, NAME)
    os.makedirs(dest)

    for rel in FILES:
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            print('  !! 缺少 %s' % rel)
            continue
        shutil.copy2(src, os.path.join(dest, rel))

    for rel in DIRS:
        src = os.path.join(ROOT, rel)
        if not os.path.isdir(src):
            print('  !! 缺少目录 %s' % rel)
            continue
        shutil.copytree(src, os.path.join(dest, rel),
                        ignore=shutil.ignore_patterns('_*'))

    os.makedirs(os.path.join(dest, 'data'), exist_ok=True)
    for w in WORDS:
        src = os.path.join(ROOT, 'data', w)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dest, 'data', w))
        else:
            print('  !! 缺少词库 %s' % w)

    with open(os.path.join(dest, '使用说明.txt'), 'w', encoding='utf-8') as f:
        f.write(README)

    if include_node:
        shutil.copy2(node_src, os.path.join(dest, 'node.exe'))

    return dest


def zip_dir(stage_dir, out_path, total_cb=None):
    if os.path.exists(out_path):
        os.remove(out_path)
    base = os.path.dirname(stage_dir)
    seen = []
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, dirs, files in os.walk(stage_dir):
            dirs.sort()
            for fn in sorted(files):
                full = os.path.join(root, fn)
                arc = os.path.relpath(full, base).replace('\\', '/')
                z.write(full, arc, compress_type=zipfile.ZIP_DEFLATED,
                        compresslevel=9)
                seen.append(arc)
    return out_path, seen


def report(out_path, entries):
    size = os.path.getsize(out_path)
    print('  -> %s   %.1f MB   %d 个条目'
          % (os.path.basename(out_path), size / 1048576.0, len(entries)))
    print('     SHA-256 %s' % sha256(out_path))
    return size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--full', action='store_true')
    ap.add_argument('--lite', action='store_true')
    ap.add_argument('--node', default=None)
    a = ap.parse_args()
    both = not (a.full or a.lite)

    node_src = find_node(a.node)
    print('node.exe 来源: %s' % (node_src or '（没找到）'))

    t0 = time.time()
    results = []

    if both or a.full:
        if not node_src:
            print('  !! 找不到 node.exe，跳过完整版')
        else:
            print('==> 完整版（自带 node.exe）')
            d = stage_files(True, node_src)
            out, ent = zip_dir(d, os.path.join(DIST, 'CETGo-PC.zip'))
            report(out, ent)
            results.append(out)

    if both or a.lite:
        print('==> 精简版（不带 node.exe）')
        d = stage_files(False, None)
        out, ent = zip_dir(d, os.path.join(DIST, 'CETGo-PC-lite.zip'))
        report(out, ent)
        results.append(out)

    shutil.rmtree(STAGE, ignore_errors=True)
    print('完成，用时 %.1fs' % (time.time() - t0))
    return 0 if results else 1


if __name__ == '__main__':
    sys.exit(main())
