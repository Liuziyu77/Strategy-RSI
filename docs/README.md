# 文档导航 / Documentation

[项目首页](../README.md) · [English README](../README.en.md)

这里的使用指南对应当前四游戏版本。各游戏有单独的规则文档，模型接入、交流和 RSI 则使用同一套协议。实验报告与录制素材标有日期，阅读时请留意对应的版本和范围。

## 按任务阅读 / Start here

| 你要做什么 / Task                                | 文档 / Guide                                                          | 内容 / Scope                                |
| ------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| 启动项目、配置模型 / Run and configure models    | [启动指南](GETTING_STARTED.md)                                        | Node、API 配置、本地演示、比赛与经验        |
| 选择游戏、查看规则 / Choose a game               | [游戏目录](games/README.md)                                           | 人数、语言、规则版本、实验边界              |
| 切换、观战、回放 / Navigate and observe          | [界面指南](ARENA_UI.md)                                               | 大厅、场地、视角、回放、经验面板            |
| 接入外部 Agent / Integrate an Agent              | [HTTP API](API.md)                                                    | 座位令牌、观察 JSON、合法动作、交流与经验   |
| 理解架构 / Understand the architecture           | [多游戏架构](MULTIGAME_ARCHITECTURE.md) → [运行机制](ARCHITECTURE.md) | 插件职责、调度、事务、恢复、RSI             |
| 添加游戏 / Add a game                            | [扩展指南](EXTENDING_GAMES.md)                                        | 注册、规则引擎、页面、版本与测试            |
| 升级已有存档 / Upgrade an installation           | [迁移说明](MIGRATION.md)                                              | 备份、兼容、经验归属和回退                  |
| 维护界面和素材 / Maintain UI and media           | [视觉设计](VISUAL_DESIGN.md) · [素材说明](MEDIA.md)                   | 主题、截图来源和录制方法                    |
| 查看验证与限制 / Review validation               | [质量检查记录](QUALITY_REVIEW.md)                                     | 2026-09-16 的修复、测试结果与未覆盖范围     |
| 设计对照、阅读实验 / Design and read experiments | [实验目录](../exp/README.md)                                          | 四游戏模型基线、真实 RSI 功能验证与对照设计 |

## 游戏规则 / Game rules

| 游戏 / Game        | 中文                                 | English                                           |
| ------------------ | ------------------------------------ | ------------------------------------------------- |
| 三国杀 / Sanguosha | [规则范围](RULES.md)                 | 游戏目前仅中文 / Chinese-only game                |
| 狼人杀 / Werewolf  | [固定角色规则](games/werewolf.md)    | [Fixed-role rules](games/werewolf.en.md)          |
| 国际象棋 / Chess   | [走法、和棋与边界](games/chess.md)   | [Moves, draws, and boundaries](games/chess.en.md) |
| 中国象棋 / Xiangqi | [走法与实验室裁定](games/xiangqi.md) | 游戏目前仅中文 / Chinese-only game                |

狼人杀与国际象棋的中英文范围覆盖游戏场地、规则说明及 Agent 决策/交流/RSI 提示词。共享大厅、玩家库和部分管理控件仍为中文。The game catalog, UI guide, migration summary and multi-game architecture contain English guidance; the extension guide is in English. Setup, HTTP API details and operational notes are primarily Chinese.

## 术语 / Terms

- **比赛/对战（match）**：固定游戏类型、语言和玩家配置的一次实验，可包含多局。
- **局（game）**：独立推进、结算、保存和回放的一盘棋或一局身份游戏。
- **回放帧（seq / revision）**：事件序号；一次决策可生成多条事件，并不等于走子数。
- **轮次 RSI（round）**：整局结束后的复盘；不是每个白天、玩家回合或每步棋之后反思。
- **经验（memory）**：按 Agent ID × gameType 隔离的持久文本；同游戏的中英文比赛共享经验。

## 更新约定 / Maintenance

新增游戏时同步更新游戏目录、对应规则、中英文项目首页、API 和扩展指南；界面或路由变化同步更新界面与视觉设计说明。首页为每款游戏保留可直接查看的介绍与截图，详细实验放入 `exp/` 并登记到[实验目录](../exp/README.md)，历史视频集中于[素材页](MEDIA.md#sanguosha-demos)。协议默认值以 `server/config.ts` 为准，游戏元信息以 `src/games/catalog.ts` 为准，具体规则以引擎和规则回归测试为准。

修改文档后检查相对链接、标题锚点和示例 JSON，并运行 `npm run format:check`。截图使用真实应用与独立测试数据，记录来源。实验报告和质量检查记录保留原日期与范围；新结果另行补充。

文案按 [Humanizer-zh](https://github.com/op7418/Humanizer-zh/blob/main/SKILL.md) 的编辑原则维护：直接说明功能和限制，删去空泛评价与重复铺垫。改写不改变规则、实验数据、命令或原始模型记录；中英文说明保持一致。
