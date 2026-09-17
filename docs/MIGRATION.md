# 从三国杀版本升级到多游戏版本

[文档导航](README.md) · [启动指南](GETTING_STARTED.md)

## 数据兼容

先停止服务，备份 `DATA_DIR`（默认 `data/`），再升级代码和依赖。存档仍是单个 SQLite 文件，同一数据目录只允许一个服务进程访问。

启动时自动创建 `game_outcomes` 和 `memory_scopes` 两张附加表。已有三国杀比赛配置、状态帧、检查点和经验原文不重写。缺少 `gameType` 的比赛和记忆按 `sanguosha` 处理，缺少语言按中文处理。未结束比赛仍恢复为暂停。

新游戏按获胜 Agent ID 保存结果，阵营获胜时包含已阵亡队友。三国杀战绩仍按原身份规则判定。旧玩家档案中的默认武将只用于三国杀。

## API 与实验脚本

旧创建比赛请求继续有效。新增游戏需传 `gameType`，狼人杀/国际象棋可传 `locale: "en"`。不要再假定所有观察都有 `hand`、`hp`、`deck` 等字段；读取通用字段，并根据游戏类型解析 `board` / `details`。详见 [API](API.md) 和 [引擎契约](EXTENDING_GAMES.md)。

经验按 Agent ID 与游戏类型隔离。旧手动经验及未标记 `gameType` 的 API/JSON 导入默认三国杀。当前玩家库的手动输入和 TXT 导入使用“经验所属游戏”选择器；游戏场地经验面板自动绑定当前游戏。JSON 中已有的 `gameType` 不受界面选择覆盖，导出再导入保留该范围。同一游戏的中英文版本共享经验。若基线需要空经验，应创建新玩家档案。

全知观战、事件流及导出继续供实验者使用；狼人杀存档包含私有角色和夜间事件。模型或外部 Agent 只能使用其座位观察与过滤历史。

## 安装与验证

```bash
# 使用 PATH 中的 Node.js >=22.13 安装依赖
npm ci
./run.sh typecheck
./run.sh test
./run.sh build
./run.sh dev
```

`./run.sh` 会优先使用项目 `.runtime` 中的 Node，否则要求 PATH 中 Node ≥22.13。若只有项目内 Node 可用，先将 `.runtime/node_modules/node/bin` 加入 PATH 再执行 `npm ci`。没有配置本地运行时的标准环境也可直接使用 `npm run dev`。

新增国际象棋依赖 `chess.js@1.4.0`；没有新增 Python、数据库服务器或在线规则服务依赖。真实模型仍使用现有兼容 API 配置。常规测试使用临时数据库与模拟模型。

## 回退

旧代码不能恢复新游戏状态，也不理解经验的游戏范围。若要回到旧版本，应同时恢复升级前的数据备份；不要让旧版本继续写入已经包含新游戏的数据库。

## English migration summary

Stop the service and back up the data directory before upgrading. The migration adds two tables; old Sanguosha checkpoints stay intact. Untagged data defaults to Sanguosha/Chinese, and unfinished matches return paused.

API clients should read observations according to `gameType`: only Sanguosha has cards and HP. Manual and imported memories also carry `gameType`, with both languages of a game sharing experience. Agents must use the seat-token API; observer exports contain hidden information.

To roll back, restore the pre-upgrade data backup as well as the old code. The old application cannot read new game states or distinguish memory by game type.

In the player library, manual notes and TXT imports use the selected **经验所属游戏** (Experience game). JSON preserves each entry's `gameType`; untagged legacy JSON defaults to Sanguosha. The game inspector assigns its current game type automatically.
