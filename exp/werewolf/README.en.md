# Werewolf: four-model baseline

[Project](../../README.en.md#experiments) · [Experiments](../README.md) · [中文](README.md) · [results.json](results.json) · [analysis.json](analysis.json) · [plan.json](plan.json)

The Werewolf baseline scheduled **168 games**: 24 initial games plus 144 in the extension. 156 completed and 12 failed. Including earlier pilots and functionality checks, 176 games were started against a cap of 200. Failed games remain in the records and were not replaced.

## Setup and game budget

8 players; 21 role-shuffle seeds × 4 cyclic model rotations × 2 languages = 168 games. Each model occupies two seats in every game.

Roles: 2 wolves, 1 seer, 1 witch, 1 hunter and 3 villagers, with night actions, discussion, voting and outcomes. Each model has 336 scheduled seats: 84 wolf, 42 seer, 42 witch, 42 hunter and 126 villager. Both languages use the same role seeds: `930001 + 997 × block`, for blocks 0–20.

| Item                        | Setting                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Models                      | `bailian/deepseek-v4-flash`<br>`glm-5.2`<br>`kimi-k3`<br>`qwen3.8-max-0902`                                                               |
| Rules version               | social-deduction-v1                                                                                                                       |
| Languages                   | 84 Chinese / 84 English games                                                                                                             |
| Chat and memory             | Chat on; empty memory for every decision; RSI off                                                                                         |
| Context                     | Latest 80 visible events and 40 visible chat messages; production prompts and protocol                                                    |
| Sampling/output (requested) | temperature=0.6; reasoning_effort=low; max_tokens=8192                                                                                    |
| Timeout and retries         | 180 seconds; at most 2 recorded decision attempts, excluding pause cancellations; production 400/422 gateway compatibility retry retained |
| Action limit                | 200                                                                                                                                       |
| Fallback and adaptation     | No heuristic fallback or label-to-ID adaptation; forced no-choice actions may execute automatically                                       |
| Execution cohorts           | Initial: 16 games / 8 requests per model; extension: shared pool across three games, 96 games / 24 requests per model                     |

| Purpose                         | Games     | Included in performance         |
| ------------------------------- | --------- | ------------------------------- |
| Formal baseline                 | 168       | Yes; errors reported separately |
| 4,096-token pilot               | 4         | No                              |
| Original 4,096-token validation | 0         | No; includes interruptions      |
| 8,192-token validation          | 4         | No                              |
| Total started / cap             | 176 / 200 |                                 |

A startup TypeScript check found a shadowed path variable in the authentication-error branch. The run was paused for the fix, then resumed from the same checkpoints without replacing games. Canceled HTTP requests remain in the usage ledger; missing usage was not estimated. See [amendments.json](amendments.json) for the change and earlier runner snapshot.

## Results and figures

### 1. Team win rate

[![Team win rate](assets/win-rate.svg)](assets/win-rate.svg)

Kimi has the highest estimate among completed games at 56.1%, with a 95% clustered interval of 48.4%–64.0%. Excluding failed games may bias the sample, and this figure alone does not establish a statistically significant ranking.

### 2. Performance by role

[![Performance by role](assets/role-win-rate.svg)](assets/role-win-rate.svg)

Cells show team win rates and completed seat counts for each role. Teammates share a faction outcome, and both seats of a model come from the same game, so these records are related.

### 3. Game duration

[![Game duration](assets/game-duration.svg)](assets/game-duration.svg)

Completed and failed games are shown separately. Dots are games; thick lines are interquartile ranges and thin lines span the 5th–95th percentiles.

### 4. Protocol reliability and endings

[![Protocol reliability and endings](assets/reliability.svg)](assets/reliability.svg)

Rule wins: 156; rule draws: 0; action-limit draws: 0; errors: 12. An error is not scored as a model loss.

### 5. Token use

[![Token use](assets/token-use.svg)](assets/token-use.svg)

The baseline records 7780 HTTP requests: 30,869,153 input and 9,330,102 output tokens; 40 requests lack usage.

### 6. Communication frequency

[![Communication frequency](assets/chat-frequency.svg)](assets/chat-frequency.svg)

The figure shows the share of model decisions with speech in completed games, excluding forced actions. Speech includes public and wolf-team messages.

## Denominators, languages and cohorts

| Model    | W / D / L | Completed n | Estimate | 95% clustered interval | Missing-outcome bounds |
| -------- | --------- | ----------- | -------- | ---------------------- | ---------------------- |
| DeepSeek | 172/0/140 | 312         | 55.1%    | 48.4%–61.5%            | 51.2%–58.3%            |
| GLM      | 171/0/141 | 312         | 54.8%    | 49.1%–60.5%            | 50.9%–58.0%            |
| Kimi     | 175/0/137 | 312         | 56.1%    | 48.4%–64.0%            | 52.1%–59.2%            |
| Qwen     | 170/0/142 | 312         | 54.5%    | 50.3%–58.7%            | 50.6%–57.7%            |

Missing-outcome bounds assign every failed participation either zero or one point, then divide by all scheduled participations. They show the possible range left by missing outcomes, not a confidence interval.

Team win rate is winning seats divided by completed seats; draws contribute zero wins. Each model occupies two seats per game, so its participation count is twice the completed game count.

| Language | Planned | Completed | Errors | DeepSeek      | GLM           | Kimi          | Qwen          |
| -------- | ------- | --------- | ------ | ------------- | ------------- | ------------- | ------------- |
| en       | 84      | 76        | 8      | 48.7% (n=152) | 50.7% (n=152) | 51.3% (n=152) | 52.0% (n=152) |
| zh       | 84      | 80        | 4      | 61.3% (n=160) | 58.8% (n=160) | 60.6% (n=160) | 56.9% (n=160) |

| Cohort             | Planned | Completed | Errors | DeepSeek      | GLM           | Kimi          | Qwen          |
| ------------------ | ------- | --------- | ------ | ------------- | ------------- | ------------- | ------------- |
| initial-20260916   | 24      | 21        | 3      | 50.0% (n=42)  | 50.0% (n=42)  | 52.4% (n=42)  | 52.4% (n=42)  |
| extension-20260917 | 144     | 135       | 9      | 55.9% (n=270) | 55.6% (n=270) | 56.7% (n=270) | 54.8% (n=270) |

Both cohorts used the same rules, prompts and decision parameters, but ran on different dates with different gateway load and concurrency. Language and cohort results are descriptive and cannot isolate the effects of language or concurrency.

| Ending reason                            | Games |
| ---------------------------------------- | ----- |
| All werewolves eliminated. Village wins. | 94    |
| Werewolves reach parity. Wolves win.     | 62    |

## Statistical methods and limits

Resample the 21 role seeds as clusters, keeping all four rotations and both languages together. Use 20,000 bootstrap replicates with seed 20260917. Recompute the metric over completed participations in each replicate and take the 2.5th and 97.5th percentiles. Failed games stay in their resampled clusters but outside the completed denominator.

Intervals describe completed samples and are not corrected for selective failure or multiple comparisons. The study uses one 8-player role configuration; it does not establish performance for other player counts, roles or model versions. Action-limit draws are experimental stopping conditions and are counted separately from rule draws.

RSI is off and every baseline decision receives empty memory, so the study does not measure learning benefits. Speech frequency records how often models talk; it does not measure quality or establish whether chat improves outcomes.

Accumulated run time includes provider waits, request queues and checkpoint writes, with downtime between segments removed. It describes this run and cannot directly rank model speed.

## Model-call failures and functionality checks

| Model    | Attempts | Accepted | Rejected | Truncated | Illegal action | Label as ID | Terminal errors |
| -------- | -------- | -------- | -------- | --------- | -------------- | ----------- | --------------- |
| DeepSeek | 1909     | 1907     | 2        | 1         | 1              | 0           | 0               |
| GLM      | 1933     | 1868     | 65       | 52        | 2              | 0           | 10              |
| Kimi     | 1925     | 1918     | 7        | 0         | 3              | 0           | 1               |
| Qwen     | 1988     | 1974     | 14       | 3         | 3              | 0           | 1               |

A game needs many successful decisions in sequence. If both attempts at any step fail, the game ends in error, so a high response acceptance rate may still produce many unfinished games. Terminal errors are attributed to the model making the final failed decision for diagnosis; they are not losses.

"Label as ID" counts responses that put the exact display label of a legal action in the ID field. These are rejected actions, so error categories overlap and cannot be added together. Failed baseline decisions are not replaced by local play. See `games[].rejections` for individual reasons.

The HTTP ledger has 25 more records than saved decision attempts, from compatibility retries, pause cancellations and similar requests. A decision can send more than one request; requests and games are counted separately.

Separate functionality checks used an 8,192-token output limit across 4 games; 2 passed all checks. Fallback actions: 0; call errors: 2; successful consolidation jobs: 15 / 16. These short checks used an action cap of 32 and are excluded from performance estimates.

| Validation game          | Clean pass | Immediate RSI | Round RSI | Consolidations | Fallbacks | Call errors |
| ------------------------ | ---------- | ------------- | --------- | -------------- | --------- | ----------- |
| validation-werewolf-zh-0 | True       | 32            | 8         | 4/4            | 0         | 0           |
| validation-werewolf-zh-1 | True       | 32            | 8         | 4/4            | 0         | 0           |
| validation-werewolf-en-1 | False      | 32            | 8         | 3/4            | 0         | 0           |
| validation-werewolf-en-0 | False      | 32            | 8         | 4/4            | 0         | 2           |

The audit checked 290 saved contexts for visible information, prompt language and memory scope, along with checkpoint recovery and HTTP replay. Existing memory was read in 117 decisions, including consolidated memory in 28. Private roles and team chat were also checked against seat visibility.

Error calls without saved inputs could not be audited for context. Failures and interruptions from the original 4,096-token pilot and validation remain under `pilot` and `originalValidation`.

During English validation, one DeepSeek consolidation returned a text array that the parser rejected. After the fix, the saved response was replayed and a live API retry was run on a copy of the validation database. This added zero games. Original pass counts were kept unchanged; the recovery is recorded in `consolidationRecovery`.

## Usage and data audit

| Phase                 | HTTP requests | With usage | Input tokens | Output tokens |
| --------------------- | ------------- | ---------- | ------------ | ------------- |
| baseline              | 7780          | 7740       | 30,869,153   | 9,330,102     |
| pilot4096             | 74            | 71         | 146,289      | 30,816        |
| validation4096        | 0             | 0          | 0            | 0             |
| validation8192        | 306           | 306        | 1,424,302    | 306,440       |
| consolidationRecovery | 1             | 1          | 424          | 724           |

Token counts come from provider-reported usage; output may include hidden reasoning. Missing usage was not estimated, including requests still in flight when the original validation was interrupted. Connectivity probes and output-limit diagnostics created no games and are recorded as shared requests without allocation to individual games.

The offline audit replayed 7673 actions from the initial states, checked visible information and empty memory in 7755 model inputs, and compared final states. All 168 games passed.

Auditing and plotting make no model calls. Raw inputs, responses and checkpoints stay in local `artifacts/`; public files contain summaries and complete action histories, without API keys.

## Files and reproduction

| File                                                                                  | Contents                                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [results.json](results.json)                                                          | Per-game summaries, language/cohort counts, calls and RSI checks                                    |
| [analysis.json](analysis.json)                                                        | Clustered intervals, missing-outcome bounds, matrices and duration statistics                       |
| [games-history.json.gz](games-history.json.gz)                                        | Omniscient research history: roles, actions, reasons, private chat and final state; not Agent input |
| [config.example.yaml](config.example.yaml)                                            | Credential-free config example; EXPERIMENT_ENV can point to a private config file                   |
| [plan.json](plan.json) · [amendments.json](amendments.json)                           | Fixed schedule, game budget, protocol, source hashes and amendment                                  |
| [provenance.json](provenance.json) · [source-snapshot.tar.gz](source-snapshot.tar.gz) | Data/source verification; the earlier runner is also preserved in the snapshot                      |
| [provenance/](provenance/)                                                            | This game’s initial 24-game plan, pilot records and historical source snapshots                     |
| [assets/](assets/)                                                                    | Six SVGs, matching PNGs, and generation provenance                                                  |

From the repository root, reproduce analysis and figures using public JSON only:

```bash
python3 -m venv .venv-exp
. .venv-exp/bin/activate
pip install -r exp/werewolf/requirements.txt
python3 exp/werewolf/analyze.py
python3 exp/werewolf/render_figures.py
python3 exp/werewolf/write_report.py
```

Per-game entry points reuse statistics and layout code in [../\_shared/](../_shared/), keeping data and outputs in their own game directory. Figures follow the [Sanguosha](../sanguosha/README.en.md) card layout: 2816 × 1276 PNG plus scalable SVG.

With the complete original local experiment artifacts available, re-export and audit this game offline:

```bash
npx tsx scripts/export-game-results.ts --game werewolf
```

Independently check public data, budgets, histories, denominators and figure hashes:

```bash
python3 scripts/experiments/verify_studies.py
```

Run experiments with [run-game-baselines.ts](../../scripts/run-game-baselines.ts). It reads `api_key_env_yh` from the specified `.env` and calls the paid API. With `--check`, it only validates the schedule and local rules. Resuming reuses game IDs and checkpoints, skips ended games, and enforces the 200-game cap per game type.

Executing the study also requires the local historical ledger at `artifacts/multigame-20260916/public-archive/`. Reading reports, recomputing public statistics and plotting do not require it.

Read the public history:

```python
import gzip, json
with gzip.open("exp/werewolf/games-history.json.gz", "rt") as f:
    history = json.load(f)
print(len(history["games"]))
print(history["games"][0]["job"])
```
