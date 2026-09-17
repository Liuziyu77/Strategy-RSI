# 实验复用脚本 / Shared experiment utilities

本目录存放三款新游戏共用的分析和排版代码、依赖、配置示例及历史源码。报告、数据、计划、history 与图表仍保存在各自的 `exp/<game>/` 中，分别统计结果。

This directory contains shared analysis and layout code, dependencies, example configuration and historical sources for the three new games. Reports, data, schedules, histories and figures stay under each game's `exp/<game>/` directory, with results analyzed separately.

- `analyze.py`：从公开数据计算分组 bootstrap 区间、配对或角色矩阵、批次与时长统计。
- `render_figures.py`：参考三国杀的卡片版式，生成统一尺寸的六组 SVG / PNG 图表。
- `write_report.py`：由已经审计的数据生成各游戏的中英文报告。
- `update_docs.py`：全部游戏报告发布后，同步项目首页、实验索引和文档入口。
- [requirements.txt](requirements.txt) 与 [config.example.yaml](config.example.yaml)：三款新游戏共用的分析依赖和 API 配置示例。三国杀保留自己的依赖版本。
- [provenance/](provenance/)：三款游戏内容完全相同的旧源码快照、验证运行时和零对局诊断，只保存一份。[manifest.json](provenance/manifest.json) 记录原文件哈希；各游戏自己的初始计划和试跑记录仍留在其 `provenance/` 内。

在仓库根目录运行，例如：

```bash
pip install -r exp/_shared/requirements.txt
python3 exp/reproduce.py chess
# 只重写报告：
python3 exp/reproduce.py chess report
# 将图表输出到临时目录：
python3 exp/reproduce.py chess figures --output /tmp/chess-figures
```

[reproduce.py](../reproduce.py) 支持 `chess`、`werewolf`、`xiangqi`，默认依次运行分析、绘图和报告。单步选择 `analyze`、`figures` 或 `report`；单步的 `--input` 指定结果 JSON，绘图和报告同时读取旁边的 `analysis.json`。`--output` 在分析步骤中是 JSON 文件路径，在绘图或报告步骤中是输出目录。完整流程不接受这两个覆盖参数。

这些命令不调用模型。运行实验与原始决策审计的入口分别是 `scripts/run-game-baselines.ts`、`scripts/export-game-results.ts`；原始模型输入、响应和断点保存在本地忽略的 `artifacts/` 中。

Use [reproduce.py](../reproduce.py) with `chess`, `werewolf` or `xiangqi`. It runs all three steps by default, or one of `analyze`, `figures`, and `report`. Single steps accept `--input` and `--output`; figures and reports read `analysis.json` alongside the input. Output is a JSON file for analysis or a directory for figures/reports. All commands run offline. Sanguosha keeps its original scripts and dependency versions.

公开数据、场数、历史与图表的独立校验：

```bash
python3 scripts/experiments/verify_studies.py
```

当前实验和导出分别使用 `run-game-baselines.ts`、`export-game-results.ts`，命令见各游戏报告。旧的 `run-multigame-baseline.ts`、`export-multigame-results.ts` 依赖最初实验的目录结构，与当时源码一同保存在历史快照中，仅供核查旧实验。

The older `run-multigame-baseline.ts` and `export-multigame-results.ts` belong to the frozen initial study and depend on its archived directory layout. Use `run-game-baselines.ts` and `export-game-results.ts` for the current study, following each game's reproduction instructions.
