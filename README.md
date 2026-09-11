<div align="center">

<img src="docs/assets/logo.png" alt="Strategy-RSI logo" width="150" />

# Strategy-RSI

**A Multi-Agent Arena for Strategy, Reflection & Persistent Memory**

三国杀多智能体博弈与经验学习平台

让模型同桌交锋，让经验进入下一次决策。

<img src="docs/assets/badges.svg" alt="Node.js 22.13+ · TypeScript · 2–8 Agents · Apache 2.0" width="620" />

<br />
<br />

[动态演示](#动态演示) · [核心功能](#核心功能) · [快速启动](#快速启动) · [经验机制](#经验机制) · [文档](#文档)

</div>

---

Strategy-RSI 以三国杀身份局为环境，将模型 API、规则引擎、玩家档案和文本经验连接起来。不同 Agent 在有限可见信息下判断身份、协商目标、分配卡牌资源，并通过行动后反思与赛后复盘积累经验。

当前支持 **2–8 人对战、108 张标准包及 EX 卡牌、8 名基础武将**，提供从组织多局实验到观战、回放和导出分析的完整流程。双人局采用简化的主公与反贼对决；具体实现范围见[规则文档](docs/RULES.md)。

## 动态演示

<a href="docs/assets/arena-demo.mp4">
  <img src="docs/assets/arena-demo.gif" alt="五人局实时出牌、Agent 公开聊天和并行切局演示" width="100%" />
</a>

<div align="center">
  <sub>五人身份局 · 动态出牌 · 公开聊天 · 多局实时切换</sub><br />
  <a href="docs/assets/arena-demo.mp4">查看 MP4 视频</a> · <a href="docs/assets/arena.png">查看高清截图</a>
</div>

<br />

<a href="docs/assets/experience-demo.mp4">
  <img src="docs/assets/experience-demo.gif" alt="玩家参战历史、即时与赛后经验分组以及经验归纳过程" width="100%" />
</a>

<div align="center">
  <sub>从多局交锋到个人经验：按场归集、分类复盘、归纳复用</sub><br />
  <a href="docs/assets/experience-demo.mp4">查看 MP4 视频</a> · <a href="docs/assets/experience.png">查看归纳结果</a>
</div>

> 演示由项目实际界面与规则引擎录制，使用独立数据、本地策略驱动的模拟 API，以及脚本示例聊天和反思；用于展示功能，不代表真实大模型的能力评测。[素材说明与重新录制](docs/MEDIA.md)

## 核心功能

|        | 能力                     | 使用方式                                                                          |
| :----: | ------------------------ | --------------------------------------------------------------------------------- |
| **01** | **不同模型，同桌对战**   | 每位玩家独立配置模型与 API；也支持本地策略和通过 HTTP 接入的外部 Agent。          |
| **02** | **个人档案，跨场积累**   | 名字、武将、连接配置、RSI、个人经验与参战历史关联到固定玩家 ID。                  |
| **03** | **多局并行，随时观战**   | 一场对战运行多局，自定义并行数；切换不同局观摩，独立保存状态与记录。              |
| **04** | **公开聊天，策略交锋**   | Agent 自主发言或沉默，可以试探、协商和施压；本局聊天进入后续决策与复盘上下文。    |
| **05** | **双模式 RSI，经验归纳** | 行动后即时反思、整局结束后复盘；调用 Agent 自身模型整理多局经验，保留原文与版本。 |
| **06** | **过程可查，结果可比**   | 动作、模型调用和经验留档；逐帧回放、按场胜率、时长与轮次统计、JSON / JSONL 导出。 |

<table>
  <tr>
    <td width="50%"><a href="docs/assets/player-library.png"><img src="docs/assets/player-library.png" alt="玩家库与按场统计的参战历史" /></a></td>
    <td width="50%"><a href="docs/assets/experience.png"><img src="docs/assets/experience.png" alt="即时与轮次经验的归纳结果" /></a></td>
  </tr>
  <tr>
    <td align="center"><sub>玩家库：配置、经验与战绩集中管理</sub></td>
    <td align="center"><sub>经验归纳：原文保留，结果用于后续决策</sub></td>
  </tr>
</table>

## 快速启动

需要 **Node.js ≥ 22.13**。

```bash
git clone https://github.com/Liuziyu77/Strategy-RSI.git
cd Strategy-RSI
npm ci
npm run dev
```

打开 **http://localhost:3930**，点击 **「运行本地演示」**，即可在无需 API Key 的情况下观看策略 Agent 对战。

接入真实模型时，在 **「玩家库 → 创建玩家」** 选择模型 API，填写专属 API 地址、密钥和模型名称；接口需兼容 `POST /v1/chat/completions`。也可以通过 `.env` 配置共享服务，示例见 [.env.example](.env.example)。

随后在 **「新建对战」** 中邀请玩家入座，设置总局数、并行数、身份安排与聊天开关，即可开始观战。更多配置见[启动与模型接入](docs/GETTING_STARTED.md)。

<details>
<summary><b>生产运行与数据保存</b></summary>

```bash
npm run build
npm start
```

默认数据存储于 `data/arena.sqlite`。重启后未完成对战恢复为暂停，点击继续可从检查点接着运行。支持 `DATA_DIR`、`PORT`、`HOST` 与 `ARENA_ADMIN_TOKEN` 配置。一个数据目录对应一个服务进程。

</details>

## 经验机制

<img src="docs/assets/experience-loop.svg" alt="可见信息和个人经验进入模型决策；规则执行后通过即时反思或赛后复盘回写经验，并支持归纳" width="100%" />

| 模式         | 触发时机             | 经验用途                                         |
| ------------ | -------------------- | ------------------------------------------------ |
| 即时 RSI     | 有选择的行动完成后   | 模型判断是否产生可复用的新经验，再写入个人档案。 |
| 轮次 RSI     | 每局结束后           | 对整局进行复盘，与即时经验分开保存。             |
| 双模式       | 同时启用上述两种机制 | 从具体行动与整局过程两个层面积累经验。           |
| 关闭新增 RSI | 不再生成新反思       | 仍可读取已有经验，适合固定经验条件下的测试。     |

经验按 **玩家 → 对战 → 来源局与类型** 组织。同一 Agent 在并行牌局中完成的经验，会供它的后续决策读取；其他玩家的私有经验不会共享。公开聊天按当前局隔离。

**经验归纳**会调用该玩家当前配置的模型，对多局记录去重、重写和总结。最新有效归纳优先进入后续上下文，未被覆盖的新经验继续生效，原文与旧版本保留。

当前 RSI 通过**文本反思、持久记忆和上下文更新**实现，不进行模型权重训练。经验质量与收益需要结合具体决策和对照实验检验；单次胜率变化不能直接归因于学习效果。

## 为实验保留过程

模型接收自己的可见状态、合法动作、历史、聊天与个人经验，由规则引擎校验并执行选择。出牌与可选发言共用一次决策请求；弃牌阶段合并选牌，唯一合法行动自动执行。模型调用失败或动作无效时，日志记录重试与本地兜底情况。

对照实验可以配置随机种子、身份与座位安排、不同 RSI 模式及独立玩家档案。比较结果时应同时检查身份分布、样本量、对手与 API 兜底情况。随机种子可控制引擎随机过程，模型响应和并行经验到达顺序仍可能变化。

## 文档

| 文档                                      | 内容                                             |
| ----------------------------------------- | ------------------------------------------------ |
| [启动与模型接入](docs/GETTING_STARTED.md) | 本地运行、API、对战参数、经验管理与存档恢复。    |
| [规则范围](docs/RULES.md)                 | 已实现的身份配置、108 张卡牌、装备与基础武将。   |
| [架构与数据流](docs/ARCHITECTURE.md)      | 规则状态机、多局调度、可见信息、聊天与经验存储。 |
| [HTTP API](docs/API.md)                   | 玩家库、对战控制、外部 Agent、导出与归纳接口。   |
| [展示素材](docs/MEDIA.md)                 | Logo 设计、动图与视频、素材来源和重新录制方法。  |

<details>
<summary><b>开发与验证</b></summary>

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

单元与集成测试覆盖规则、信息隔离、存档、模型协议、RSI、归纳及并行聊天。浏览器测试覆盖桌面与手机交互。常规测试使用临时数据和本地模拟模型，不消耗真实模型 API。

```text
src/       规则状态机、卡牌与协议类型
server/    模型接入、调度、聊天、经验与 SQLite
web/       React 观战、玩家库、回放与动画
tests/     规则、服务集成与浏览器测试
scripts/   仿真、外部 Agent 与展示素材录制
docs/      接入文档、规则说明与展示资源
```

</details>

## 许可与致谢

本仓库采用 [Apache License 2.0](LICENSE)。基础功能与规则设计参考 [wmzy/sanguosha](https://github.com/wmzy/sanguosha)，本项目重新实现了规则状态机、服务协议与前端，未使用其图片、音效或武将美术资源。来源说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

<div align="center">
  <sub>Strategy-RSI · Observe the game. Reflect on the choices.</sub>
</div>
