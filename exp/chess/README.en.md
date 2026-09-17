# Chess: four-model baseline

[Project](../../README.en.md#experiments) · [Experiments](../README.md) · [中文](README.md) · [results.json](results.json) · [analysis.json](analysis.json) · [plan.json](plan.json)

The Chess baseline scheduled **168 games**: 24 initial games plus 144 in the extension. 77 completed and 91 failed. Including earlier pilots and functionality checks, 180 games were started against a cap of 200. Failed games remain in the records and were not replaced.

## Setup and game budget

6 model pairs × 2 colors × 2 languages × 7 repetitions = 168 games.

Every game starts from the standard initial board; `seed=42` leaves that position unchanged. Repetitions sample response variation from this starting point. Other starting positions were not tested. Each model has 84 scheduled games, 42 in each color.

| Item                        | Setting                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Models                      | `bailian/deepseek-v4-flash`<br>`glm-5.2`<br>`kimi-k3`<br>`qwen3.8-max-0902`                                                               |
| Rules version               | standard-v1                                                                                                                               |
| Languages                   | 84 Chinese / 84 English games                                                                                                             |
| Chat and memory             | Chat on; empty memory for every decision; RSI off                                                                                         |
| Context                     | Latest 80 visible events and 40 visible chat messages; production prompts and protocol                                                    |
| Sampling/output (requested) | temperature=0.6; reasoning_effort=low; max_tokens=8192                                                                                    |
| Timeout and retries         | 180 seconds; at most 2 recorded decision attempts, excluding pause cancellations; production 400/422 gateway compatibility retry retained |
| Action limit                | 160                                                                                                                                       |
| Fallback and adaptation     | No heuristic fallback or label-to-ID adaptation; forced no-choice actions may execute automatically                                       |
| Execution cohorts           | Initial: 16 games / 8 requests per model; extension: shared pool across three games, 96 games / 24 requests per model                     |

| Purpose                         | Games     | Included in performance         |
| ------------------------------- | --------- | ------------------------------- |
| Formal baseline                 | 168       | Yes; errors reported separately |
| 4,096-token pilot               | 4         | No                              |
| Original 4,096-token validation | 4         | No; includes interruptions      |
| 8,192-token validation          | 4         | No                              |
| Total started / cap             | 180 / 200 |                                 |

A startup TypeScript check found a shadowed path variable in the authentication-error branch. The run was paused for the fix, then resumed from the same checkpoints without replacing games. Canceled HTTP requests remain in the usage ledger; missing usage was not estimated. See [amendments.json](amendments.json) for the change and earlier runner snapshot.

## Results and figures

### 1. Model score

[![Model score](assets/win-rate.svg)](assets/win-rate.svg)

DeepSeek has the highest estimate among completed games at 68.9%, with a 95% clustered interval of 57.4%–79.4%. Excluding failed games may bias the sample, and this figure alone does not establish a statistically significant ranking.

### 2. Head-to-head

[![Head-to-head](assets/head-to-head.svg)](assets/head-to-head.svg)

Row model versus column opponent, with half credit for draws. Each pair has 28 scheduled games; cells show completed counts.

### 3. Game duration

[![Game duration](assets/game-duration.svg)](assets/game-duration.svg)

Completed and failed games are shown separately. Dots are games; thick lines are interquartile ranges and thin lines span the 5th–95th percentiles.

### 4. Protocol reliability and endings

[![Protocol reliability and endings](assets/reliability.svg)](assets/reliability.svg)

Rule wins: 55; rule draws: 21; action-limit draws: 1; errors: 91. An error is not scored as a model loss.

### 5. Token use

[![Token use](assets/token-use.svg)](assets/token-use.svg)

The baseline records 7348 HTTP requests: 48,002,952 input and 13,273,576 output tokens; 77 requests lack usage.

### 6. Communication frequency

[![Communication frequency](assets/chat-frequency.svg)](assets/chat-frequency.svg)

The figure shows the share of model decisions with speech in completed games, excluding forced actions. Speech is counted from public chat events produced by decisions.

## Denominators, languages and cohorts

| Model    | W / D / L | Completed n | Estimate | 95% clustered interval | Missing-outcome bounds |
| -------- | --------- | ----------- | -------- | ---------------------- | ---------------------- |
| DeepSeek | 20/11/6   | 37          | 68.9%    | 57.4%–79.4%            | 30.4%–86.3%            |
| GLM      | 6/5/27    | 38          | 22.4%    | 11.4%–34.6%            | 10.1%–64.9%            |
| Kimi     | 19/17/15  | 51          | 53.9%    | 44.1%–64.0%            | 32.7%–72.0%            |
| Qwen     | 10/11/7   | 28          | 55.4%    | 43.3%–67.2%            | 18.5%–85.1%            |

Missing-outcome bounds assign every failed participation either zero or one point, then divide by all scheduled participations. They show the possible range left by missing outcomes, not a confidence interval.

Score is `(wins + 0.5 × draws) / completed participations`, using only games the model completed. Win rate is wins divided by completed participations.

| Language | Planned | Completed | Errors | DeepSeek     | GLM          | Kimi         | Qwen         |
| -------- | ------- | --------- | ------ | ------------ | ------------ | ------------ | ------------ |
| en       | 84      | 37        | 47     | 77.5% (n=20) | 7.9% (n=19)  | 58.7% (n=23) | 54.2% (n=12) |
| zh       | 84      | 40        | 44     | 58.8% (n=17) | 36.8% (n=19) | 50.0% (n=28) | 56.2% (n=16) |

| Cohort             | Planned | Completed | Errors | DeepSeek     | GLM          | Kimi         | Qwen         |
| ------------------ | ------- | --------- | ------ | ------------ | ------------ | ------------ | ------------ |
| initial-20260916   | 24      | 11        | 13     | 58.3% (n=6)  | 20.0% (n=5)  | 83.3% (n=6)  | 30.0% (n=5)  |
| extension-20260917 | 144     | 66        | 78     | 71.0% (n=31) | 22.7% (n=33) | 50.0% (n=45) | 60.9% (n=23) |

Both cohorts used the same rules, prompts and decision parameters, but ran on different dates with different gateway load and concurrency. Language and cohort results are descriptive and cannot isolate the effects of language or concurrency.

| Ending reason                                 | Games |
| --------------------------------------------- | ----- |
| Resignation                                   | 34    |
| Checkmate                                     | 21    |
| Draw by agreement                             | 16    |
| Insufficient material                         | 4     |
| Decision limit reached                        | 1     |
| Draw claimed by repetition or fifty-move rule | 1     |

## Statistical methods and limits

Stratify by model pair, then resample repetition blocks within each pair. Each pair has 7 blocks, with colors and languages kept together. Use 20,000 bootstrap replicates with seed 20260917. Recompute the metric over completed participations in each replicate and take the 2.5th and 97.5th percentiles. Failed games stay in their resampled clusters but outside the completed denominator.

Intervals describe completed samples and are not corrected for selective failure or multiple comparisons. The study uses the standard starting position with limited repetitions; it does not establish performance for other openings or model versions. Action-limit draws are experimental stopping conditions and are counted separately from rule draws.

RSI is off and every baseline decision receives empty memory, so the study does not measure learning benefits. Speech frequency records how often models talk; it does not measure quality or establish whether chat improves outcomes.

Accumulated run time includes provider waits, request queues and checkpoint writes, with downtime between segments removed. It describes this run and cannot directly rank model speed.

## Model-call failures and functionality checks

| Model    | Attempts | Accepted | Rejected | Truncated | Illegal action | Label as ID | Terminal errors |
| -------- | -------- | -------- | -------- | --------- | -------------- | ----------- | --------------- |
| DeepSeek | 1710     | 1507     | 203      | 202       | 1              | 0           | 27              |
| GLM      | 1628     | 1501     | 127      | 68        | 45             | 1           | 24              |
| Kimi     | 2085     | 2053     | 32       | 0         | 9              | 2           | 3               |
| Qwen     | 1885     | 1741     | 144      | 0         | 139            | 76          | 37              |

A game needs many successful decisions in sequence. If both attempts at any step fail, the game ends in error, so a high response acceptance rate may still produce many unfinished games. Terminal errors are attributed to the model making the final failed decision for diagnosis; they are not losses.

"Label as ID" counts responses that put the exact display label of a legal action in the ID field. These are rejected actions, so error categories overlap and cannot be added together. Failed baseline decisions are not replaced by local play. See `games[].rejections` for individual reasons.

The HTTP ledger has 40 more records than saved decision attempts, from compatibility retries, pause cancellations and similar requests. A decision can send more than one request; requests and games are counted separately.

Separate functionality checks used an 8,192-token output limit across 4 games; 1 passed all checks. Fallback actions: 1; call errors: 6; successful consolidation jobs: 8 / 8. These short checks used an action cap of 20 and are excluded from performance estimates.

| Validation game       | Clean pass | Immediate RSI | Round RSI | Consolidations | Fallbacks | Call errors |
| --------------------- | ---------- | ------------- | --------- | -------------- | --------- | ----------- |
| validation-chess-zh-0 | False      | 18            | 2         | 2/2            | 0         | 2           |
| validation-chess-zh-1 | False      | 20            | 2         | 2/2            | 1         | 2           |
| validation-chess-en-0 | False      | 18            | 2         | 2/2            | 0         | 2           |
| validation-chess-en-1 | True       | 20            | 2         | 2/2            | 0         | 0           |

The audit checked 165 saved contexts for visible information, prompt language and memory scope, along with checkpoint recovery and HTTP replay. Existing memory was read in 72 decisions, including consolidated memory in 40.

Error calls without saved inputs could not be audited for context. Failures and interruptions from the original 4,096-token pilot and validation remain under `pilot` and `originalValidation`.

## Usage and data audit

| Phase                 | HTTP requests | With usage | Input tokens | Output tokens |
| --------------------- | ------------- | ---------- | ------------ | ------------- |
| baseline              | 7348          | 7271       | 48,002,952   | 13,273,576    |
| pilot4096             | 71            | 69         | 296,935      | 56,824        |
| validation4096        | 183           | 183        | 849,035      | 173,536       |
| validation8192        | 177           | 177        | 814,740      | 160,510       |
| consolidationRecovery | 0             | 0          | 0            | 0             |

Token counts come from provider-reported usage; output may include hidden reasoning. Missing usage was not estimated, including requests still in flight when the original validation was interrupted. Connectivity probes and output-limit diagnostics created no games and are recorded as shared requests without allocation to individual games.

The offline audit replayed 6802 actions from the initial states, checked visible information and empty memory in 7308 model inputs, and compared final states. All 168 games passed.

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
pip install -r exp/chess/requirements.txt
python3 exp/chess/analyze.py
python3 exp/chess/render_figures.py
python3 exp/chess/write_report.py
```

Per-game entry points reuse statistics and layout code in [../\_shared/](../_shared/), keeping data and outputs in their own game directory. Figures follow the [Sanguosha](../sanguosha/README.en.md) card layout: 2816 × 1276 PNG plus scalable SVG.

With the complete original local experiment artifacts available, re-export and audit this game offline:

```bash
npx tsx scripts/export-game-results.ts --game chess
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
with gzip.open("exp/chess/games-history.json.gz", "rt") as f:
    history = json.load(f)
print(len(history["games"]))
print(history["games"][0]["job"])
```
