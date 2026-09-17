# 实验目录 / Experiments

[项目首页](../README.md#基线实验) · [English README](../README.en.md#experiments) · [文档导航](../docs/README.md)

各游戏的报告、计划、数据与图表放在独立目录中。狼人杀、国际象棋和中国象棋各有 168 局基线，由原始 24 局和新增 144 局组成；计入试跑和功能检查后，每款仍在 200 局以内。三国杀保留原有 528 局实验，没有重跑，结果也未与其他游戏合并。

Reports, plans, data and figures are stored separately for each game. Werewolf, Chess and Xiangqi each have 168 baseline games: 24 initial plus 144 additional games. Including pilots and functionality checks, each remains below 200. The earlier 528-game Sanguosha study keeps its original settings and scope; it was not rerun or pooled with other games.

## 已有报告 / Available reports

| 游戏 / Game        | 正式排程 / Baseline | 完成 / Completed | 异常 / Errors | 含试跑验证 / Total & cap    | 报告与数据 / Reports & data                                                                      |
| ------------------ | ------------------- | ---------------- | ------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| 三国杀 / Sanguosha | 528                 | 489              | 39            | 历史实验 / historical study | [中文](sanguosha/README.md) · [English](sanguosha/README.en.md) · [Data](sanguosha/results.json) |
| 狼人杀 / Werewolf  | 168                 | 156              | 12            | 176 / 200                   | [中文](werewolf/README.md) · [English](werewolf/README.en.md) · [Data](werewolf/results.json)    |
| 国际象棋 / Chess   | 168                 | 77               | 91            | 180 / 200                   | [中文](chess/README.md) · [English](chess/README.en.md) · [Data](chess/results.json)             |
| 中国象棋 / Xiangqi | 168                 | 73               | 95            | 175 / 200                   | [中文](xiangqi/README.md) · [English](xiangqi/README.en.md) · [Data](xiangqi/results.json)       |

“完成”包括规则胜负、规则和棋及行动上限平局，报告会分别列出。调用失败的对局计入场数和可靠性分析，不记为败局。基线关闭 RSI，每次决策使用空经验；另行保存的 RSI 功能验证只检查流程，尚未测量学习收益。

Completed games include rule wins, rule draws and action-limit draws, listed separately in the reports. Games that fail on model calls count toward budgets and reliability analysis, but are not losses. Baselines use empty memory with RSI off. Separate RSI checks test the workflow without measuring learning benefits.

## 对局历史 / Game histories

四款游戏的正式对局历史均保存在 `exp/` 下，采用 gzip 压缩 JSON，包含异常局。压缩只改变文件存储方式，不删减记录。

All formal game histories, including failed games, are stored under `exp/` as gzip-compressed JSON. Compression preserves the complete records.

| 游戏 / Game                     | History                                                                              | 局数 / Games | 压缩大小 / Compressed size |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------ | -------------------------- |
| 三国杀双人 / Sanguosha duels    | [sanguosha/games-history-duel.json.gz](sanguosha/games-history-duel.json.gz)         | 240          | 2.47 MB                    |
| 三国杀身份 / Sanguosha identity | [sanguosha/games-history-identity.json.gz](sanguosha/games-history-identity.json.gz) | 288          | 6.78 MB                    |
| 狼人杀 / Werewolf               | [werewolf/games-history.json.gz](werewolf/games-history.json.gz)                     | 168          | 1.77 MB                    |
| 国际象棋 / Chess                | [chess/games-history.json.gz](chess/games-history.json.gz)                           | 168          | 1.20 MB                    |
| 中国象棋 / Xiangqi              | [xiangqi/games-history.json.gz](xiangqi/games-history.json.gz)                       | 168          | 1.69 MB                    |

三款新游戏的历史中，`games[].actions` 是已执行行动，`games[].events` 包含游戏事件和聊天，`games[].finalState` 是终止时状态。狼人密谈保留可见性标记。试跑和 RSI 功能验证的摘要在各自 `results.json` 中，完整原始输入、响应与检查点保存在本地 `artifacts/`。

For the three new games, `games[].actions` stores executed actions, `games[].events` includes game events and chat, and `games[].finalState` records the state at termination. Private wolf messages retain visibility markers. Pilot and RSI-check summaries are in each `results.json`; raw inputs, responses and checkpoints remain in local `artifacts/`.

## 目录与复现 / Layout and reproduction

```text
exp/
  sanguosha/       原始三国杀报告、历史、六组图表
  werewolf/        狼人杀报告、计划、数据、统计、历史、六组图表
  chess/           国际象棋报告、计划、数据、统计、历史、六组图表
  xiangqi/         中国象棋报告、计划、数据、统计、历史、六组图表
  reproduce.py    三款新游戏共用的离线分析、绘图与报告入口
  _shared/         公共代码、依赖、配置示例与相同的历史源码
```

三款新游戏通过 [reproduce.py](reproduce.py) 复用分析、绘图和报告流程，依赖与配置示例集中在 [\_shared/](./_shared/)。重复的历史源码快照也只保留一份，游戏自己的计划、结果和 history 仍各自保存。三国杀的历史实验使用不同依赖版本，保留原绘图和导出脚本。

```bash
pip install -r exp/_shared/requirements.txt
python3 exp/reproduce.py chess
# 仅重新生成狼人杀报告：
python3 exp/reproduce.py werewolf report
```

公开 JSON 足以重算三款新游戏的分析、图表和报告，无需 API。每游戏六张 PNG 均为 2816 × 1276，另提供 SVG。

原始决策输入、响应和检查点保存在本地 `artifacts/` 中，该目录不提交到仓库。公开历史含全知角色和私聊信息，供研究者复盘，不能直接作为 Agent 输入。

The three new games use [reproduce.py](reproduce.py) for analysis, figures and reports. Shared dependencies, configuration and identical historical snapshots live in [\_shared/](./_shared/); plans, results and histories stay with each game. Sanguosha keeps its original scripts and dependency versions. Public JSON is sufficient for offline reproduction. Each game has six 2816 × 1276 PNGs and matching SVGs.

Raw model inputs, responses and checkpoints stay in the local, ignored `artifacts/` directory. Published histories include private roles and chat for research review; they must not be passed directly to Agents.

## 设计 RSI 对照 / Designing RSI comparisons

| 条件 / Condition                        | 配置与目的 / Setup and purpose                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 空经验 Baseline / Empty-memory baseline | 使用独立的空经验玩家，关闭新增 RSI。Use a separate player profile with no memory and RSI off.                                                                       |
| 冻结经验 / Frozen experience            | 先积累或归纳经验，再关闭新增 RSI，在未用于学习的局面或种子上评估。Collect or consolidate experience, disable new RSI, then evaluate on held-out positions or seeds. |
| 持续 RSI / Ongoing RSI                  | 开启即时、赛后或双模式，并报告经验生成与评估的用量。Enable immediate, post-game or both modes, reporting learning and evaluation usage separately.                  |

关闭 RSI 后，已有经验仍会进入决策上下文。经验按 Agent ID × 游戏类型保存，同一游戏的中英文比赛共享经验。不同实验条件应使用不同玩家档案；并行对局可能读到刚写入的经验，因此还需记录排程与经验到达顺序。

Existing memory still enters decision contexts when RSI is disabled. Experience is scoped by Agent ID × game type and shared between languages of the same game. Use separate profiles for independent conditions. Concurrent games may read newly written experience from the same agent, so record scheduling and memory arrival order.

报告至少说明以下条件，具体协议可按游戏补充：

- 代码和规则版本、语言、模型标签、提示词与上下文设置。
- 对手、人数、身份或执棋方、座位、种子，以及学习与评估的划分。
- 交流开关、信息可见范围、初始经验、RSI 模式和归纳策略。
- 并行数、决策上限、样本量、异常局处理、兜底比例、时间与 Token 的统计方式。

Record game / model versions, language, prompts and context; opponents, roles or colors, seats, seeds and learning / evaluation splits; communication and memory settings; concurrency, decision limits, sample sizes, failures, fallbacks, timing and token definitions. Engine seeds control game randomness, but do not guarantee identical model responses or concurrent memory ordering.

按游戏分别分析结果，检查角色或执棋方的分布，不将不同游戏的胜率直接合并为能力结论。狼人杀等隐藏信息环境的 Agent 输入只能使用当时可见内容；全知观战与导出用于研究者复盘。功能截图、本地演示和回放片段用于说明界面，不能代替对照实验。

Analyze games separately and account for role or color distributions. Agents in hidden-information games must receive only their visible context; omniscient views and exports are for researchers. Interface screenshots, local demonstrations and replay clips do not substitute for controlled experiments.

[对战与导出 API](../docs/API.md) · [经验与运行机制](../docs/ARCHITECTURE.md) · [素材来源](../docs/MEDIA.md)

## 后续报告的组织 / Organizing future reports

新增游戏使用 `exp/<game>/`。同一游戏有多批独立实验时，在该目录内按日期或实验编号分组；公共脚本放在 `_shared/`。每份报告保留批次设置、源码哈希、场数预算、异常和停止原因，并链接到对应数据与复现脚本。

Use `exp/<game>/` for each game, with subfolders by date or study ID when adding independent studies. Shared scripts go in `_shared/`. Each report should record cohort settings, source hashes, game budgets, errors and stopping reasons, and link to its data and reproduction scripts.
