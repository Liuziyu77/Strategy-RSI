# Sanguosha four-model baseline experiment

[Project README](../../README.en.md#experiments) · [Experiment index](../README.md) · [简体中文](README.md) · [Data](results.json) · [Histories & chat](#game-histories-and-chat) · [Figures](assets)

This study measures play with empty memory as a baseline for later RSI comparisons. Of **528 scheduled games**, 489 completed normally and 39 failed, with no draws. Results were compiled on September 14, 2026.

## Setup

| Item                     | Configuration                                                                                                                                                      |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API model labels         | `bailian/deepseek-v4-flash`, `glm-5.2`, `kimi-k3`, `qwen3.8-max-0902`                                                                                              |
| General and experience   | Guan Yu for every agent; RSI off; empty personal memory; public chat on                                                                                            |
| Duels                    | 6 pairs × 20 card-seed blocks × 2 mirrored role/seat assignments; 240 planned, 233 normal, 7 failed                                                                |
| Four-player identity     | 12 seed blocks × 24 model-seat permutations, with role-seat templates rotating across blocks; 288 planned, 256 normal, 32 failed                                   |
| Roles                    | Duel: Lord and Rebel. Four-player: one Lord, Loyalist, Rebel, and Renegade each.                                                                                   |
| Request settings         | Temperature 0.6; output limit 4,096 tokens; latest 300 game events and at most 80 chat messages                                                                    |
| Concurrency and retries  | At most 128 concurrent games and 32 requests per model; 90-second request timeout; at most 3 attempts per decision                                                 |
| Termination and fallback | Draw at 1,800 engine decisions; exhausted decision retries terminate the game as an error; no heuristic substitution; the sole legal action executes automatically |

The study uses the project's rules and decision prompts. All four models use the same protocol adapter: it removes `cardIds` only when the field exactly repeats cards already bound to a legal action that requires no further card selection. The adapter leaves actions, targets and actual selections unchanged. Results therefore describe performance after this adjustment and cannot be used as raw response compliance rates.

Connectivity probes, capacity tests, pilot games and service-recovery checks are excluded from the formal 528 games.

## Results and figures

### Win rate

[![Duel and four-player identity win rates with 95% seed-block confidence intervals](assets/win-rate.svg)](assets/win-rate.svg)

DeepSeek leads four-player identity games at **61.7%**. Its differences from all three opponents remain supported after correcting for multiple comparisons; the other three cannot be reliably ranked against one another.

### Head-to-head

[![Duel matrix showing each row model's win rate and wins against each column opponent](assets/head-to-head.svg)](assets/head-to-head.svg)

DeepSeek finishes **20 : 19** against GLM and **28 : 12** against Kimi. The overall leader's results still depend on the opponent; individual matchups add context to aggregate win rates.

### Role win rate

[![Win rates and sample sizes for each model as Lord, Loyalist, Rebel, and Renegade](assets/role-win-rate.svg)](assets/role-win-rate.svg)

DeepSeek has the highest point estimate in all four roles. Weighting roles equally leaves its win rate at **61.6%**, so differences in the observed role mix do not explain its overall lead.

### Game duration

[![Individual game durations with medians, interquartile ranges, and P5–P95 whiskers](assets/game-duration.svg)](assets/game-duration.svg)

Median duration is **12.1 minutes** for duels and **36.2 minutes** for four-player games. Times include request queues and retries, with documented account-recovery pauses removed; they describe this concurrent run.

### Token use

[![Cumulative API-reported input and output tokens for each model](assets/token-use.svg)](assets/token-use.svg)

The APIs reported **428.5M tokens**, of which **94.1%** were input tokens. Input dominates usage in this run, though the savings and decision effects of context compression still need testing. Totals include reported retry usage. Provider accounting differs, so these totals cannot rank costs directly.

### Chat frequency

[![Share of model decisions containing public speech, split by duel and four-player games](assets/chat-frequency.svg)](assets/chat-frequency.svg)

In four-player games, GLM speaks in **96.6%** of model decisions versus DeepSeek's **82.3%**. More frequent speech does not coincide with more wins here; isolating its effect requires a chat-on/off comparison with the same models and seeds.

<sub>Click figures to enlarge. Also available: <a href="assets">high-resolution PNGs</a>, <a href="results.json">public summary data</a>, <a href="games-history-duel.json">duel histories and chat</a>, <a href="games-history-identity.json">four-player histories and chat</a>, and the <a href="render_figures.py">plotting script</a>. Findings apply to the tested API model labels, Guan Yu, rules, prompts, and sampled seeds.</sub>

## Metric definitions

| Figure         | Definition and scope                                                                                                                                                                                                   |
| :------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Win rate       | Wins / normally completed participations, separately by format. Errors are excluded. Error bars are 95% percentile intervals from 20,000 seed-block bootstrap replicates.                                              |
| Head-to-head   | The row model's duel win rate against the column opponent; 36–40 normal games per pair. No same-model matches were scheduled, so the diagonal is empty.                                                                |
| Role win rate  | Four-player wins / normal participations within each role. Lord and Loyalist share team victory, including eliminated teammates, so model win rates need not sum to 100%.                                              |
| Game duration  | Normal games' `durationMs` in minutes, including queues and retries but excluding documented account-recovery pauses. Large dots show medians, thick lines P25–P75, whiskers P5–P95, and small dots every normal game. |
| Token use      | Sum of formal requests' reported input and output `usage`, including recorded failed outputs and retries. Of 30,342 request records, 28,587 report usage. Missing usage is not estimated.                              |
| Chat frequency | Model decisions containing public speech / model decisions in normal games. Automatically executed forced actions are excluded. This is speech per decision, not messages per minute.                                  |

Model order and colors remain consistent; heatmaps use a fixed 0–100% scale. SVG text is converted to paths to avoid font dependencies; PNGs are 2,816 pixels wide. Exact values, intervals, and role sample sizes are in [results.json](results.json).

## Interpreting the findings

In four-player identity games, DeepSeek wins 158/256 (61.7%), GLM 74/256 (28.9%), Kimi 86/256 (33.6%), and Qwen 78/256 (30.5%). Paired seed-block resampling preserves associations between model outcomes. After Bonferroni correction across all six comparisons, only DeepSeek's three differences have intervals entirely above zero. This supports its lead in this study, while leaving the other three without a reliable ranking.

| Four-player comparison | Difference / percentage points | Adjusted interval / percentage points |
| :--------------------- | -----------------------------: | ------------------------------------: |
| DeepSeek − GLM         |                          +32.8 |                        +24.2 to +42.0 |
| DeepSeek − Kimi        |                          +28.1 |                        +15.7 to +40.8 |
| DeepSeek − Qwen        |                          +31.2 |                        +23.2 to +40.9 |
| GLM − Kimi             |                           −4.7 |                         −12.2 to +2.7 |
| GLM − Qwen             |                           −1.6 |                         −11.5 to +7.0 |
| Kimi − Qwen            |                           +3.1 |                         −7.3 to +12.5 |

These adjusted intervals have approximately 99.17% individual coverage. The win-rate figure above instead shows descriptive 95% intervals for individual models; overlapping error bars do not replace a paired comparison. In duels, DeepSeek finishes only 20 : 19 against GLM, with a paired win-rate interval of 38.5%–64.1%, insufficient to establish a stronger model in that matchup.

Failures concentrated in particular models or games can bias comparisons of completed games. Even assigning all 32 missing four-player outcomes as DeepSeek losses and wins for the comparator leaves DeepSeek ahead of GLM, Kimi, and Qwen by at least 18.1, 13.9, and 16.7 percentage points on the original denominator of 288. These are conservative missing-outcome bounds, not confidence intervals, and they do not remove other uncertainty.

The four-player median of 36.2 minutes is about three times the duel median. It includes queues and retries from this run and cannot predict speed with a dedicated API connection.

Input accounts for 94.1% of reported tokens, so context compression is one option to test. Request counts, context, output behavior and provider accounting also affect totals; fewer tokens alone do not establish better decision efficiency or lower cost. GLM speaks in 96.6% of four-player model decisions versus DeepSeek's 82.3%, with a lower win rate. That observation alone cannot explain how chat affects outcomes.

This study has not tested RSI benefits. Four-player games have only 12 independent seed blocks, and duels have 20 per pair. Mirrors and permutations add games without adding equally many independent environments. Findings therefore apply to these API labels, Guan Yu, rules and prompts, and cannot rank general model capabilities.

A later RSI comparison can fix the base model and opponents, then compare empty memory, frozen consolidated memory and ongoing RSI on seeds unused for experience collection. Learning and evaluation usage should be reported separately.

## Game histories and chat

**528 games · 66,041 actions · 245,305 events · 24,352 public messages**, split into two files by format:

| File                                                          | Games                      |    Size |
| :------------------------------------------------------------ | :------------------------- | ------: |
| [Duel histories and chat](games-history-duel.json)            | 240: 233 normal, 7 failed  | 18.5 MB |
| [Four-player histories and chat](games-history-identity.json) | 288: 256 normal, 32 failed | 47.8 MB |

Each file is an independently readable JSON object. Together they contain every formal game: 489 normally completed and 39 terminated with errors. `partition` identifies the format and part number; `counts`, `countsBySuite`, and `eventTypeCounts` cover only the current file, while the original replay verification covers the full campaign. Each game includes models, player roles, outcome, timing, rounds, actions, events, chat, and its state at termination. Pilot games and intermediate checkpoints are excluded.

| Field                            | Contents                                                                                                                                                 |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experiment`, `source`, `counts` | Models and settings, source hashes, and record counts; `countsBySuite` splits counts by format.                                                          |
| `games[]`                        | One item per game, joined to `results.json` by `id`; `status` distinguishes `finished` and `error`.                                                      |
| `games[].players`                | Seat, name, model, general, role, final health, cards, and win flag. An errored game's `won: false` is not an adjudicated loss.                          |
| `games[].actions`                | Original executed decisions, including action ID, card selection, reason, optional speech, and `llm` / `forced` source.                                  |
| `games[].events`                 | Original complete event sequence, including card play, damage, draws, deaths, and public chat, with sequence numbers, timestamps, and visibility fields. |
| `games[].chat`                   | Public messages with speaker seat, name, model, role, time, round, turn, phase, and original message text; `eventSeq` links to the source event.         |
| `games[].finalState`             | Archived engine state at termination. Errored games retain their last state without an invented outcome.                                                 |

The file is for post-game analysis and includes hidden roles and private card events. Reconstructing an individual agent's visible context requires filtering fields such as `privateTo` and `publicText`. The `chat` array is a convenient projection of chat events already in `events`; do not count both. `durationMs` excludes documented pauses, while `wallDurationMs` includes them.

Actions and events are preserved as archived; message text comes from speech actually recorded by the engine. The export excludes API keys, endpoints, request headers, repeated decision prompts, and raw API responses.

```python
import json
from pathlib import Path

folder = Path("exp/sanguosha")
for filename in ["games-history-duel.json", "games-history-identity.json"]:
    with (folder / filename).open(encoding="utf-8") as stream:
        data = json.load(stream)
    game = data["games"][0]
    print(game["id"], game["status"], game["winner"])
    for message in game["chat"]:
        print(message["round"], message["model"], message["message"])
```

To export again from the original archives, run from the repository root. Only the Python standard library is required; no model API calls are made.

```bash
python exp/sanguosha/export_history.py --source /path/to/sanguosha/exp
```

The source must contain the original `plan.json`, `data/summary.json`, and `games/*.json.gz`. By default, `games-history-duel.json` and `games-history-identity.json` are written to `exp/sanguosha/`; use `--output-dir` to choose another directory.

## Data and reproduction

The [public data](results.json) contain aggregate metrics, roles and outcomes for 528 games, durations, intervals, and source SHA-256 hashes. They contain no API endpoints, keys, raw model conversations, or private experience. The original experiment replay-verified 528 final records, 66,041 actions, and 30,342 model inputs; the published verification counts do not replace a full trajectory audit.

From the repository root:

```bash
python -m venv /tmp/strategy-rsi-figures
/tmp/strategy-rsi-figures/bin/python -m pip install -r exp/sanguosha/requirements.txt
/tmp/strategy-rsi-figures/bin/python exp/sanguosha/render_figures.py
```

The script reads local JSON and writes six SVGs and six high-resolution PNGs to `exp/sanguosha/assets/`, without model API calls. It reproduces the figures rather than re-estimating the source analysis's bootstrap intervals. Vertical jitter in the duration plot uses a fixed seed solely to reduce overlapping points.
