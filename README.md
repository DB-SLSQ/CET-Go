# CET Go

看中文释义，限时把英文单词**拼**出来。

玩法照搬《漢字でGO!》：单词卡从远处一路压过来，时间条走完就正好撞到你脸上 —— 撞上的瞬间定格 1.3 秒，然后弹「TIME UP」。

纯本地、纯离线、零依赖：只用 Node 内置模块起个本地服务，界面是原生 HTML/CSS/JS，没有任何 npm 包。

<p>
  <img src="docs/ui-title.png" width="49%">
  <img src="docs/ui-game.png" width="49%">
</p>

---

## 怎么拿到 / 装上

| 产物 | 适合 |
|---|---|
| `CETGo-Setup.exe`（33 MB） | **推荐**：双击 → 自动装到 `%LOCALAPPDATA%\CETGo` → 建桌面 + 开始菜单快捷方式 → 自动打开；在「设置 → 应用」里有卸载入口 |
| `CETGo-PC.zip`（33 MB，自带 `node.exe`） | 绿色免安装：解压后双击 `CET Go.vbs` 就玩，随身带 U 盘也行 |
| `CETGo-PC-lite.zip`（1.9 MB） | 对方已经装了 Node.js 时用这个 |

安装版是用 Windows 自带的 `iexpress.exe` 打的（`tools/build-exe.py`），没有引入任何打包工具。
包本身是 **x86** 的（用 `SysWOW64\iexpress.exe` 生成），32 位 / 64 位 Windows 都能双击运行。
⚠️ 因为没买代码签名证书，粉丝下载后第一次运行会看到 SmartScreen 蓝框，
点「更多信息 → 仍要运行」即可（本地自己打出来的那份没有这个提示）。

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
node server.js --lan    # 绑到 0.0.0.0，同一 Wi-Fi 下的其他电脑能下载绿色包（/pc）
node server.js --keep-alive   # 关掉「空闲 150 秒自动退出」
```

关窗口后服务会自己退，不会留后台进程。

> 曾经开过一个安卓 APK 版（零权限 WebView 壳 + JS 桥存档），手机端适配没做好，已下线删除。这是个纯电脑版游戏。

## 目录

```
server.js              本地服务：静态文件 + /api/state 存档
public/                整个前端
  index.html           六个屏幕：标题 / 准备 / 游戏 / 结算 / 设置 / 错题本
  js/words.js          词库：加载、释义清洗、判分归一化、提示掩码
  js/app.js            游戏逻辑：出题、计时、逼近演出、计分、存档
  js/sfx.js            Web Audio 合成的 8-bit 音效
  assets/              背景与立绘（webp）
data/words_cet4.json   词库（3518 条）
data/words_cet6.json   词库（2271 条）
tools/                 构建与自测脚本（见下）
docs/                  截图归档
```

**`tools/` 里有什么**

| 脚本 | 干什么 |
|---|---|
| `selftest.js` | Node 直跑的词库 / 清洗 / 判分 / 掩码自测 + HTML id 与 JS 引用一致性 |
| `build-pc-zip.py` | 出绿色免安装包（完整版自带 `node.exe` / 精简版不带） |
| `build-exe.py` | 把绿色包再打成**安装版** `CETGo-Setup.exe`（系统自带 `iexpress.exe`，零三方依赖） |
| `install.bat` · `mklnk.vbs` | 只活在安装版 exe 里的安装脚本：解包 → 建快捷方式 → 写「应用和功能」条目 → 启动 |
| `uninstall.vbs` | 卸载器（会随包一起装进 `%LOCALAPPDATA%\CETGo`） |
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
| `_itest.html` | 主页交互：轮播、翻卡、开局、判定规则（重试/超时/字母数）、按钮尺寸、存档落盘 |
| `_wmprobe.html` | 左下角作者水印：完整在视口内、两个字面控件点得到、不压住任何文字或按钮 |
| `_shot.html` · `_m.html` | 截图与盒模型排查 |

结论写进页面 `<title>`，用 `--dump-dom` 抓出来比对。**断言只写「真实会出现的状态」** —— 比如「最长的单个词条」，而不是「最长释义 + 最长单词」这种拼出来的组合，否则红线没人能修。

安装版 exe 是**真的装了一遍**验的，不是只看体积：把 exe 跑起来 → 轮询 `%LOCALAPPDATA%\CETGo` 出现 → 核对 26 个文件、开始菜单两个快捷方式、`HKCU\...\Uninstall\CETGo` 的六个值、以及 `127.0.0.1:27656` 有没有被自动拉起来。
本机 bash 不能调 `cmd.exe`，但 **Python 的 `os.startfile` 能拉起 exe**（走 ShellExecute），探针脚本放在 `_shots\` 下（不进仓库）。

## 踩过的坑（挑几条值得记的）

- **IExpress 的 `AppLaunched` 绝不能写裸批处理**：wextract 会拼出 `Command.com /c <临时目录>\install.bat`，而 `command.com` 是 16 位的命令解释器，**Windows 10/11 x64 上根本不存在**，双击就弹「创建进程 `<Command.com /c ...IXP000.TMP\install.bat>` 时出错。原因：系统找不到指定的文件。」必须写成 `cmd.exe /d /c install.bat`（`/d` 跳过 AutoRun 注册表项）。`build-exe.py` 打完包会自动检查 exe 里有没有这条字符串。
- **`iexpress.exe` 的输出架构 = 打包器自身的架构**：直接用 `System32` 那个会产出 **x64 包**，32 位 Windows 上直接报「不是有效的 Win32 应用程序」。要用 `SysWOW64\iexpress.exe` 出 x86 包（32 位系统上没有 SysWOW64，那时 System32 本身就是 x86，退回即可）。
- **wextract 会把子进程 cwd 强制设成解包临时目录**：实测把父进程 cwd 设成 `C:\` 也一样，`%~dp0` 就是 `%TEMP%\IXP000.TMP\`。所以 `AppLaunched` 里用相对文件名是安全的，脚本内部再用 `%~dp0` 定位同目录的 `payload.zip`。
- **35 MB 解包时那个 2 KB 的 `uninstall.vbs` 偶尔会掉**：本机装着火绒，实测多次出现「其余 25 个文件都到位、就它没有」。所以 `install.bat` 在解包后单独再解它一次（`tar -xf payload.zip CETGo/uninstall.vbs`）—— 第二次一定落地，`build-pc-zip.py` 也会核对清单，少一个就报错退出，不会闷声发出一个没有卸载器的安装包。
- **卸载要先关游戏窗口**：`.browser`（游戏用的 Edge 配置缓存）在窗口开着时被占用，`rd /s /q` 删不掉，会剩下一个空壳目录；关掉窗口后删掉 `%LOCALAPPDATA%\CETGo` 即可。卸载器本身会先删注册表条目和两个快捷方式，再删目录，所以"设置 → 应用"里不会留残留项。
- **`.bat` / `.vbs` 必须是纯 ASCII + CRLF**：cmd 按 ANSI 读批处理，写进去的中文注释会变乱码甚至吃掉命令行；用 Edit 工具改完一定要跑一遍归一化（`tools` 里的脚本都会自己归一化 `mklnk.vbs` / `install.bat`）。
- **`.verse` 的高度不能用 `scrollHeight`**：题面背后那块柔光是 180% 高的绝对定位元素，会把 `scrollHeight` 顶到布局盒的 1.4 倍。拿它算「需要多少高度」等于每道题都多缩 40%。要用 `offsetHeight`，并且取舞台的**内容盒**。
- **`will-change:transform` 会改 `offsetParent`**：轮播轨道加了它之后，子元素的 `offsetLeft` 参照系就变了，居中量要按 `getBoundingClientRect` 的中心差重算。
- **碰撞检测不能用「撑满一行的容器」当对象**：模式指示点 `.car-dots` 是全宽 flex（圆点居中），拿它的盒子去比，水印永远被判成压住了它 —— 要比就比真正的可见单元 `.car-dot`。
- **同名缩写词的句点**：`a.m` / `B.C.` 这类词的句点在提示掩码里必须**直接亮出来**而不是混进待填槽 —— 判分不忽略句点（`am` 是错的），句点若占一个槽，槽位数就比「N 字母」多，玩家按槽去数必错。
- **水印别跟着界面元素走**：`.wm` 是 `position:fixed`、`pointer-events:none`（只给字面控件开），层级压在内容之上、弹窗之下；标题屏底下那条跑马灯是满宽贴底的，所以用 `body:has(#s-title.show) .wm{bottom:64px}` 把它抬到跑马灯上方。

## 说明

- 作者：**深蓝书签** · B站 [space.bilibili.com/484110391](https://space.bilibili.com/484110391) · 粉丝群 **1124017564**
- 未联网排行榜、没做账号；所有数据只落在你自己的机器上。
- 开源许可：**MIT**（见 [`LICENSE`](LICENSE)）。词库是 CET4 / CET6 词汇表；**素材**（背景、看板娘立绘、音效）**不在此列** —— 它们是 AI 生成的，可随这个项目一起用，但请不要单独拿去分发。
