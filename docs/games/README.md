# 游戏目录 / Game catalog

| ID          | 游戏 / Game       | 人数 / Players | 语言 / Languages | 规则 / Rules                                    |
| ----------- | ----------------- | -------------- | ---------------- | ----------------------------------------------- |
| `sanguosha` | 三国杀            | 2–8            | 中文             | [规则](../RULES.md)                             |
| `werewolf`  | 狼人杀 / Werewolf | 6–12           | 中文、English    | [中文](werewolf.md) · [English](werewolf.en.md) |
| `chess`     | 国际象棋 / Chess  | 2              | 中文、English    | [中文](chess.md) · [English](chess.en.md)       |
| `xiangqi`   | 中国象棋          | 2              | 中文             | [规则](xiangqi.md)                              |

所有游戏共用模型 API、本地策略、外部 Agent、聊天、即时 RSI、赛后 RSI、归纳、并行、暂停恢复、回放与导出。创建比赛时固定 `gameType` 与 `locale`。后续修改玩家不改变已创建比赛的模型快照。

All games share model/local/external Agents, communication, immediate and post-game RSI, consolidation, concurrency, pause/resume, replay and exports. A match fixes its game type and language. Player edits do not change existing match configuration snapshots.

在独立的 **游戏大厅** 搜索或选择游戏卡片进入场地；点击顶部“游戏大厅”返回切换页。各自的对战档案只显示对应游戏。点击“创建对战”配置新比赛。选择中文或 English 后，创建页使用所选语言，已创建比赛的观战页遵循该比赛语言。中国象棋始终使用中文。新游戏可以直接运行本地演示，也可以从玩家库选择各自带有模型与 RSI 配置的玩家。

Browse or search the dedicated **游戏大厅** (Game Lobby) to enter a game. Return through the same header button to switch games. Each archive shows matches of that game only. Open **New match** to configure a match. Choose a language before creating a match. Existing matches retain their own language. Xiangqi is Chinese-only. Run a local demo without an API, or select configured profiles from the player library. The shared legacy profile editor remains Chinese; new game controls, rules and Agent/RSI prompts follow the match language.

切换、回放、棋盘翻转与移动端操作见[观战界面指南 / Arena UI guide](../ARENA_UI.md)。

## 经验隔离 / Memory isolation

经验按 `Agent ID × gameType` 隔离，中文和英文同一游戏共享经验。原有未标记的手动经验、旧对战及旧导入默认三国杀。新手动经验和导入使用 `gameType` 指定游戏；比赛反思与归纳从来源比赛继承类型。关闭新增 RSI 仍读取已有同游戏经验。独立基线应使用空经验玩家。

Memory is scoped by `Agent ID × gameType`; Chinese and English variants of the same game share memory. Untagged legacy data defaults to Sanguosha. Specify `gameType` for manual/imported memories; reflections and consolidation inherit it from the source match. Disabling RSI stops new reflections but still consumes existing same-game experience. Use fresh profiles for an empty-memory baseline.

## 实验边界 / Experimental boundaries

种子控制引擎随机性；模型采样与并行经验到达顺序仍可变化。本地策略只读个人观察，是运行验证基线，不是强棋力或强狼人策略。默认模型决策尝试两次，失败后记录并使用本地策略兜底；分析胜率时检查 fallback。达到决策上限记为平局，不以子力或生存数伪造胜负。

Seeds control engine randomness, not model sampling or concurrent memory arrival. Local policies consume only observations and are operational baselines, not strong opponents. By default, two failed model attempts lead to a recorded local fallback. Inspect fallback logs when interpreting results. The decision cap produces a draw, not a heuristic winner.

公开基线数据 `exp/sanguosha/` 仍只代表旧三国杀实验。本次新增游戏没有附带真实模型胜率结论。

Published data in `exp/sanguosha/` remains specific to the original Sanguosha experiment. No real-model win-rate claims are included for the new games.

升级现有数据请参阅[迁移说明 / Migration](../MIGRATION.md)。
