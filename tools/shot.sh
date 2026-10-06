#!/bin/bash
# UI 截图工作台： bash tools/shot.sh [场景...]    默认全部
# 环境变量： PORT / W / H / IDX
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PORT="${PORT:-27656}"
OUT="D:/CetGo/_shots"
W="${W:-1240}"; H="${H:-900}"; IDX="${IDX:-1}"
mkdir -p "$OUT"
SCENES=("$@")
if [ ${#SCENES[@]} -eq 0 ]; then SCENES=(title ready game over set wrong); fi
for s in "${SCENES[@]}"; do
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --window-size=$W,$H --user-data-dir="${LOCALAPPDATA//\\//}/Temp/cetgo-shot" \
    --virtual-time-budget=9000 \
    --screenshot="$OUT/${s}_${W}x${H}.png" \
    "http://127.0.0.1:${PORT}/_shot.html?scene=${s}&w=${W}&h=${H}&idx=${IDX}" >/dev/null 2>&1
  echo "  $s -> ${s}_${W}x${H}.png"
done
