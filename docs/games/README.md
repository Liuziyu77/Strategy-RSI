# 游戏目录 / Game catalog

[文档导航 / Documentation](../README.md) · [启动 / Setup](../GETTING_STARTED.md) · [API](../API.md)

| ID          | 游戏 / Game       | 人数 / Players | 语言 / Languages | 规则 / Rules                                    |
| ----------- | ----------------- | -------------- | ---------------- | ----------------------------------------------- |
| `sanguosha` | 三国杀            | 2–8            | 中文             | [规则](../RULES.md)                             |
| `werewolf`  | 狼人杀 / Werewolf | 6–12           | 中文、English    | [中文](werewolf.md) · [English](werewolf.en.md) |
| `chess`     | 国际象棋 / Chess  | 2              | 中文、English    | [中文](chess.md) · [English](chess.en.md)       |
| `xiangqi`   | 中国象棋          | 2              | 中文             | [规则](xiangqi.md)                              |

四款游戏都支持模型 API、本地策略和外部 Agent，使用相同的交流、即时／赛后 RSI 与经验归纳服务。比赛可并行运行、暂停恢复、回放和导出。`gameType` 与 `locale` 在创建比赛时固定，后续编辑玩家不会改变已有比赛的模型快照。

All four games support model APIs, local policies and external Agents, with shared communication, immediate/post-game RSI and consolidation. Matches support concurrency, pause/resume, replay and export. Game type and language are fixed at creation; later player edits leave existing match configurations unchanged.

在独立的 **游戏大厅** 搜索或选择游戏卡片进入场地；点击顶部“游戏大厅”返回切换页。各自的对战档案只显示对应游戏。点击“创建对战”配置新比赛。选择中文或 English 后，创建页使用所选语言，已创建比赛的观战页遵循该比赛语言。中国象棋始终使用中文。新游戏可以直接运行本地演示，也可以从玩家库选择各自带有模型与 RSI 配置的玩家。

Browse or search the dedicated **游戏大厅** (Game Lobby) to enter a game. Return through the same header button to switch games. Each archive shows matches of that game only. Open **New match** to configure a match. Choose a language before creating a match. Existing matches retain their own language. Xiangqi is Chinese-only. Run a local demo without an API, or select configured profiles from the player library. The shared legacy profile editor remains Chinese; new game controls, rules and Agent/RSI prompts follow the match language.

切换、回放、棋盘翻转与移动端操作见[观战界面指南 / Arena UI guide](../ARENA_UI.md)。

## 经验隔离 / Memory isolation

经验按 `Agent ID × gameType` 隔离，中文和英文同一游戏共享经验。原有未标记的手动经验、旧对战及旧导入默认三国杀。新手动经验和导入使用 `gameType` 指定游戏；比赛反思与归纳从来源比赛继承类型。关闭新增 RSI 仍读取已有同游戏经验。独立基线应使用空经验玩家。

Memory is scoped by `Agent ID × gameType`; Chinese and English variants of the same game share memory. Untagged legacy data defaults to Sanguosha. Specify `gameType` for manual/imported memories; reflections and consolidation inherit it from the source match. The player library provides a game selector for manual notes and TXT imports; JSON retains its explicit scope. Disabling RSI stops new reflections but still consumes existing same-game experience. Use fresh profiles for an empty-memory baseline.

## 实验边界 / Experimental boundaries

种子只控制引擎的随机性，模型采样和并行经验的到达顺序仍可能变化。本地策略只读个人观察，用于检查游戏流程，未针对对战强度优化。默认模型决策最多尝试两次，均失败后记录错误并使用本地策略兜底；分析胜率时需检查 fallback 记录。达到决策上限记为平局，不按子力或存活人数判胜。

Seeds control engine randomness; model sampling and the arrival order of concurrent memory updates can still vary. Local policies use only player observations and are intended to check game flow, without optimizing playing strength. By default, two failed model attempts lead to a logged local fallback, which should be accounted for when analyzing win rates. Reaching the decision cap produces a draw regardless of material or surviving players.

[三国杀基线](../../exp/sanguosha/README.md)保留原实验设置和范围。[狼人杀](../../exp/werewolf/README.md)、[国际象棋](../../exp/chess/README.md)、[中国象棋](../../exp/xiangqi/README.md)各安排了 168 局真实模型基线，另有 RSI 功能验证，连同试跑均在每款 200 局以内。各报告分别列出胜负、规则和棋、上限平局及异常；功能验证尚未测量 RSI 收益。

The original [Sanguosha study](../../exp/sanguosha/README.en.md) keeps its settings and scope. [Werewolf](../../exp/werewolf/README.en.md), [Chess](../../exp/chess/README.en.md) and [Xiangqi](../../exp/xiangqi/README.en.md) each have 168 scheduled real-model baseline games plus separate RSI checks. Each stays within 200 games including pilots and validation. Reports list rule endings, action limits and failures separately; the checks have not measured RSI benefits.

升级现有数据请参阅[迁移说明 / Migration](../MIGRATION.md)。
