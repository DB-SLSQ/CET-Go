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
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGE = os.path.join(ROOT, '.stage-exe')
DIST = os.path.join(ROOT, 'dist')
PAYLOAD = os.path.join(DIST, 'CETGo-PC.zip')
TARGET = os.path.join(DIST, 'CETGo-Setup.exe')

# IExpress 只认 ANSI（ASCII 安全）；中文注释写在这边没问题，写进 SED 就会乱码
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
AppLaunched=install.bat
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

    iexpress = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'),
                            'System32', 'iexpress.exe')
    if not os.path.exists(iexpress):
        print('!! 找不到 iexpress.exe（%s）—— Windows 自带，一般都有' % iexpress)
        return 1

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
    return 0


if __name__ == '__main__':
    sys.exit(main())
