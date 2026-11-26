# 弈境：中国象棋 AI 对战平台

## 启动

需要 Node.js 24 或更新版本，无 npm 依赖。双击 start.bat，浏览器打开 http://127.0.0.1:3100 。或在本目录运行 `node server.mjs`。

首次克隆后，在项目目录运行 `powershell -ExecutionPolicy Bypass -File .\setup-engine.ps1`。脚本下载并校验官方 Pikafish 2026-09-06 与配套 NNUE，解压至 engine 目录。可设置 PIKAFISH_PATH 指定其他引擎，PIKAFISH_CWD 指定工作目录。引擎错误明确显示，不会使用替代 AI。

来源：https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06
原生引擎受 GPLv3 约束，许可证、作者和 NNUE 许可见 engine 目录。对应源码：https://github.com/official-pikafish/Pikafish/tree/Pikafish-2026-09-06 。再次分发必须遵守上游许可。

## 操作

点击棋子和目标位置，或从起点拖到目标位置；手机支持触屏。选子显示合法位置。切换执子后点重新开始。难度限制搜索时间，搜索参数可单独覆盖；Threads 和 Hash 只在 UCI 实际声明支持时设置，并依据引擎范围截断。深度和时间以先达到的限制为准。高级默认 3 秒，专家 10 秒；当前默认 2 线程，可在设置中增大。

悔棋撤销最近一组着法至玩家回合。保存和恢复使用当前浏览器 localStorage，恢复前逐步验证走法。AI 出错后可以重试。思考期间可重新开始、悔棋，过期返回值不会写入新棋局。后端按完整历史重建局面，通过 position fen … moves … 将全部着法交给常驻 Pikafish。悔棋、重开、恢复棋局和认输会取消旧搜索。后端发送 stop 并等弃用的 bestmove 返回后才启动下一个搜索。引擎崩溃、超时或无响应时会关闭进程，下次请求重新启动。

## 实现范围与限制

已实现七类棋子的走法、马腿、象眼、炮架、河界、九宫、照面、自陷将军过滤、将死、困毙、认输、棋谱、吃子、选择双方和存档。AI 返回在后端和前端均校验。

adjudication.mjs 按初始棋盘格分配固定棋子 ID。每步记录棋子迁移、吃子、将军和新出现的合法吃子目标。吃子目标是候选，须进一步判断才记为捉。重复裁决确认三轮相同着法循环，按第 23–26 条处理已经识别的单方长将、单方禁着、双方禁着及允许循环。除长将立即判负外，给两回合变着窗口。25 回合内本应双方不变作和的局面，由红方变着。无法确认的首着或复杂杀捉暂停人工裁决。

慢棋自然限着在连续无吃子阶段自动审核，以双方都满 60 个计入着次为准。分别模拟两方提出申请，提出方最多计入 10 次将军。吃子重置计数，终局和待判循环优先。此处自动审核用于本地对局，没有计时、犯规扣时或快棋规则。

复杂多步杀法、联合捉、根子与完整交换价值、九回合非标准循环例外仍未完整自动覆盖。已按第八章图 6 原图及着法验证自动长将裁决。图 7、12、19、25 同时覆盖官方定性的裁决表和原图局面的人工裁决路径。另用构造局面验证直接长捉识别。不能据此认定完整支持 2020 版竞赛规则。提和按钮暂不实现 AI 接受提和。


当前后端为本机单用户服务，不含账户、对局持久化和互联网部署。使用原生 ES modules + SVG，未使用 React/Vite；本机 npm 路径损坏，因此使用零第三方依赖的实现。

## 测试

运行 `node --test --test-isolation=none`。测试覆盖基础走法、中文棋谱、固定 ID、长将、直接长捉、变着窗口、自然限着、悔棋重开和旧存档恢复。引擎协议测试覆盖完整历史、常驻进程、HTTP 断开取消、超时与崩溃恢复。


## 结构

- rules.mjs：基础规则和 FEN/UCI 坐标
- adjudication.mjs：棋例证据、待判循环与自然限着
- game.mjs：走棋、重放、恢复、悔棋与搜索请求生命周期
- engine.mjs：原生 UCI 异步适配
- server.mjs：本机 HTTP/API
- app.mjs、style.css、index.html：界面和对局管理



## Netlify 部署

在线版使用独立 GitHub 源码和 Netlify 函数，当前线上地址为 https://yijing-xiangqi-1124.netlify.app/ 。更新时先运行 `powershell -ExecutionPolicy Bypass -File .\setup-engine.ps1 -Netlify`，再运行 `python deploy-netlify/build.py`。使用 Netlify CLI 登录并确认关联正确站点后部署：

```powershell
netlify deploy --prod --no-build --dir deploy-netlify/build/public --functions deploy-netlify/build/functions
```
