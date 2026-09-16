# 实验目录 / Experiments

[项目首页](../README.md#基线实验) · [English README](../README.en.md#experiments) · [文档导航](../docs/README.md)

实验按游戏独立组织。游戏环境、模型交流与 RSI 功能已接入，不等于已完成模型能力评测或证明 RSI 收益。以下状态截至 2026-09-16；新报告发布时在本页登记设置、数据与复现入口。

Experiments are organized by game. An implemented environment with communication and RSI does not establish model performance or a learning benefit. The status below is dated 2026-09-16; register new reports with their setup, data and reproduction instructions.

## 已有报告 / Available reports

| 游戏 / Game        | 公开实验 / Published study                                                                               | 入口 / Links                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 三国杀 / Sanguosha | 四模型、空经验、RSI 关闭；528 局排程，489 局正常、39 局异常。Four-model baseline, empty memory, RSI off. | [中文报告与图表](sanguosha/README.md) · [English report and figures](sanguosha/README.en.md) · [统计数据 / Summary data](sanguosha/results.json) |
| 狼人杀 / Werewolf  | 尚未发布基线或 RSI 对照报告。No baseline or controlled RSI report published.                             | [中文规则](../docs/games/werewolf.md) · [English rules](../docs/games/werewolf.en.md)                                                            |
| 国际象棋 / Chess   | 尚未发布基线或 RSI 对照报告。No baseline or controlled RSI report published.                             | [中文规则](../docs/games/chess.md) · [English rules](../docs/games/chess.en.md)                                                                  |
| 中国象棋 / Xiangqi | 尚未发布基线或 RSI 对照报告。No baseline or controlled RSI report published.                             | [规则与裁定范围](../docs/games/xiangqi.md)                                                                                                       |

三国杀报告保留原实验设置、六组图表、正常与异常对局、历史行动和聊天，以及数据导出和绘图脚本。它限定于原实验的模型标签、规则、提示词、武将与采样种子，不代表其他游戏的表现，也没有检验 RSI 效果。

The Sanguosha report preserves the original setup, six figures, normal and failed games, action and chat histories, and export / plotting scripts. Its findings apply to those model labels, rules, prompts, generals and sampled seeds, and do not measure RSI effects or performance in other games.

## 设计 RSI 对照 / Designing RSI comparisons

| 条件 / Condition                        | 配置与目的 / Setup and purpose                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 空经验 Baseline / Empty-memory baseline | 使用独立的空经验玩家，关闭新增 RSI。Use a separate player profile with no memory and RSI off.                                                                       |
| 冻结经验 / Frozen experience            | 先积累或归纳经验，再关闭新增 RSI，在未用于学习的局面或种子上评估。Collect or consolidate experience, disable new RSI, then evaluate on held-out positions or seeds. |
| 持续 RSI / Ongoing RSI                  | 开启即时、赛后或双模式，并报告经验生成与评估的用量。Enable immediate, post-game or both modes, reporting learning and evaluation usage separately.                  |

**关闭 RSI 不会清空已有经验。** 经验按 Agent ID × 游戏类型保存，同类游戏的中英文比赛共享经验。独立实验条件应使用不同玩家档案；并行对局可能读取此前刚写入的同游戏经验，排程与经验到达顺序应作为实验条件记录。

**Disabling RSI does not clear existing memory.** Experience is scoped by Agent ID × game type and shared between languages of the same game. Use separate profiles for independent conditions. Concurrent games may read newly written experience from the same agent, so record scheduling and memory arrival effects.

报告至少说明以下条件，具体协议可按游戏补充：

- **游戏与模型**：代码和规则版本、语言、模型标签、提示词与上下文设置。
- **环境与分组**：对手、人数、身份或执棋方、座位安排、种子，以及学习与评估划分。
- **交流与经验**：交流开关、信息可见范围、初始经验、RSI 模式和归纳策略。
- **运行与统计**：并行数、决策上限、样本量、异常局处理、兜底比例、时间与 Token 口径。

Record game / model versions, language, prompts and context; opponents, roles or colors, seats, seeds and learning / evaluation splits; communication and memory settings; concurrency, decision limits, sample sizes, failures, fallbacks, timing and token definitions. Engine seeds control game randomness, but do not guarantee identical model responses or concurrent memory ordering.

按游戏分别分析结果，检查角色或执棋方的分布，不将不同游戏的胜率直接合并为能力结论。狼人杀等隐藏信息环境的 Agent 输入只能使用当时可见内容；全知观战与导出用于研究者复盘。功能截图、本地演示和回放片段用于说明界面，不能代替对照实验。

Analyze games separately and account for role or color distributions. Agents in hidden-information games must receive only their visible context; omniscient views and exports are for researchers. Interface screenshots, local demonstrations and replay clips do not substitute for controlled experiments.

[对战与导出 API](../docs/API.md) · [经验与运行机制](../docs/ARCHITECTURE.md) · [素材来源](../docs/MEDIA.md)

## 后续报告的组织 / Organizing future reports

每个游戏使用自己的目录；同游戏有多批实验时再按实验编号或日期分目录。报告应链接具体数据和复现脚本，标明真实模型调用、本地策略与回放素材的区别。保留既有实验的原始范围和统计口径，避免以更新后的实现说明覆盖历史设置。

Use a directory per game, adding experiment IDs or dates when multiple studies exist. Link data and reproduction scripts, distinguish model runs from local policies and replays, and preserve historical methods and scope when the implementation changes.
