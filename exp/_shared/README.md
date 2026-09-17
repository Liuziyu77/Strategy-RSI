# 实验复用脚本 / Shared experiment utilities

本目录存放各游戏共用的分析和排版脚本。报告、数据、计划、历史与图表仍保存在各自的 `exp/<game>/` 中，分别统计结果。

This directory contains shared analysis and layout scripts. Reports, data, schedules, histories and figures stay under each game's `exp/<game>/` directory, with results analyzed separately.

- `analyze.py`：从公开数据计算分组 bootstrap 区间、配对或角色矩阵、批次与时长统计。
- `render_figures.py`：参考三国杀的卡片版式，生成统一尺寸的六组 SVG / PNG 图表。
- `write_report.py`：由已经审计的数据生成各游戏的中英文报告。
- `update_docs.py`：全部游戏报告发布后，同步项目首页、实验索引和文档入口。

在仓库根目录运行，例如：

```bash
python3 exp/chess/analyze.py
python3 exp/chess/render_figures.py
python3 exp/chess/write_report.py
```

这些命令不调用模型。运行实验与原始决策审计的入口分别是 `scripts/run-game-baselines.ts`、`scripts/export-game-results.ts`；原始模型输入、响应和断点保存在本地忽略的 `artifacts/` 中。

公开数据、场数、历史与图表的独立校验：

```bash
python3 scripts/experiments/verify_studies.py
```

当前实验和导出分别使用 `run-game-baselines.ts`、`export-game-results.ts`，命令见各游戏报告。旧的 `run-multigame-baseline.ts`、`export-multigame-results.ts` 依赖最初实验的目录结构，与当时源码一同保存在历史快照中，仅供核查旧实验。

The older `run-multigame-baseline.ts` and `export-multigame-results.ts` belong to the frozen initial study and depend on its archived directory layout. Use `run-game-baselines.ts` and `export-game-results.ts` for the current study, following each game's reproduction instructions.
