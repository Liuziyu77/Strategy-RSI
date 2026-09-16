# 观战界面与游戏切换 / Arena UI

首页和 `#/lobby` 打开独立的 **游戏大厅**。大厅以可换行的卡片列表展示游戏，支持中英文名称搜索，并显示人数、语言与运行中的比赛数量。游戏内不再常驻游戏卡片栏。切换只改变观察页面，后台比赛继续按照原有运行状态执行。

## 进入与切换

- 在大厅点击 **三国杀 / 狼人杀 / 国际象棋 / 中国象棋** 卡片进入对应场地；顶部“游戏大厅”及站点标志都可返回大厅。每款游戏分别保留最近的对战、对局、回放帧和观战视角。
- 桌面在左侧选择对战档案；移动端使用“选择对战”下拉框。比赛包含多局时，在棋盘上方选择局数卡片。
- 浏览器刷新、前进、后退均支持恢复观战位置。地址栏可直接复制，接收者需能访问同一服务及对战数据。
- 顶部“新建对战”打开当前游戏的设置。狼人杀和国际象棋支持选择新对局语言，中国象棋仅中文；已创建比赛保留其原始语言。
- 新游戏的创建表单放在弹窗中，按 Escape 或点击关闭按钮返回观战。玩家库仍共用现有的模型和 RSI 配置。

大厅采用独立的蓝白目录风格，各游戏拥有完整页面主题。配色、字体、材质与参考来源见[视觉设计说明](VISUAL_DESIGN.md)。

## 四种场地

| 场地     | 设计与操作                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------- |
| 三国杀   | 墨绿牌桌与金色入口，保留手牌、身份、特效、决策和交流布局；全知视角选择随场地保存。                       |
| 狼人杀   | 午夜蓝与月光银紫主题，昼夜阶段、存活人数、当前行动与角色席位分层展示；身份和预言家查验遵循所选观察视角。 |
| 国际象棋 | 中性灰白棋室、石板灰棋盘与 SVG 棋子，边缘坐标、行棋方、最近落子和将军提示；可翻转棋盘。                  |
| 中国象棋 | 宣纸米白与朱砂红界面、木色交叉点棋盘、九宫与楚河汉界，红黑棋子、最近落子和将军提示；可翻转棋盘。         |

棋盘翻转仅改变显示朝向，不修改行动或棋局状态。翻转状态保留至当前棋盘卸载；回放位置与观战视角会持久保存。

新游戏的右侧详情分为 **交流 / 实录 / 经验**。交流与实录同步到回放位置；经验面板管理当前游戏类型的玩家长期记忆与 RSI 归纳，不是历史帧的记忆快照。选择个人视角时，狼人密谈仅在该视角可见时展示。全知观战和完整存档面向实验观察者，不替代外部 Agent 的受限接口。

暂停和继续作用于整场比赛；单步推进所选对局。“对战管理”内可明确停止比赛。棋盘下方的时间轴用于回放，点击“实时”回到当前状态。

## English quick guide

The home page and `#/lobby` open the dedicated **游戏大厅** (Game Lobby). Browse the wrapping card grid or search Chinese/English game names. Enter a game, then return using **游戏大厅** in the header or the site logo to choose another. Game cards appear only in the lobby. Desktop has a match archive sidebar; narrow screens show a match picker. Round chips select games within a match. Each game restores its last match, round, replay frame and perspective, including after reload and browser back/forward. Switching the observer does not stop running matches.

Open **New match** to configure an experiment; Escape closes the dialog. Choose a language before creating a match. Existing matches keep their language. Xiangqi and Sanguosha use Chinese, while chess and werewolf support Chinese and English. The shared navigation and player library retain Chinese labels, with English game names in the lobby.

Chess and Xiangqi provide board flipping, coordinates, last-move highlighting and check indicators. Werewolf displays the day/night phase, living players and visible roles. The inspector separates **Chat**, **Events** and **Memory**. Chat and events follow the replay frame; Memory manages current persistent experience for this game type. **Pause/Resume** affect the match; **Step** advances the selected round; **Live** returns to the latest state.

## 前端维护

- `web/navigation.ts`：路由、浏览器历史、按游戏保存观战位置。
- `web/GameLobby.tsx` / `web/lobby.css`：独立大厅、搜索与可扩展游戏列表。
- `web/game-presentation.ts`：各游戏视觉元信息。
- `web/MultiGameArena.tsx`：对战档案、创建弹窗、观战控制与详情。
- `web/GameBoards.tsx`：角色席位、棋子与棋盘显示。
- `web/themes.css`：大厅和各游戏的独立主题、控件颜色与材质。
- `web/arena-design.css`：公共壳层与三国杀界面修饰。
- `web/multigame.css`：新游戏场地、详情与响应式布局。

本地偏好仅保存游戏类型、比赛/对局 ID、帧号、视角和新比赛语言，不存储 API Key。游戏规则、Agent 决策、交流及 RSI 的服务端契约保持独立，新增游戏参阅[扩展指南](EXTENDING_GAMES.md)。
