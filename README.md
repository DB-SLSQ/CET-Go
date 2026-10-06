# CET Go

看中文释义，限时把英文单词**拼**出来。

玩法照搬《漢字でGO!》：单词卡从远处一路压过来，时间条走完就正好撞到你脸上 —— 撞上的瞬间定格 1.3 秒，然后弹「TIME UP」。

纯本地、纯离线、零依赖：只用 Node 内置模块起个本地服务，界面是原生 HTML/CSS/JS，没有任何 npm 包。

<p>
  <img src="docs/ui-title.png" width="49%">
  <img src="docs/ui-game.png" width="49%">
</p>

---

## 玩法

**四种模式**

| 模式 | 规则 |
|---|---|
| 经典 CLASSIC | 无限出题，难度可选 |
| 极速 RUSH | 固定每题 5 秒，连击就是一切 |
| 生存 SURVIVAL | 固定 1 条命，错一次就结束 |
| 主题 TOPIC | 按词性出题（名词 / 动词 / 形容词 / 副词） |

**四档难度**（出题前选）

| 难度 | 时限 | 命 | 提示 | 词长门槛 |
|---|---|---|---|---|
| 普通 NORMAL | 15 秒 | 3 | 3 次 | — |
| 困难 HARD | 10 秒 | 3 | 2 次 | ≥ 5 字母 |
| 极难 激ムズ | 7 秒 | 2 | 1 次 | ≥ 6 字母 |
| 地狱 HELL | 5 秒 | 1 | — | ≥ 8 字母 |

题量 **7 / 10 / 16** 题任选。

**细节**

- 题面直接报这个单词**有几个字母**，不用去数下面那排下划线槽
- 判分宽松：大小写、空格、连字符、撇号都不计较（`icecream` 和 `ice cream` 都算对）
- **时间内打错不判死**：红闪 + 震屏 + 断连击，然后接着打（无限次重试）；只有时间走完才扣命进错题本 —— 打错不亮答案，不然就没得猜了
- 连击加分、提示扣分（剩 1 次提示时分数打 4 折）
- 超时/跳过的词当场进**错题本**，随时一键重练
- 视觉是日系校园风，看板娘三表情随答对 / 答错切换；音效是 Web Audio 实时合成的 8-bit 音，**零音频文件**

## 跑起来

**Windows（绿色免安装）**

```
双击 CET Go.vbs
```

它会自己在后台起一个本地服务，然后开一个没有地址栏的应用窗口（走 Edge 的 `--app`），不弹黑框。`.vbs` 被安全软件拦的机器上，双击 `CET Go.bat` 也一样。

**任何有 Node 的机器**

```bash
node server.js          # 默认端口 27656，浏览器开 http://127.0.0.1:27656
node server.js 8080     # 换端口
node server.js --lan    # 绑到 0.0.0.0，同一个 Wi-Fi 下的手机能连进来
node server.js --keep-alive   # 关掉「空闲 150 秒自动退出」
```

关窗口后服务会自己退，不会留后台进程。

**手机上玩（安卓）**

```bash
bash tools/build-apk.sh        # 产出 dist/CETGo.apk
```

APK 是零权限的（连 `INTERNET` 都不要），词库打进包里 —— 飞行模式照跑，进度存手机本地。

顺手也能用局域网模式玩网页版：`node server.js --lan`，游戏窗口右上角有「手机玩」，里面有二维码，扫一眼就开。

## 目录

```
server.js              本地服务：静态文件 + /api/state 存档 + 局域网二维码
public/                整个前端
  index.html           六个屏幕：标题 / 准备 / 游戏 / 结算 / 设置 / 错题本
  js/words.js          词库：加载、释义清洗、判分归一化、提示掩码
  js/app.js            游戏逻辑：出题、计时、逼近演出、计分、存档
  js/sfx.js            Web Audio 合成的 8-bit 音效
  assets/              背景与立绘（webp）
data/words_cet4.json   词库（3518 条）
data/words_cet6.json   词库（2271 条）
android/               安卓外壳：MainActivity + manifest + 资源
tools/                 构建与自测脚本（见下）
docs/                  截图与扫码安装页
```

**`tools/` 里有什么**

| 脚本 | 干什么 |
|---|---|
| `selftest.js` | Node 直跑的词库 / 清洗 / 判分 / 掩码自测 + HTML id 与 JS 引用一致性 |
| `build-apk.sh` | 零依赖打 APK：`javac → d8 → aapt2 → 塞 dex → zipalign → apksigner` |
| `build-pc-zip.py` | 出绿色免安装包（完整版自带 `node.exe` / 精简版不带） |
| `make-appicon.py` | 从一张 512px 图标生成安卓整套图标（含自适应图标安全区） |
| `make-install-page.py` | 生成扫码安装页 |
| `prep-assets.py` · `prep-modes.py` | 处理素材原图：抠白底 / 去水印 / 底部对齐 / 裁模式卡 |

## 它是怎么被验证的

这个项目没有测试框架，自测是**用无头 Edge 驱动真实界面**做的：

```bash
node tools/selftest.js          # 词库与逻辑
bash tools/shot.sh              # 各屏幕截图工作台
```

`public/_*.html` 是留给自己的探针页，每个负责一件事：

| 探针 | 管什么 |
|---|---|
| `_gprobe.html` | 各屏在 15 种窗口尺寸下**不溢出**（含「贴脸放大」那一帧的最坏情况） |
| `_itest.html` | 主页交互：轮播、翻卡、开局、按钮尺寸、存档落盘 |
| `_ntest.html` | 手机 App 外壳那条分支（假 `CetGoNative` 桥） |
| `_lantest.html` | 局域网面板在最窄 / 最矮窗口下是否放得下、滚得到 |
| `_shot.html` · `_m.html` | 截图与盒模型排查 |

结论写进页面 `<title>`，用 `--dump-dom` 抓出来比对。**断言只写「真实会出现的状态」** —— 比如「最长的单个词条」，而不是「最长释义 + 最长单词」这种拼出来的组合，否则红线没人能修。

## 踩过的坑（挑几条值得记的）

- **`.verse` 的高度不能用 `scrollHeight`**：题面背后那块柔光是 180% 高的绝对定位元素，会把 `scrollHeight` 顶到布局盒的 1.4 倍。拿它算「需要多少高度」等于每道题都多缩 40%。要用 `offsetHeight`，并且取舞台的**内容盒**。
- **`will-change:transform` 会改 `offsetParent`**：轮播轨道加了它之后，子元素的 `offsetLeft` 参照系就变了，居中量要按 `getBoundingClientRect` 的中心差重算。
- **`aapt2 link` 的主资源必须是位置参数**：用 `-R res.zip` 传会被当成 overlay，报 `resource style/AppTheme does not override an existing resource`。
- **`resources.arsc` 不能压缩**：targetSdk 30+ 要求它 store 进 APK。`jar uf` 会重写整个归档并重新压缩它 —— 得用 Python `zipfile` 的 `'a'` 模式只追加。
- **WebView 里不能用 `file://`**：不透明来源会让 `fetch` 被 CORS 拦、`localStorage` 直接不可用。改成给 WebView 一个假域名，在 `shouldInterceptRequest` 里把整棵路径映射到 assets。
- **系统「字体大小」会改 WebView 默认字号**，`clamp()` 算出来的题面尺寸全废 —— 得 `setTextZoom(100)`。
- **XML 注释里不能有两个连续的减号**，`aapt2` 会报 `not well-formed`。
- **同名缩写词的句点**：`a.m` / `B.C.` 这类词的句点在提示掩码里必须**直接亮出来**而不是混进待填槽 —— 判分不忽略句点（`am` 是错的），句点若占一个槽，槽位数就比「N 字母」多，玩家按槽去数必错。

## 说明

- 词库是 CET4 / CET6 词汇表；背景与看板娘立绘为 AI 生成。
- 未指定开源许可；代码随意取用。
