<p align="center">
  <img src="docs/assets/logo.png" alt="Strategy-RSI logo" width="132" />
</p>

<h1 align="center">Strategy-RSI</h1>
<p align="center"><strong>A Multi-Agent Arena for Recursive Self-Improvement</strong></p>
<p align="center">Multi-agent strategy and recursive self-improvement (RSI)<br />Build experience through play. Use it to improve decisions.</p>
<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>
<p align="center">
  <img src="docs/assets/badges.svg" alt="Node.js 22.13+ · TypeScript · 2–12 Agents · Apache 2.0" width="620" />
</p>
<p align="center">
  <a href="#games">Games</a> · <a href="#quick-start">Quick Start</a> · <a href="#features">Features</a> · <a href="#experience-loop">RSI</a> · <a href="#demos">Recordings</a> · <a href="#experiments">Experiments</a> · <a href="#documentation">Docs</a>
</p>

---

Strategy-RSI is a game-based experimental platform for agent recursive self-improvement (RSI). Agents use immediate reflection, post-game review, and experience consolidation to inform later decisions. Across Sanguosha, Werewolf, Chess and Xiangqi, the platform supports matches between different models, concurrent games, agent conversations, and visual replays.

<a id="games"></a>

## Multi-game support

Every game uses the same model adapter, communication, immediate/post-game RSI, consolidation, concurrency and replay services. Experience is scoped by Agent ID × game type.

| Game      | Players | Languages         | Rules                                                         |
| --------- | ------- | ----------------- | ------------------------------------------------------------- |
| Sanguosha | 2–8     | Chinese           | [Roles, cards and generals](docs/RULES.md)                    |
| Werewolf  | 6–12    | Chinese / English | [Fixed roles and day/night phases](docs/games/werewolf.en.md) |
| Chess     | 2       | Chinese / English | [Moves and draw rules](docs/games/chess.en.md)                |
| Xiangqi   | 2       | Chinese           | [Moves and experimental adjudication](docs/games/xiangqi.md)  |

Start in the dedicated **游戏大厅** (Game Lobby), browse or search the game collection, then enter a workspace. Use **游戏大厅** in the header to return and choose another game. Choose the language for a new match, then run a local demo or open **New match** to select profiles with model and RSI settings. Each game remembers its match, round, replay frame and perspective across switches and reloads; browser back/forward is supported. See the [arena UI guide](docs/ARENA_UI.md). Werewolf supports private wolf-team night communication; board games support optional public speech with each move.

[Documentation index](docs/README.md) · [Game/rules catalog](docs/games/README.md) · [Architecture](docs/MULTIGAME_ARCHITECTURE.md) · [Adding a game](docs/EXTENDING_GAMES.md) · [API](docs/API.md)

Werewolf uses an explicit fixed-role experimental ruleset. Xiangqi implements legal moves, checkmate/stalemate and perpetual-check adjudication, but not full tournament chase adjudication. Chess supports castling, en passant, promotions and repetition/move-count draws. Consult each rules page for exact boundaries. The archived GIF/MP4 demonstrations and published baseline results below remain specific to Sanguosha. Game controls, rules and Agent decision/communication/RSI prompts support the languages above; the shared lobby and player library retain Chinese labels.

<details>
<summary><strong>Current lobby and game previews</strong></summary>

<table>
  <tr>
    <td width="50%" align="center"><strong>Game Lobby</strong><br /><a href="docs/assets/game-lobby.png"><img src="docs/assets/game-lobby.png" alt="Game Lobby" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Werewolf</strong><br /><a href="docs/assets/werewolf-arena.png"><img src="docs/assets/werewolf-arena.png" alt="Werewolf" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Chess</strong><br /><a href="docs/assets/chess-arena.png"><img src="docs/assets/chess-arena.png" alt="Chess" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Xiangqi</strong><br /><a href="docs/assets/xiangqi-arena.png"><img src="docs/assets/xiangqi-arena.png" alt="Xiangqi" width="100%" /></a></td>
  </tr>
</table>

Captured from the current app with local test data; these previews do not report model performance. [Sources and reproduction](docs/MEDIA.md).

</details>

<a id="news"></a>

## 📰 News

- **2026.09.16** — Added Werewolf, Chess and Xiangqi, a dedicated game lobby, distinct page themes and game-scoped experience. Completed a quality review covering initialization rollback, replay/navigation and memory ownership; [dated findings and validation](docs/QUALITY_REVIEW.md).
- **2026.09.14** — Completed the four-model baseline study, with six figures covering wins, matchups, roles, duration, tokens, and chat, plus public summary data and plotting code.
- **2026.09.11** — Initial release: live spectating, a player library, concurrent games, public agent chat, and RSI experience consolidation, with setup guides and tests.

<a id="quick-start"></a>

## 🚀 Quick Start

### 1. Start the arena

Install **Node.js ≥ 22.13**, then run:

```bash
git clone https://github.com/Liuziyu77/Strategy-RSI.git
cd Strategy-RSI
npm ci
npm run dev
```

Open the [game lobby](http://localhost:3930), choose a game, then click **运行本地演示 (Run local demo)** to watch policy agents play. No API key is required. If a project-local Node runtime is already available, use `./run.sh dev`.

### 2. Add your agents

1. **Create a player**: open **玩家库** (Player Library), set a name, model connection and RSI modes. A general is only used by Sanguosha.
2. **Create a match**: choose the game in the lobby, select its language, then choose players, game count, concurrency and chat settings. Only Sanguosha provides manual role assignments.
3. **Observe and review**: inspect live play and replays, then manage game-scoped experience in the game inspector or player library. When adding manual/TXT experience in the library, choose **经验所属游戏** (Experience game).

Model endpoints must support `POST /v1/chat/completions`. You can also configure a shared service through [.env.example](.env.example). See the [setup and model integration guide →](docs/GETTING_STARTED.md) for details.

<details>
<summary><b>Production use and data storage</b></summary>

```bash
npm run build
npm start
```

Data is stored in `data/arena.sqlite` by default. After a restart, unfinished matches return in a paused state and can resume from their checkpoints. Configuration options include `DATA_DIR`, `PORT`, `HOST`, and `ARENA_ADMIN_TOKEN`. Use one server process per data directory. Back up existing data before upgrading; see [migration and rollback](docs/MIGRATION.md).

</details>

<a id="features"></a>

## 🎯 Features

### Strategy and communication

Configure a separate model API for each player, or connect local policies and external agents. Optional speech accompanies a legal action; the visible conversation enters later decision and review context. Werewolf supports private wolf-team night discussion and public daytime discussion; chess games support public speech with each move. Role editing and general selection apply only to Sanguosha.

### Experience across games

Manage each player's API settings, RSI modes, experience and match history in one place. Immediate reflections and post-game reviews are grouped by match, then consolidated by the player's current model. Experience applies to later matches of the same game type; Chinese and English variants share it.

### Live observation

A match can contain multiple games, with configurable concurrency that defaults to 1. Switch between matches and games to inspect the chessboard or role table, recent actions and conversations. Sanguosha retains card and health animations. Inspect the process and results through frame-by-frame replays, per-match win rates, duration and round counts, and JSON / JSONL exports.

<details>
<summary><strong>View player library and experience screenshots</strong></summary>

**Player library · Settings, experience, and match history together**

![Player library with match history and per-match statistics](docs/assets/player-library.png)

**Experience consolidation · Originals retained, summaries used in later decisions**

![Consolidated immediate reflections and post-game reviews](docs/assets/experience.png)

</details>

Two-player Sanguosha uses a simplified Lord-versus-Rebel setup. See the [rules guide](docs/RULES.md) for the implemented roles, cards, and skills.

<a id="experience-loop"></a>

## 🧠 Experience Loop

**The core RSI loop: turn game events into experience the agent can read at its next decision.**

<img src="docs/assets/experience-loop.svg" alt="Visible context and personal memory inform model decisions; the rules engine executes actions, and immediate or post-game reflection updates memory, with optional consolidation" width="100%" />

| Mode                 | When experience is collected                                                     |
| :------------------- | :------------------------------------------------------------------------------- |
| **Immediate RSI**    | After an action involving a choice, assess and record reusable lessons.          |
| **Post-game RSI**    | Review each completed game; store reviews separately from immediate reflections. |
| **Both modes**       | Enable both action reflection and post-game review.                              |
| **New RSI disabled** | Stop generating new reflections while continuing to use existing experience.     |

**Collection and storage** · Experience is organized by player → match → source game and reflection type. Experience written by the same agent in concurrent games is available to its later decisions within the same game type. Chinese and English matches of that game share memory. Each player's private experience remains separate; public chat context contains only messages from the current game.

**Consolidation and reuse** · The player's configured model deduplicates, rewrites, and summarizes experience. Consolidation supports batching, retries for temporary failures, and reuse of completed batches. Later decisions prioritize the latest valid consolidation and add new experience it does not yet cover. Original entries and older versions are retained.

> **How learning works** · RSI currently uses text reflections, persistent memory, and context updates; it does not train model weights. Whether experience improves decisions should be tested with controlled comparisons. A change in win rate alone does not establish a learning effect.

<details>
<summary><b>Experiment notes: comparing Baseline and RSI</b></summary>

Each model receives its visible state, legal actions, history, chat, and personal experience. The rules engine validates and executes its choice. A legal action and optional speech share one decision request; Sanguosha discards are selected together, and the only legal action is normally executed automatically, except Werewolf discussion turns that require an Agent response. Logs record retries and local fallbacks when model calls fail or actions are invalid.

For controlled comparisons, configure random seeds, roles, seats, RSI modes, and independent player profiles. Check role distributions, sample sizes, opponents, and API fallback rates when comparing results. Seeds control the engine's randomness; model responses and the order in which concurrent games contribute experience can still vary.

To test an agent with fixed, previously learned experience, disable new RSI. For a baseline without experience, create a separate player profile with empty memory.

</details>

<a id="demos"></a>

## 🎬 Sanguosha recordings

**Archived feature demos** · From live games to experience management

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <h4>🎮 Live Spectating</h4>
      <a href="docs/assets/arena-demo.mp4?raw=true"><img src="docs/assets/arena-demo.gif" alt="Five-player demo with card animations, chat, and switching between concurrent games" width="100%" /></a>
      <p><sub>Card animations · Concurrent games</sub></p>
      <p><a href="docs/assets/arena-demo.mp4?raw=true">▶ HD video</a> · <a href="docs/assets/arena.png">Screenshot</a></p>
    </td>
    <td width="50%" align="center" valign="top">
      <h4>🧠 Experience</h4>
      <a href="docs/assets/experience-demo.mp4?raw=true"><img src="docs/assets/experience-demo.gif" alt="Player profiles, experience categories, and model-driven consolidation" width="100%" /></a>
      <p><sub>Player profiles · Consolidation</sub></p>
      <p><a href="docs/assets/experience-demo.mp4?raw=true">▶ HD video</a> · <a href="docs/assets/experience.png">Screenshot</a></p>
    </td>
  </tr>
</table>

**Recorded game highlights** · From an archived chat experiment

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <h4>⚔️ Battle Replay</h4>
      <a href="docs/assets/battle-highlight.mp4?raw=true"><img src="docs/assets/battle-highlight.gif" alt="Recorded game: duels between the Lord and a Rebel, Guan Yu's Wusheng skill, and damage resolution" width="100%" /></a>
      <p><sub>Duel exchanges · Repeated attacks</sub></p>
      <p><a href="docs/assets/battle-highlight.mp4?raw=true">▶ HD video</a> · <a href="docs/assets/battle-highlight.png">Screenshot</a></p>
    </td>
    <td width="50%" align="center" valign="top">
      <h4>💬 Agent Chat</h4>
      <a href="docs/assets/chat-highlight.mp4?raw=true"><img src="docs/assets/chat-highlight.gif" alt="Recorded agent chat: probing hidden roles, questioning actions, and public rebuttals from RSI Guan Yu" width="100%" /></a>
      <p><sub>Role probing · Public rebuttals</sub></p>
      <p><a href="docs/assets/chat-highlight.mp4?raw=true">▶ HD video</a> · <a href="docs/assets/chat-highlight.png">Screenshot</a></p>
    </td>
  </tr>
</table>

> **About the recordings** · The top row uses a local policy to simulate model API responses. The bottom row replays archived model games, preserving the original actions and public messages while shortening wait times. The interface and conversations are in Chinese. Click a GIF to open the **1920 × 1280** HD MP4. [Sources, clip details, and recording instructions →](docs/MEDIA.md)

<a id="experiments"></a>

## 📊 Sanguosha baseline experiments

**4 models · 528 scheduled games · 489 completed normally · 39 failed**

Measure play without experience before testing RSI. All agents use Guan Yu and empty memory, with **RSI off and public chat on**. Duels mirror roles and seats; four-player games cover every seat permutation. Win rates below use normally completed games and do not measure an RSI improvement. [Setup, methods, and data →](exp/sanguosha/README.en.md)

### Win rate

[![Duel and four-player identity win rates with 95% seed-block confidence intervals](exp/sanguosha/assets/win-rate.svg)](exp/sanguosha/assets/win-rate.svg)

DeepSeek leads four-player identity games at **61.7%**. Its differences from all three opponents remain supported after correcting for multiple comparisons; the other three cannot be reliably ranked against one another.

### Head-to-head

[![Duel matrix showing each row model's win rate and wins against each column opponent](exp/sanguosha/assets/head-to-head.svg)](exp/sanguosha/assets/head-to-head.svg)

DeepSeek finishes **20 : 19** against GLM and **28 : 12** against Kimi. The overall leader's results still depend on the opponent; individual matchups add context to aggregate win rates.

### Role win rate

[![Win rates and sample sizes for each model as Lord, Loyalist, Rebel, and Renegade](exp/sanguosha/assets/role-win-rate.svg)](exp/sanguosha/assets/role-win-rate.svg)

DeepSeek has the highest point estimate in all four roles. Weighting roles equally leaves its win rate at **61.6%**, so differences in the observed role mix do not explain its overall lead.

### Game duration

[![Individual game durations with medians, interquartile ranges, and P5–P95 whiskers](exp/sanguosha/assets/game-duration.svg)](exp/sanguosha/assets/game-duration.svg)

Median duration is **12.1 minutes** for duels and **36.2 minutes** for four-player games. Times include request queues and retries, with documented account-recovery pauses removed; they describe this concurrent run.

### Token use

[![Cumulative API-reported input and output tokens for each model](exp/sanguosha/assets/token-use.svg)](exp/sanguosha/assets/token-use.svg)

The formal experiment reports **428.5M tokens**, with input accounting for **94.1%**. Context compression is a useful next optimization to test. Totals include reported retry usage; different provider accounting prevents a direct cost ranking.

### Chat frequency

[![Share of model decisions containing public speech, split by duel and four-player games](exp/sanguosha/assets/chat-frequency.svg)](exp/sanguosha/assets/chat-frequency.svg)

In four-player games, GLM speaks in **96.6%** of model decisions versus DeepSeek's **82.3%**. More frequent speech does not coincide with more wins here; isolating its effect requires a chat-on/off comparison with the same models and seeds.

<sub>Click figures to enlarge. Also available: <a href="exp/sanguosha/assets">high-resolution PNGs</a>, <a href="exp/sanguosha/results.json">public summary data</a>, <a href="exp/sanguosha/games-history-duel.json">duel histories and chat</a>, <a href="exp/sanguosha/games-history-identity.json">four-player histories and chat</a>, and the <a href="exp/sanguosha/render_figures.py">plotting script</a>. Findings apply to the tested API model labels, Guan Yu, rules, prompts, and sampled seeds.</sub>

<a id="todo-list"></a>

## 📌 Todo List

### Completed · Available now

- [x] **Sanguosha gameplay**: a 2–8 player rules engine, Standard and EX cards, basic generals, and role configuration.
- [x] **Player library**: separate model APIs and RSI settings, personal experience, match history, per-match and overall win rates, durations, and round counts.
- [x] **Lobby and visual spectating**: searchable game collection, separate themes, preserved view state, chessboard flipping and frame-by-frame replays; Sanguosha card and health animations.
- [x] **Concurrent games**: configurable concurrency, independently saved progress, and experience collected under the corresponding agent.
- [x] **Experience learning and consolidation**: immediate / post-game RSI, experience grouped by match, consolidation through the agent's model, retained originals and versions, and timeout and retry handling.
- [x] **Agent communication**: optional public text and private Werewolf team discussion, filtered by seat and saved with the game for decisions and RSI.
- [x] **Execution and tracing**: batched discard decisions, API call logs, SQLite persistence and recovery, and JSON / JSONL exports.
- [x] **Presentation and documentation**: logo, GIF / MP4 demos, integration and architecture guides, and rules, server, and browser tests.
- [x] **Multi-game support**: shared game interfaces with Werewolf, Chess and Xiangqi plugins; an extension guide for future environments.

### Planned

- [ ] **Improve experience self-evolution**: refine experience generation, selection, consolidation, and feedback so that experience can be revised over time.
- [ ] **Support more generals**: add general profiles, skill descriptions, and the corresponding rules.

<a id="documentation"></a>

## 📚 Documentation

Chinese is the primary version of this README. The game catalog, Werewolf and Chess rules, multi-game architecture, extension guide, and baseline experiment notes include English documentation. Setup and shared administration guides are primarily Chinese.

- [Documentation index](docs/README.md) — reading paths, terminology, language coverage, and maintenance conventions.
- [Setup and model integration](docs/GETTING_STARTED.md) — local setup, API configuration, match settings, and recovery from saved data.
- [Game catalog and rules](docs/games/README.md) — player counts, languages, rules, and experimental boundaries.
- [Sanguosha rules](docs/RULES.md) — roles, cards, equipment, and basic generals.
- [Extending the architecture](docs/EXTENDING_GAMES.md) — plugin contracts, registration, persistence, and required tests.
- [Multi-game architecture](docs/MULTIGAME_ARCHITECTURE.md) · [Runtime details](docs/ARCHITECTURE.md) — plugin boundaries, scheduling, transactions, recovery, and experience storage.
- [Arena UI](docs/ARENA_UI.md) · [Visual design](docs/VISUAL_DESIGN.md) — navigation, controls, and page themes.
- [Migration](docs/MIGRATION.md) — existing data, memory scopes, and rollback.
- [HTTP API](docs/API.md) — player library, match controls, external agents, exports, and consolidation endpoints.
- [Baseline experiments (English)](exp/sanguosha/README.en.md) — setup, statistical methods, interpretation, and figure reproduction.
- [Media](docs/MEDIA.md) — logo, GIFs, HD videos, and recording instructions.
- [Quality review (Chinese)](docs/QUALITY_REVIEW.md) — fixes, validation, and remaining maintenance work.

<details>
<summary><b>Development and validation</b></summary>

```bash
npm run typecheck
npm test
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Unit and integration tests cover rules, information isolation, persistence, model protocols, RSI, consolidation, and concurrent chat. Browser tests cover desktop and mobile interactions. Routine tests use temporary data and local mock models without calling real model APIs.

```text
src/games/ Game contracts, catalog, registry, and Werewolf/Chess/Xiangqi engines
src/       Sanguosha engine, cards, roles, and shared protocol types
server/    Model integration, scheduling, chat, experience, and SQLite
web/       Lobby, game views, player library, navigation, and themes
tests/     Rules, server integration, and browser tests
scripts/   Simulation, external agents, and media recording
docs/      Setup guides, rules, architecture, and media assets
```

</details>

## License and Acknowledgments

This repository is licensed under [Apache License 2.0](LICENSE). The basic functionality and rules design draw on [wmzy/sanguosha](https://github.com/wmzy/sanguosha). This project reimplements the rules state machine, server protocol, and frontend, without using that project's images, sound effects, or general artwork. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source notes.

---

<div align="center">
  <img src="docs/assets/logo.png" alt="" width="42" /><br />
  <sub>Strategy-RSI · Observe the game. Reflect on the choices.</sub><br />
  <a href="#strategy-rsi">Back to top ↑</a>
</div>
