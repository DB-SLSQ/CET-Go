#!/usr/bin/env bash
# ============================================================
#  CET Go · 打包 Android APK
#
#    bash tools/build-apk.sh
#
#  故意绕开 Gradle：这台机器上没有 gradle 分发和 AGP 的缓存，
#  拉一套下来是 130MB + 一堆 maven 依赖；而这个 App 只有一个
#  Activity、不依赖 androidx，用 SDK 自带的五个命令行工具手搓
#  反而更快也更可控：
#
#    javac   编译 Java
#    d8      编译 .class -> classes.dex
#    aapt2   编译资源 + 打包 + 链接清单
#    zipalign 4 字节对齐（不做的签名过不了校验）
#    apksigner 签名（Android 7 起必须签名才能装）
#
#  产物：dist/CETGo.apk
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK="${ANDROID_HOME:-D:/Android_Studio_SDK}"
AND="$ROOT/android"
OUT="$AND/build"
DIST="$ROOT/dist"

# javac / d8 / aapt2 都是 Windows 程序，喂给它们的路径必须是 Windows 形式
# （Git Bash 的 /d/CetGo/... 会被它们理解成 \d\CetGo\... 然后找不到文件）。
win() { cygpath -w "$1"; }

BUILD_TOOLS="$(ls -1 "$SDK/build-tools" | sort -V | tail -1)"
BT="$SDK/build-tools/$BUILD_TOOLS"
PLATFORM="$(ls -1 "$SDK/platforms" | sort -V | tail -1)"
ANDROID_JAR="$(win "$SDK/platforms/$PLATFORM/android.jar")"

AAPT2="$BT/aapt2.exe"
D8="$BT/d8.bat"
ZIPALIGN="$BT/zipalign.exe"
APKSIGNER="$BT/apksigner.bat"
[ -f "$AAPT2" ] || AAPT2="$BT/aapt2"

MIN_SDK=24
TARGET_SDK=34

# 找一个能用的 Python（塞 dex 那一步要用）
PY=""
for c in "python3" "python" "$HOME/.workbuddy/binaries/python/envs/default/Scripts/python.exe"; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
  if [ -x "$c" ]; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "找不到 Python，无法把 classes.dex 塞进包里"; exit 1; }

echo "==> SDK        $SDK"
echo "==> build-tools $BUILD_TOOLS / platform $PLATFORM"

# ------------------------------------------------------------
# 0. 把 web 资源同步进 assets
#    调试页（_shot / _probe / _gprobe / _itest / _m / _diag）不进包：
#    它们依赖 /api/*，在 App 里本来就是坏的，白白占体积。
# ------------------------------------------------------------
echo "==> 同步 web 资源到 assets/web"
rm -rf "$AND/assets/web"
mkdir -p "$AND/assets/web/data" "$AND/assets/web/css" "$AND/assets/web/js" "$AND/assets/web/assets"

cp "$ROOT/public/index.html" "$AND/assets/web/"
cp "$ROOT/public/manifest.json" "$AND/assets/web/"
cp "$ROOT/public/icon.png" "$AND/assets/web/"
cp "$ROOT/public/icon-512.png" "$AND/assets/web/"
cp -r "$ROOT/public/css/." "$AND/assets/web/css/"
cp -r "$ROOT/public/js/." "$AND/assets/web/js/"
cp -r "$ROOT/public/assets/." "$AND/assets/web/assets/"
# 词库：前端 fetch('/data/words_*.json')，在假域名下就是 assets/web/data/*
cp "$ROOT"/data/words_cet4.json "$AND/assets/web/data/"
cp "$ROOT"/data/words_cet6.json "$AND/assets/web/data/"

echo -n "    资源大小: "
du -sh "$AND/assets/web" | cut -f1

# ------------------------------------------------------------
# 1. Java -> .class
#    android.jar 只当 classpath（它是没有方法体的桩文件），
#    用默认的 JDK 17 编译，d8 认得 61 版字节码。
# ------------------------------------------------------------
echo "==> javac"
rm -rf "$OUT/classes" "$OUT/dex"
mkdir -p "$OUT/classes"
find "$AND/java" -name '*.java' -print0 | xargs -0 -I{} cygpath -w {} > "$OUT/sources.txt"
echo "    $(wc -l < "$OUT/sources.txt") 个源文件"
javac -encoding UTF-8 -nowarn \
      -classpath "$ANDROID_JAR" \
      -d "$(win "$OUT/classes")" \
      "@$(win "$OUT/sources.txt")"

# ------------------------------------------------------------
# 2. .class -> classes.dex
# ------------------------------------------------------------
echo "==> d8"
mkdir -p "$OUT/dex"
find "$OUT/classes" -name '*.class' -print0 | xargs -0 -I{} cygpath -w {} > "$OUT/classes.txt"
"$D8" --release --min-api "$MIN_SDK" --lib "$ANDROID_JAR" \
      --output "$(win "$OUT/dex")" \
      "@$(win "$OUT/classes.txt")" 2>&1 | grep -v "^Warning: Missing class" || true

# ------------------------------------------------------------
# 3. 资源 + 清单 -> 未签名的 base.apk
# ------------------------------------------------------------
echo "==> aapt2 compile"
rm -rf "$OUT/res" "$OUT/gen" "$OUT/base.apk"
mkdir -p "$OUT/res" "$OUT/gen"
# 输出到「目录」而不是 zip：compile 出来的 .flat 必须以「位置参数」喂给 link。
# 用 -R 会被当成 overlay（覆盖包），它会抱怨「没有可覆盖的原始资源」然后整包失败。
"$AAPT2" compile --dir "$(win "$AND/res")" -o "$(win "$OUT/res")"
FLATS=()
while IFS= read -r -d '' f; do FLATS+=("$(cygpath -w "$f")"); done \
  < <(find "$OUT/res" -name '*.flat' -print0 | sort -z)
echo "    $((${#FLATS[@]})) 个资源"

echo "==> aapt2 link"
"$AAPT2" link \
  -o "$(win "$OUT/base.apk")" \
  -I "$ANDROID_JAR" \
  --manifest "$(win "$AND/AndroidManifest.xml")" \
  -A "$(win "$AND/assets")" \
  --java "$(win "$OUT/gen")" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --version-code 1 --version-name 1.0 \
  "${FLATS[@]}"

# ------------------------------------------------------------
# 4. 把 classes.dex 塞进包里（aapt2 不认识 dex）
# ------------------------------------------------------------
echo "==> 打包 classes.dex"
"$PY" "$ROOT/tools/apk-add.py" "$OUT/base.apk" "$OUT/dex/classes.dex"

# ------------------------------------------------------------
# 5. 对齐 + 签名
#    4 字节对齐：Android 11 之后打包器要求资源不能压缩对齐错误，
#    zipalign 必须在签名之前做（签名之后再动包体签名就废了）。
# ------------------------------------------------------------
echo "==> zipalign"
"$ZIPALIGN" -f -p 4 "$(win "$OUT/base.apk")" "$(win "$OUT/aligned.apk")"

KS="$ROOT/android/keystore/cetgo.keystore"
if [ ! -f "$KS" ]; then
  echo "==> 生成签名密钥（只做一次）"
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -v \
    -keystore "$(win "$KS")" -alias cetgo -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass cetgo123 -keypass cetgo123 \
    -dname "CN=CET Go, OU=CET Go, O=CET Go, L=Shanghai, C=CN" 2>&1 | tail -2
fi

echo "==> apksigner"
mkdir -p "$DIST"
"$APKSIGNER" sign \
  --ks "$(win "$KS")" --ks-key-alias cetgo \
  --ks-pass pass:cetgo123 --key-pass pass:cetgo123 \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$(win "$DIST/CETGo.apk")" "$(win "$OUT/aligned.apk")"

echo "==> 校验"
"$APKSIGNER" verify "$(win "$DIST/CETGo.apk")" && echo "    签名 OK"
"$AAPT2" dump badging "$(win "$DIST/CETGo.apk")" \
  | grep -E "^package|^application-label|^launchable-activity|^sdkVersion|^targetSdkVersion|^uses-permission" || true

echo
echo "==> 完成：$DIST/CETGo.apk  ($(du -h "$DIST/CETGo.apk" | cut -f1))"
