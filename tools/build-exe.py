#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把绿色包打成 CETGo-Setup.exe（安装版）。

用的是 Windows 自带的 iexpress.exe —— 零三方依赖，不需要 Inno Setup / NSIS：
  exe = CAB(payload.zip + install.bat + mklnk.vbs) + IExpress 自解压外壳
双击后：解到临时目录 -> 跑 install.bat（解压到 %LOCALAPPDATA%\\CETGo、
建快捷方式、写「应用和功能」条目）-> 自动打开游戏。

用法：
    python tools/build-pc-zip.py      # 先出 payload（dist/CETGo-PC.zip）
    python tools/build-exe.py         # 再打成 exe
"""
import hashlib
import os
import shutil
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGE = os.path.join(ROOT, '.stage-exe')
DIST = os.path.join(ROOT, 'dist')
PAYLOAD = os.path.join(DIST, 'CETGo-PC.zip')
TARGET = os.path.join(DIST, 'CETGo-Setup.exe')

# IExpress 只认 ANSI（ASCII 安全）；中文注释写在这边没问题，写进 SED 就会乱码。
#
# AppLaunched 必须是 `cmd.exe /d /c install.bat`，**不能**直接写 install.bat：
# wextract（IExpress 的自解压外壳）碰到批处理会拼出 `Command.com /c <temp>\install.bat`，
# 而 command.com 是 16 位时代的命令解释器，Windows 10/11 x64 上**根本不存在**，
# 于是弹「创建进程 <Command.com /c ...IXP000.TMP\install.bat> 时出错。
# 原因：系统找不到指定的文件。」（2026-10-07 用户实测踩到）
# 显式写 cmd.exe 后，wextract 走 CreateProcess，由系统目录找到 cmd.exe，正常执行。
# /d 是让 cmd 跳过 AutoRun 注册表项，避免被别人的 bat 劫持。
#
# 另一条：cwd 由 wextract 强制设成解包临时目录（实测把父进程 cwd 设成 C:\ 也一样），
# 所以 install.bat 用相对名能被找到，脚本内部再用 %~dp0 定位同目录的 payload.zip。
SED = """[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName={target}
FriendlyName=CET Go 1.1
AppLaunched=cmd.exe /d /c install.bat
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="install.bat"
FILE1="mklnk.vbs"
FILE2="payload.zip"
[SourceFiles]
SourceFiles0={stage}
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
"""


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def write_text(path, text, crlf=False):
    """IExpress 的 SED 与 cmd/WSH 读的文件都要 CRLF + ASCII，这里统一钉死。"""
    if crlf:
        text = text.replace('\r\n', '\n').replace('\n', '\r\n')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)


def main():
    if not os.path.exists(PAYLOAD):
        print('!! 缺少 %s —— 先跑 python tools/build-pc-zip.py' % PAYLOAD)
        return 1

    if os.path.exists(STAGE):
        shutil.rmtree(STAGE)
    os.makedirs(STAGE)

    shutil.copy2(PAYLOAD, os.path.join(STAGE, 'payload.zip'))
    shutil.copy2(os.path.join(ROOT, 'tools', 'install.bat'),
                 os.path.join(STAGE, 'install.bat'))
    shutil.copy2(os.path.join(ROOT, 'tools', 'mklnk.vbs'),
                 os.path.join(STAGE, 'mklnk.vbs'))
    print('==> 暂存区就绪：%s' % STAGE)

    sed_path = os.path.join(STAGE, 'setup.sed')
    write_text(sed_path, SED.replace('{target}', TARGET).replace('{stage}', STAGE),
               crlf=True)

    # 用 SysWOW64 里的那个（x86 版）iexpress：产出的包也是 x86 的，
    # 32 位 / 64 位 Windows 都能双击运行。System32 里的是 x64 版，
    # 产出的包在 32 位机器上会直接报「不是有效的 Win32 应用程序」。
    # 32 位 Windows 上没有 SysWOW64，那时 System32 本身就是 x86 的，退回即可。
    sysroot = os.environ.get('SystemRoot', r'C:\Windows')
    candidates = [os.path.join(sysroot, 'SysWOW64', 'iexpress.exe'),
                  os.path.join(sysroot, 'System32', 'iexpress.exe')]
    iexpress = next((c for c in candidates if os.path.exists(c)), None)
    if not iexpress:
        print('!! 找不到 iexpress.exe —— Windows 自带，一般都有')
        return 1
    print('==> 打包器：%s' % iexpress)

    if os.path.exists(TARGET):
        os.remove(TARGET)

    print('==> 调用 iexpress 打包 …')
    r = subprocess.run([iexpress, '/N', sed_path],
                       cwd=STAGE, capture_output=True, text=True)
    if r.returncode != 0:
        print('   returncode=%s' % r.returncode)
        print('   stdout: %s' % (r.stdout or '').strip()[:400])
        print('   stderr: %s' % (r.stderr or '').strip()[:400])

    if not os.path.exists(TARGET):
        print('!! 没产出 %s' % TARGET)
        return 1

    size = os.path.getsize(TARGET)
    print('==> CETGo-Setup.exe  %.1f MB  (%d bytes)' % (size / 1048576.0, size))
    print('    SHA-256 %s' % sha256(TARGET))

    # 自检：PE 架构 + 内嵌的 AppLaunched 字符串 + CAB 里的文件数。
    # 前两项是 2026-10-07 那次「Command.com 找不到」事故的护栏 —— 只要
    # AppLaunched 又变回裸 install.bat，或者包被打成 x64 的，这里都会报警。
    raw = open(TARGET, 'rb').read()
    bad = 0

    pe = struct.unpack_from('<I', raw, 0x3c)[0]
    machine = struct.unpack_from('<H', raw, pe + 4)[0]
    arch = {0x14c: 'x86（32/64 位都能跑）', 0x8664: 'x64（只能跑 64 位！）'}.get(machine, hex(machine))
    print('    架构: %s' % arch)
    if machine != 0x14c:
        print('    !! 不是 x86 包 —— 换成 SysWOW64 里的 iexpress 再打')
        bad += 1

    if b'cmd.exe /d /c install.bat' in raw:
        print('    AppLaunched: cmd.exe /d /c install.bat  (ok)')
    else:
        print('    !! 包里没找到 "cmd.exe /d /c install.bat" —— AppLaunched 可能又变回裸批处理了')
        bad += 1

    off = raw.rfind(b'MSCF')
    if off < 0:
        print('    !! 没找到 CAB')
        bad += 1
    else:
        cfold, cfile = struct.unpack_from('<HH', raw, off + 26)
        names = [n for n in (b'install.bat', b'mklnk.vbs', b'payload.zip') if n in raw[off:]]
        print('    CAB: %d 个文件 / %d 个文件夹 | 命中 %s' %
              (cfile, cfold, b','.join(names).decode()))
        if cfile != 3 or len(names) != 3:
            print('    !! CAB 内容不对，应有 install.bat + mklnk.vbs + payload.zip')
            bad += 1

    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
