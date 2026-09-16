# 从三国杀版本升级到多游戏版本

## 数据兼容

停服后备份 `DATA_DIR`（默认 `data/`），再升级代码和依赖。服务仍使用单个 SQLite 文件和同一数据目录的单进程独占访问；不要让两个服务同时打开同一存档。

启动时自动创建 `game_outcomes` 和 `memory_scopes` 两张附加表。已有三国杀比赛配置、状态帧、检查点和经验原文不重写。缺少 `gameType` 的比赛和记忆按 `sanguosha` 处理，缺少语言按中文处理。未结束比赛仍恢复为暂停。

新游戏的终局结果按获胜 Agent ID 保存，支持已阵亡队友共同获胜。原三国杀战绩继续使用原身份判定；旧玩家档案中的默认武将仍只作用于三国杀，不影响其他游戏。

## API 与实验脚本

旧创建比赛请求继续有效。新增游戏需传 `gameType`，狼人杀/国际象棋可传 `locale: "en"`。不要再假定所有观察都有 `hand`、`hp`、`deck` 等字段；读取通用字段，并根据游戏类型解析 `board` / `details`。详见 [API](API.md) 和 [引擎契约](EXTENDING_GAMES.md)。

经验按 Agent ID 与游戏类型隔离。旧手动经验和未标记 JSON/TXT 导入默认三国杀。新实验的手动经验需明确 `gameType`；导出再导入会保留该范围。同一游戏的中英文版本共享经验。若基线需要空经验，应创建新玩家档案。

全知观战、事件流及导出继续供实验者使用；狼人杀存档包含私有角色和夜间事件。模型或外部 Agent 只能使用其座位观察与过滤历史。

## 安装与验证

```bash
npm ci
./run.sh typecheck
./run.sh test
./run.sh build
./run.sh dev
```

`./run.sh` 会优先使用项目 `.runtime` 中的 Node，否则要求 PATH 中 Node ≥22.13。没有配置本地运行时的标准环境也可直接使用 `npm run dev`。

新增国际象棋依赖 `chess.js@1.4.0`；没有新增 Python、数据库服务器或在线规则服务依赖。真实模型仍使用现有兼容 API 配置。常规测试使用临时数据库与模拟模型。

## 回退

旧代码不能恢复新游戏状态，也不理解经验的游戏范围。若要回到旧版本，应同时恢复升级前的数据备份；不要让旧版本继续写入已经包含新游戏的数据库。

## English migration summary

Back up the data directory while the service is stopped. The migration adds two tables without rewriting old Sanguosha checkpoints. Untagged data defaults to Sanguosha/Chinese; unfinished matches resume paused. New API consumers must dispatch observations by game type instead of assuming cards or HP. Manual/imported memory carries `gameType`; both languages of one game share experience. Use the seat-token API for Agents, not privileged observer exports. Rolling back to the old application requires the pre-upgrade data backup because the old code does not understand new engines or scoped memory.
