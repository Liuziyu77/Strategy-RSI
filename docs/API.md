# HTTP API

默认根地址 `http://localhost:3930`。所有 JSON 接口使用 UTF-8。错误返回 `{ "error": "可读错误信息" }`。开启管理令牌后，所有非 Agent 写接口使用 `Authorization: Bearer <ARENA_ADMIN_TOKEN>`。

## 多游戏协议

- `GET /api/game-types`：游戏 ID、人数、支持语言与规则版本；`GET /api/game-types/:id/rules?locale=en` 获取对应规则。
- 创建比赛增加 `gameType`（`sanguosha` / `werewolf` / `chess` / `xiangqi`）和 `locale`（`zh` / `en`）。省略时默认三国杀和中文。三国杀 2–8 人，狼人杀 6–12 人，两种棋各 2 人；中国象棋和三国杀只接受中文。
- 新游戏不需要 `hero`，该字段缺省仅为兼容旧玩家档案。`roleAssignments` / `roleMode: fixed` 仅用于三国杀；棋类按座位分配颜色，狼人杀按种子分配角色。
- `GET /api/games/:id?viewer=0&seq=42` 为实验者提供某座位历史观察，省略 viewer 默认全知。真实 Agent 必须使用带令牌的 `/api/agent/...`，其上下文包含按游戏过滤的经验及可见历史。
- 新游戏 observation 共享 `gameType, locale, revision, round, turn, active, phase, players, pending, legalActions`，游戏展示数据在 `board` / `details`；不再假设所有游戏都有手牌、体力、牌堆或装备。
- `speechChannel` 为 `public` / `team` / `none`。狼人夜间密谈存为带 `visibleTo` 的 chat 事件，仅队内 Agent 上下文可读；公开 `/chat` 不返回私聊。管理导出和全知事件流可能包含私有信息。
- 新游戏终局 state 的 `outcome` 包含 `winners: Agent ID[]` 与 `draw: boolean`，统计不根据武将或三国杀身份推断新游戏胜负。
- 手动经验、JSON 导入条目增加可选 `gameType`，未标记的旧数据默认三国杀；导出保留此字段。比赛生成及归纳经验自动继承来源游戏。`GET /api/memories` 用于管理可返回多游戏经验，Agent 输入仅取当前游戏。

```json
{
  "name": "Chess RSI experiment",
  "gameType": "chess",
  "locale": "en",
  "playerIds": ["player-a", "player-b"],
  "games": 4,
  "concurrency": 2,
  "seed": 42,
  "chatEnabled": true
}
```

New matches accept `gameType` and `locale`. Query `/api/game-types` for supported combinations. Agents use the same seat-token action endpoint across games. Choose an exact `legalActions[].id`, preserve `revision`, and optionally include `speech`; only card-selection templates require `cardIds`. Manual/imported memories may carry `gameType`. Existing records without a discriminator retain Sanguosha behavior. [English game rules and protocol scope](games/README.md).

## 新建比赛

`POST /api/matches`

从玩家库选人（前端使用此方式）：

```json
{
  "name": "玩家库对战",
  "playerIds": ["player-id-a", "player-id-b"],
  "games": 2,
  "concurrency": 2,
  "paceMs": 1000
}
```

服务端读取玩家当前资料作为本次比赛快照，固定各自的名字、武将、控制方式、API 与 RSI。ID 不能重复，数量必须符合所选游戏；每位玩家会自动获得本次参战记录。后续编辑玩家不改写这份快照。

`concurrency` 是并行对局数量，默认 1，必须为 1–100 的整数且不超过 `games`。空闲名额按局号顺序开新局；一个名额包括该局的游戏、即时反思和赛后复盘，等待外部 Agent 的局仍占名额。不同局独立推进，同一局顺序决策。

聊天字段：`chatEnabled` 默认为 `true`，设为 `false` 则禁止本场发布发言；`contextChatMessages` 默认为 80，可设置 1–200，决定输入模型的最近对话条数上限，同时受约 16000 字符的序列化消息预算约束。旧对战缺省字段按默认值处理。

三国杀专用身份字段（其他游戏不接受固定身份配置）：

- `roleMode: "random"`（默认）：全部身份按种子随机分配，主公不再固定于首座。可提供 `roleAssignments` 作为首局预览结果，后续各局重新随机。
- `roleMode: "fixed"`：必须提供 `roleAssignments`，按玩家 ID 固定整场全部牌局的身份，座位轮换不改变玩家身份。
- `roleAssignments` 示例：`{"player-id-a":"反贼","player-id-b":"主公"}`。必须完整覆盖本场玩家，且符合 2–8 人身份配比；缺失、额外玩家或非法配比均返回 400。

前端创建时预先随机分配，可重新随机或手动交换；手动调整自动选用固定模式。无论哪种模式，都由实际主公先行动；身份分配不会进入其他玩家的隐藏信息视角。

也保留直接传入 `agents` 的方式，方便脚本与外部客户端；首次出现的 Agent 会自动建立玩家档案：

```json
{
  "name": "双模型实验",
  "agents": [
    {
      "id": "agent-a",
      "name": "观澜",
      "kind": "llm",
      "provider": "default",
      "model": "model-a",
      "rsi": "both",
      "hero": "张飞"
    },
    {
      "id": "agent-b",
      "name": "长风",
      "kind": "llm",
      "provider": "default",
      "model": "model-b",
      "rsi": "round",
      "hero": "关羽"
    }
  ],
  "games": 3,
  "seed": 42,
  "paceMs": 300,
  "maxDecisions": 1800,
  "apiTimeoutMs": 45000,
  "contextEvents": 300,
  "rotateSeats": true,
  "autoStart": true
}
```

将 `model` 换成 `/api/config` 中的已配置模型。每个 Agent 都必须有唯一、稳定的 `id`（字母、数字、下划线、横杠，最多 64 字符）。`agents` 数组长度就是玩家数量，须符合游戏人数范围。

返回比赛 `id`、`config`、状态和外部座位的 `agentTokens`。将座位设为 `external` 时，服务器不会替它调用决策模型；客户端保存令牌后自行拉取状态、提交动作。`heuristic` 的行动无需 API，但 `heuristic` / `external` 若开启 RSI，反思仍需要已配置的模型 API。

## 观战、控制与回放

| 方法 / 路径                                          | 含义                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/health`                                    | 服务存活                                                    |
| `GET /api/config`                                    | 已配置 Provider / 模型、武将与规则；不含密钥                |
| `GET /api/matches`                                   | 比赛列表及各局摘要                                          |
| `POST /api/matches/:id/pause`                        | 取消未完成模型调用，暂停                                    |
| `POST /api/matches/:id/resume`                       | 从检查点继续                                                |
| `POST /api/matches/:id/step`                         | 暂停并执行一条动作，RSI 随该动作正常触发                    |
| `POST /api/matches/:id/stop`                         | 停止整场比赛，保留存档                                      |
| `GET /api/games/:id`                                 | 全知观战状态、当前决策 / 反思中的座位                       |
| `GET /api/games/:id?seq=42`                          | 第 42 个事件对应的完整观战帧                                |
| `GET /api/games/:id/events?after=0&limit=500`        | 按事件序号增量取历史，最多 5000 条，继续传最后一个 seq 翻页 |
| `GET /api/games/:id/events?tail=300&before=2000`     | 指定序号以前最近 300 条事件                                 |
| `GET /api/games/:id/decisions?limit=100&before=2000` | 最近决策摘要，不含重复的大段模型输入                        |
| `GET /api/games/:id/calls`                           | 模型调用、用量与反思摘要                                    |
| `GET /api/games/:id/chat?before=2000&limit=100`      | 指定事件序号及以前的最近公开对话，按时间顺序返回            |
| `GET /api/games/:id/export`                          | 完整 JSON，包括全量模型输入和决策                           |
| `GET /api/games/:id/export?format=jsonl`             | 全量事件和每一帧完整规则状态，逐行 JSON                     |
| `GET /api/stream`                                    | SSE；`update` 通知需刷新，`ping` 保活                       |

运行状态：`paused`、`running`、`waiting`（等待外部 Agent）、`finished`、`stopped`、`error`。游戏胜者与比赛运行状态分开，停止或进程退出不会被记为正常胜负。

对局摘要和 `/api/games/:id` 新增 `runStatus` 与 `runError`。`runStatus` 为 `paused`、`running`、`waiting`、`reflecting`（赛后 RSI）、`finished`、`error` 或 `stopped`；原来的 `status` 仍只表达游戏是否已有结果。总局数减实际创建局数即排队数量。整场必须在所有计划局完成及赛后 RSI 处理结束后才标记 finished。

暂停 / 继续作用于全部对局。`POST /api/matches/:id/step` 可发送 `{"gameId":"目标局ID"}`，暂停整场后只执行该局一步；不传时沿用最后创建的局。跨对战 gameId 被拒绝。重启后的各局保留检查点并暂停，恢复不会重开已有局。

## 外部 Agent

`GET /api/agent/:gameId/:agentId`，请求头：

```http
Authorization: Bearer <创建时返回的该座位令牌>
```

返回：

```json
{
  "observation": {
    "gameId": "...",
    "revision": 20,
    "viewer": 0,
    "players": [],
    "legalActions": [{ "id": "r20-a0", "kind": "end", "label": "结束出牌阶段" }]
  },
  "history": [],
  "historyInfo": { "total": 20, "included": 20, "omitted": 0 },
  "memory": [],
  "memoryInfo": { "total": 0, "included": 0 },
  "chat": [],
  "chatInfo": { "enabled": true, "total": 0, "included": 0, "omitted": 0, "maxSpeechLength": 200 }
}
```

`observation` 根据游戏提供不同的结构化数据：三国杀中仅自己的 `hand` 包含牌面，其他玩家只有 `handCount`，未知身份为 `未知`；狼人杀隐藏角色为 `unknown`，狼人可见队友，个人查验和药品信息由 `details` 按座位过滤；国际象棋提供 8×8 `board`、`details.fen` 和 SAN 历史；中国象棋提供 10×9 `board`、棋子坐标及将军信息。模型输入为文本 JSON，不发送棋盘截图。

不提供牌堆次序、随机种子或其他玩家的模型输入。未轮到自己时 `legalActions` 为空。可以将该 JSON 直接作为模型决策的用户上下文。

`chat` 是当前局对该座位可见的对话，包含 `seq`、`time`、`seat`、`agentId`、`name`、`text`、`round`、`turn`、`phase`。狼人上下文还包含队内密谈，其他玩家不接收这些消息；观战 `/api/games/:id/chat` 只返回公开对话。`history` 不重复包含聊天事件，`historyInfo` 只计可见游戏事件；`chatInfo` 独立说明聊天是否开放、可见记录数、输入条数、省略数及单条字数上限。决策与 RSI 使用相同的聊天上下文，其他局的对话不进入此处。

动作 JSON 可附带 `"speech":"我先试探一下，大家看他的反应。"`。空字符串或省略表示沉默，每次最多 200 个 Unicode 字符，超长截断，非字符串忽略；异常的可选发言不会让合法动作失败。发言不替代 `actionId`，必须轮到该 Agent 并通过动作与版本校验。署名和座位由服务器确定；聊天关闭时发言忽略。消息在执行动作之前公开，和动作、检查点在同一事务保存。`reason` 仍为策略说明，不自动公开到聊天室。

观战聊天接口返回 `{"messages":[...],"total":123}`，其中 `total` 为 `before` 边界内的消息数。默认取最近 100 条，`limit` 范围 1–5000；向前翻页时使用当前第一条的 `seq - 1` 作为 `before`。回放传入目标帧序号，未来消息不会返回。完整 JSON 导出新增 `chat` 数组，同时保留 `events` 中的 `type: "chat"` 事件；JSONL 的聊天行也包含对应的完整游戏状态帧。

弃牌阶段的合法动作是一个选牌模板，避免枚举所有组合。例如需要从四张手牌中弃两张：

```json
{
  "id": "r20-a0",
  "kind": "discard",
  "label": "选择并一次弃置 2 张手牌",
  "selectCards": { "count": 2, "from": ["c001", "c002", "c003", "c004"] }
}
```

提交动作时除 `actionId`、`revision` 和可选的 `reason`，还需发送 `cardIds: ["c001", "c003"]`，一次选出恰好 `count` 张不同候选手牌。只有一个模板仍然需要玩家选牌；仅当所有候选牌都必须弃置时系统可自动处理。数量、归属、重复或版本错误在状态变更前被拒绝。普通动作继续仅提交 `actionId`；外部客户端应同步支持该批量选牌协议。存档的 `decision.cardIds` 和 `action.cards` 保存实际弃牌集合。

`POST /api/agent/:gameId/:agentId/actions`，使用相同令牌：

```json
{ "revision": 20, "actionId": "r20-a0", "reason": "保留闪与桃，结束出牌" }
```

服务器按最新合法动作列表验证，不接受任意卡牌 ID 或未授权座位。过期后需重新取状态。外部 Agent 的强制动作（唯一合法操作）通常自动完成；狼人杀讨论窗口的 `speak` 即使唯一也需 Agent 提交，其余非强制行动保持等待。示例客户端：[scripts/external-agent.ts](../scripts/external-agent.ts)。

## 记忆

界面中的经验已归入玩家详情，以下通用接口仍兼容旧脚本。

- `GET /api/memories?agentId=agent-a`：列出该 Agent 经验。
- `POST /api/memories`：`{"agentId":"agent-a","text":"可复用的经验"}`。
- `DELETE /api/memories/:id`：删除单条。
- `GET /api/memories/export?agentId=agent-a`：导出，也可不加过滤。
- `POST /api/memories/import`：传导出文件，或 `[{"agentId":"agent-a","text":"经验"}]` 数组。每条最多 4000 字符，批量最多 500 条，整批先验证再事务写入。

归档包含来源模式、创建时间、来源局 ID 和稳定 Agent ID。导入创建新条目，保留原文本并标记来源 `import`，不会覆盖已有档案。

## 玩家库

| 方法 / 路径                                  | 含义                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/players`                           | 玩家资料及参战数、结束数、胜利数、经验数                                |
| `POST /api/players`                          | 创建玩家，省略 ID 时自动生成                                            |
| `GET /api/players/:id`                       | 玩家资料、`memories` 与 `history`，历史含 `gameId` / `matchId`          |
| `PUT /api/players/:id`                       | 提交完整更新后的资料；ID 不可变，已有牌局不变                           |
| `POST /api/players/:id/memories`             | 保存该玩家的经验，正文 `{"text":"经验"}`                                |
| `POST /api/players/:id/memories/import`      | 导入数组或 `{ "memories": [...] }`，每项含 `text`；全部绑定路径中的玩家 |
| `DELETE /api/players/:id/memories/:memoryId` | 删除属于该玩家的单条经验，跨玩家请求拒绝                                |

创建自定义 API 玩家：

```json
{
  "name": "观澜",
  "kind": "llm",
  "hero": "关羽",
  "rsi": "both",
  "description": "观察跨局经验的效果",
  "color": "#82bbae",
  "apiMode": "custom",
  "baseUrl": "https://your-provider.example/v1",
  "apiKey": "your-key",
  "model": "model-a"
}
```

使用共享服务时设置 `apiMode: "provider"`、`provider: "default"` 和已配置的 `model`，省略 `apiKey`、`baseUrl`。本地玩家可用 `kind: "heuristic"`、`rsi: "off"`，无需 API。

玩家响应仅返回 `hasApiKey`，不会回显专属密钥；更新时 `apiKey` 留空或省略表示保留原来的专属密钥。每次更新专属连接会创建新的内部 Provider 版本，旧比赛仍可按其原配置恢复。版本记录只保存在后端，不进入对局导出或模型输入。

`history` 中 `name`、`hero`、`role` 是开局时信息，`won` 按最终获胜阵营计算；未结束牌局不计入胜率分母，平局计入已结束数。

玩家详情新增 `matchHistory`，按 `matchId` 分组，同名对战不会合并。每项包含 `matchId`、`matchName`、`status`、`createdAt`、`plannedGames` 和 `stats`。统计字段为 `games`（实际创建局数）、`finished`、`wins`、`losses`、`draws`、`winRate`（0–1；无已结束局时为 `null`）。详细逐局记录仍通过原来的 `history` 提供。

玩家列表及详情的顶层 `stats` 使用相同统计字段，并包含 `matches`（参与对战数）和 `memories`。顶层 `winRate` 为全部获胜局数除以全部已结束局数，不对各场胜率简单平均。原有历史自动参与聚合，无需迁移或重跑。

个人经验新增 `matchId`、`matchName`、`gameNumber`、`consolidationId`、`sourceIds`（仅归纳结果）和 `active`。`mode` 分别为 `immediate`、`round`、`consolidated`、`manual`、`import`。`active=false` 的原文或旧版本仍在档案中，模型上下文只读取有效经验。手动和导入经验无来源对战时单独分组。

`POST /api/players/:id/memories/consolidate`，请求体 `{"matchId":"对战ID"}`，返回 202 和归纳任务。它调用玩家**当前配置**的模型 API，汇总该玩家本场全部即时及轮次 RSI 经验；不读取其他玩家或其他场经验。重复点击同一玩家、同一场的运行任务会返回已有任务。

通过玩家详情中的 `consolidations` 查看进度。任务字段包括 `id`、`agentId`、`matchId`、`status`（running / completed / error / interrupted）、`model`、`sourceIds`、`immediateCount`、`roundCount`、`completedCalls`、`stage`、`error` 和时间戳。后台分批归纳再合并；成功生成一条带即时、轮次与通用原则的归纳经验。失败或中断不会产生半份摘要，可重新发起。

新任务另包含 `timeoutMs`（独立单批超时 180000）、`retryCount`（自动重试次数）、`reusedCalls`（复用的成功批次数）；旧任务可能无这些字段。`completedCalls` 只统计本次成功生成并验证的模型响应，不包含复用批次。归纳按约 8000 字符的序列化经验预算分批；超时、网络失败和 HTTP 408 / 429 / 5xx 最多自动重试当前批一次，间隔 1 秒。鉴权错误和无效输出直接报告失败。

重新请求此接口会创建新任务，尝试复用该玩家该场最近失败 / 中断任务中已保存且通过验证的批次。仅当前模型、连接及完整提示词相同的批次可复用，服务重启不丢失已持久化的批次；修改经验或模型后会重新处理受影响的批次。已成功完成的任务不作为恢复来源，重复归纳会重新生成。旧版记录没有复用标识，首次升级后会重新处理。所有失败尝试均保留错误、耗时和输入记录，公开玩家详情仍不暴露内部模型调用内容。

原文不删除；后续决策优先读取本场最新摘要，并读取未被该摘要覆盖的新经验。归纳时固定来源范围，期间新增 RSI 不会丢失。归纳原文如果被删除或修改，本次结果拒绝落盘。删除最新归纳记录后使用上一版本；没有旧版本则恢复原文。归纳结果可按原经验导出接口一起导出，导入为当前玩家的独立导入经验。

每条参战历史还包含 `round`（游戏轮次）、`turn`（已推进的玩家回合）、`decisionCount`（全局已执行行动数，含唯一合法操作）、`playerCount`、`startedAt`、`endedAt`、`lastEventAt` 和 `durationMs`。时长取首末游戏事件时间差，包含事件之间的暂停间隔，不包含赛后 RSI。未结束的牌局 `endedAt` 为 `null`，展示截至最近事件的已记录时长；暂停或停止后不会随着查询时间增长。旧存档直接从已有事件与检查点读取这些数据，无需重新运行牌局。
