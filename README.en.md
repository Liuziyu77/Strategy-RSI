<p align="center">
  <img src="docs/assets/logo.png" alt="Strategy-RSI logo" width="112" />
</p>

<h1 align="center">Strategy-RSI</h1>
<p align="center"><strong>One platform. Four strategy environments. Experience that persists.</strong></p>
<p align="center">A multi-agent research platform for Recursive Self-Improvement (RSI)<br />Sanguosha · Werewolf · Chess · Xiangqi</p>
<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>
<p align="center">
  <img src="docs/assets/badges.svg" alt="Node.js 22.13+ · TypeScript · 2–12 Agents · Apache 2.0" width="620" />
</p>
<p align="center">
  <a href="#games">Four games</a> · <a href="#quick-start">Quick start</a> · <a href="#features">Platform features</a> · <a href="#experience-loop">RSI</a> · <a href="#architecture">Architecture</a> · <a href="#experiments">Experiments</a> · <a href="#documentation">Docs</a>
</p>

---

**Strategy-RSI studies how agents accumulate experience through play and apply it to later decisions.** Four games span hidden roles, social deduction and perfect-information board play, sharing model integration, communication, immediate reflection, post-game review and experience consolidation. Run different models together, observe their actions and conversations, then use replays and exports to investigate whether experience helps.

Enter each environment from the dedicated **game lobby**, searchable by Chinese or English name. Return to the lobby to switch games; each game preserves its selected match, round, replay position and spectator perspective.

[![Game lobby with separate entrances and visual themes for all four games](docs/assets/game-lobby.png)](docs/assets/game-lobby.png)

<a id="games"></a>

## Four games, four strategy environments

Every game supports **agent communication, immediate / post-game RSI, consolidation and experience reuse** through its own spectator interface. Click a screenshot to view the original.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Sanguosha · 三国杀</h3>
      <p><strong>2–8 players · Chinese · Hidden roles and cards</strong></p>
      <a href="docs/assets/sanguosha-arena.png"><img src="docs/assets/sanguosha-arena.png" alt="Sanguosha: green and gold table, five players with generals and hands, and action history" width="100%" /></a>
      <p>Manage cards, infer allegiances and coordinate attacks under hidden roles. Configurable roles, basic generals and public chat provide a setting for studying alliance inference, resource allocation and experience reuse. Two-player games use a simplified Lord-versus-Rebel setup.</p>
      <p><a href="docs/RULES.md">Implemented rules and generals (Chinese) →</a></p>
    </td>
    <td width="50%" valign="top">
      <h3>Werewolf · 狼人杀</h3>
      <p><strong>6–12 players · English / Chinese · Social deduction</strong></p>
      <a href="docs/assets/werewolf-arena.en.png"><img src="docs/assets/werewolf-arena.en.png" alt="Werewolf in English: midnight-blue role table, day/night phase, living players and event history" width="100%" /></a>
      <p>A fixed roster of wolves, a seer, a witch, a hunter and villagers progresses through night actions, daytime discussion, exile voting and victory checks. Private wolf-team discussion provides a setting for studying deception detection, trust and cooperation.</p>
      <p><a href="docs/games/werewolf.en.md">English rules</a> · <a href="docs/games/werewolf.md">中文规则</a></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Chess · 国际象棋</h3>
      <p><strong>2 players · English / Chinese · Perfect information</strong></p>
      <a href="docs/assets/chess-arena.en.png"><img src="docs/assets/chess-arena.en.png" alt="Chess in English: neutral gray room, black-and-white board, last move and event history" width="100%" /></a>
      <p>Standard moves include castling, en passant and promotion, with checkmate, draw offers and repetition-based draw rules. Players can speak with each move, providing a setting for studying position evaluation, long-term planning and lessons from game reviews.</p>
      <p><a href="docs/games/chess.en.md">English rules and implementation boundaries</a> · <a href="docs/games/chess.md">中文规则</a></p>
    </td>
    <td width="50%" valign="top">
      <h3>Xiangqi · 中国象棋</h3>
      <p><strong>2 players · Chinese · Perfect information</strong></p>
      <a href="docs/assets/xiangqi-arena.png"><img src="docs/assets/xiangqi-arena.png" alt="Xiangqi: paper and vermilion theme, river board and move history" width="100%" /></a>
      <p>Coordinate pieces and protect the general using standard moves, checkmate, stalemate losses and perpetual-check adjudication. Both players can speak with each move. The current laboratory rules omit complex tournament chasing adjudication.</p>
      <p><a href="docs/games/xiangqi.md">Moves and laboratory rules (Chinese) →</a></p>
    </td>
  </tr>
</table>

For Werewolf and Chess, language selection covers **game interfaces, rules and agent decision / communication / RSI prompts** when creating a match. The shared lobby, player library and some administration controls remain Chinese. Sanguosha and Xiangqi are currently Chinese-only.

Screenshots show the current application running isolated local policy demonstrations, with positions produced by the rules engines. They are interface examples, not model evaluation results. [Screenshot sources and reproduction](docs/MEDIA.md) · [Game catalog](docs/games/README.md) · [Navigation and spectating](docs/ARENA_UI.md)

<a id="quick-start"></a>

## Quick start

Install **Node.js ≥ 22.13**:

```bash
git clone https://github.com/Liuziyu77/Strategy-RSI.git
cd Strategy-RSI
npm ci
npm run dev
```

Open [http://localhost:3930](http://localhost:3930), choose any game and click **运行本地演示 (Run local demo)** to watch local policy agents play without an API key. If a project-local Node runtime is already available, use `./run.sh dev`.

All four games use the same model setup flow:

1. **Create players** in **玩家库 (Player Library)** with names, model connections and RSI modes.
2. **Choose a game and create a match** with a supported language, players, number of games, concurrency and chat settings.
3. **Observe and review** live actions, visible conversations, replays and personal experience; later matches of the same game type can reuse that experience.

Model services must support `POST /v1/chat/completions`. Configure individual connections in the player library or a shared service through [.env.example](.env.example). [Detailed setup and model integration guide →](docs/GETTING_STARTED.md)

<details>
<summary><strong>Production use and data storage</strong></summary>

```bash
npm run build
npm start
```

Data is stored in `data/arena.sqlite` by default. After a restart, unfinished matches return paused and can resume from their checkpoints. Configuration includes `DATA_DIR`, `PORT`, `HOST` and `ARENA_ADMIN_TOKEN`; use one server process per data directory. See [migration instructions](docs/MIGRATION.md) for backups and upgrades.

</details>

<a id="features"></a>

## Shared platform features

| Capability                              | How it works                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Multiple models and external agents** | Configure each player's model, connection and RSI independently, or use local policies and external agents over HTTP.                                                                      |
| **Rule-aware communication**            | Sanguosha and both chess games support optional public speech; Werewolf separates public daytime discussion from private wolf-team chat. Visibility applies to both decisions and reviews. |
| **Persistent experience**               | Manage reflections, reviews, manual entries and summaries together. Memory is scoped by **Agent ID × game type**; Chinese and English variants of the same game share it.                  |
| **Concurrent experiments**              | Each match can contain multiple games with configurable concurrency; progress, outcomes and call records are stored separately for each game.                                              |
| **Spectating and replays**              | Separate themes, spectator perspectives, board flipping, frame-by-frame replay and view restoration when switching games.                                                                  |
| **Tracing and analysis**                | Per-match win rates, durations and round counts, model call / retry / fallback records, and JSON / JSONL exports.                                                                          |

**How does a model see the board?** Its input is structured JSON text: the player's visible state, board or hand, legal actions, visible history and conversation, and personal experience. It returns an action ID and optional speech for the rules engine to validate and execute. Screenshots are for spectators and are not inputs to the current model protocol. [Input formats and API examples →](docs/API.md)

<a id="experience-loop"></a>

## RSI: from play to the next decision

<img src="docs/assets/experience-loop.svg" alt="Visible state, history, communication and personal memory inform decisions; action reflection and post-game review record experience for consolidation and later reuse" width="100%" />

| Mode                 | When experience is generated                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| **Immediate RSI**    | After an action involving a choice, assess and record reusable lessons.                                 |
| **Post-game RSI**    | Review the completed game; store reviews separately from immediate reflections.                         |
| **Both modes**       | Enable action reflection and post-game review together.                                                 |
| **New RSI disabled** | Stop generating reflections while still reading existing experience, for evaluation with frozen memory. |

Experience is organized by player, match, source game and type. The player's current model consolidates and deduplicates it. Later decisions prioritize the latest valid summary and add uncovered entries; originals and historical versions remain available. Experience collected by the same agent in concurrent games can inform its later decisions within that game type.

Current RSI uses **text reflection, persistent memory and context updates**, without training model weights. To evaluate learning, distinguish an empty-memory baseline, frozen experience and ongoing RSI while controlling opponents, seats, seeds and call failures. [Experiment design and available reports →](exp/README.md)

<a id="architecture"></a>

## Architecture and extension

Game plugins own **rules, visible information, legal actions, outcomes and state restoration**. Shared services handle **model calls, communication, RSI, memory, scheduling and persistence**. Add an environment through the common `GamePlugin` contract, then register its metadata and frontend view.

```text
web/          Game lobby, separate rooms, player library and replays
server/       Models, communication, RSI, consolidation, scheduling and SQLite
src/games/    Common contracts, catalog, registry and new game engines
src/          Sanguosha engine and shared protocol types
tests/        Game rules, server integration and browser validation
exp/          Experiment reports, data and figures organized by game
```

[Multi-game architecture](docs/MULTIGAME_ARCHITECTURE.md) · [Runtime details](docs/ARCHITECTURE.md) · [Adding a game](docs/EXTENDING_GAMES.md)

<a id="experiments"></a>
<a id="demos"></a>

## Experiments and research progress

All four environments are integrated. **The currently published model study is the Sanguosha four-model baseline**: 528 scheduled games, 489 completed normally and 39 failed, with RSI disabled. It measures performance without experience; baseline or controlled RSI reports have not yet been published for the other three games.

<details>
<summary><strong>Explore the Sanguosha results: four models, six figures and key findings</strong></summary>

### Experiment overview

Results were compiled on **September 14, 2026**. DeepSeek, GLM, Kimi and Qwen all use Guan Yu and empty memory, with **RSI off and public chat on**. Duels mirror roles and seats; four-player identity games cover every seat permutation. **233 / 240** duels and **256 / 288** four-player games completed normally. Full API model labels, settings and statistical methods are in the [experiment report](exp/sanguosha/README.en.md).

| Model    | Four-player wins / normal participations | Four-player win rate |
| -------- | ---------------------------------------: | -------------------: |
| DeepSeek |                                158 / 256 |            **61.7%** |
| GLM      |                                 74 / 256 |                28.9% |
| Kimi     |                                 86 / 256 |                33.6% |
| Qwen     |                                 78 / 256 |                30.5% |

Win rates include only normally completed games. Identity games use team outcomes, so multiple players can win together. DeepSeek's four-player differences from all three opponents remain supported after correcting for multiple comparisons; the other three cannot be reliably ranked against one another.

### Results and figures

All six figures use the same dimensions. Click a figure to view the original.

<table>
  <tr>
    <td width="50%" valign="top">
      <h4>Win rate</h4>
      <a href="exp/sanguosha/assets/win-rate.svg"><img src="exp/sanguosha/assets/win-rate.svg" alt="Duel and four-player identity win rates for all four models, with 95% seed-block confidence intervals" width="100%" /></a>
      <p>Duels and four-player identity games are measured separately. Error bars show 95% seed-block confidence intervals.</p>
    </td>
    <td width="50%" valign="top">
      <h4>Head-to-head</h4>
      <a href="exp/sanguosha/assets/head-to-head.svg"><img src="exp/sanguosha/assets/head-to-head.svg" alt="Pairwise duel matrix showing win rates and win counts" width="100%" /></a>
      <p>DeepSeek finishes <strong>20 : 19</strong> against GLM and <strong>28 : 12</strong> against Kimi; performance varies with the opponent.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>Role win rate</h4>
      <a href="exp/sanguosha/assets/role-win-rate.svg"><img src="exp/sanguosha/assets/role-win-rate.svg" alt="Each model's win rates and sample sizes as Lord, Loyalist, Rebel and Renegade" width="100%" /></a>
      <p>DeepSeek has the highest point estimate in all four roles. Equal role weighting leaves its win rate at <strong>61.6%</strong>.</p>
    </td>
    <td width="50%" valign="top">
      <h4>Game duration</h4>
      <a href="exp/sanguosha/assets/game-duration.svg"><img src="exp/sanguosha/assets/game-duration.svg" alt="Duel and four-player duration distributions, medians and percentile intervals" width="100%" /></a>
      <p>Median duration is <strong>12.1 minutes</strong> for duels and <strong>36.2 minutes</strong> for four-player games, including queues and retries but excluding documented account-recovery waits.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>Token use</h4>
      <a href="exp/sanguosha/assets/token-use.svg"><img src="exp/sanguosha/assets/token-use.svg" alt="API-reported input and output token totals for each model in the formal experiment" width="100%" /></a>
      <p>The experiment reports <strong>428.5M tokens</strong>, with input accounting for <strong>94.1%</strong>. Totals include reported retry usage; providers use different accounting methods.</p>
    </td>
    <td width="50%" valign="top">
      <h4>Chat frequency</h4>
      <a href="exp/sanguosha/assets/chat-frequency.svg"><img src="exp/sanguosha/assets/chat-frequency.svg" alt="Share of model decisions containing public speech, separately for duels and four-player games" width="100%" /></a>
      <p>In four-player games, GLM speaks in <strong>96.6%</strong> of decisions versus DeepSeek's <strong>82.3%</strong>. More frequent speech does not coincide with more wins here.</p>
    </td>
  </tr>
</table>

This study measures performance without experience and **has not tested RSI benefits or the causal effect of chat**. Findings apply to the tested model labels, generals, rules, prompts and sampled seeds. See the [full analysis](exp/sanguosha/README.en.md#interpreting-the-findings) for failure handling, statistical intervals and limits.

[Summary data](exp/sanguosha/results.json) · [Duel actions and chat](exp/sanguosha/games-history-duel.json) · [Four-player actions and chat](exp/sanguosha/games-history-identity.json) · [Figure reproduction](exp/sanguosha/README.en.md#data-and-reproduction)

</details>

[Experiment index and design notes](exp/README.md) · [Full Sanguosha report and six figures](exp/sanguosha/README.en.md) · [Data and reproduction](exp/sanguosha/README.en.md#data-and-reproduction) · [Archived demos and videos](docs/MEDIA.md#sanguosha-demos)

<a id="documentation"></a>

## Documentation

| Goal                                           | Start here                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Find guides, terminology and language coverage | [Documentation index](docs/README.md)                                               |
| Run the app, configure models and matches      | [Setup](docs/GETTING_STARTED.md) · [HTTP API](docs/API.md)                          |
| Learn the games and spectator controls         | [Game catalog](docs/games/README.md) · [Arena guide](docs/ARENA_UI.md)              |
| Add games and maintain themes                  | [Extension guide](docs/EXTENDING_GAMES.md) · [Visual design](docs/VISUAL_DESIGN.md) |
| Upgrade stored data and review limitations     | [Migration](docs/MIGRATION.md) · [Dated quality review](docs/QUALITY_REVIEW.md)     |
| Reproduce studies or refresh media             | [Experiment index](exp/README.md) · [Screenshots and recordings](docs/MEDIA.md)     |

Werewolf and Chess rules, the extension guide and Sanguosha experiment report have English versions; the game catalog, experiment index and architecture include English guidance. Setup and shared administration documentation are primarily Chinese.

<details>
<summary><strong>Development and validation</strong></summary>

```bash
npm run typecheck
npm test
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Rules and integration tests cover gameplay, information isolation, model protocols, recovery, RSI and consolidation; browser tests cover desktop and mobile interactions. Routine tests use temporary data and local mock models. Refresh README screenshots with `npm run build && npm run docs:previews`; see the [media guide](docs/MEDIA.md).

</details>

<a id="news"></a>

<details>
<summary><strong>Release notes</strong></summary>

- **2026.09.16** — Expanded to four games with Werewolf, Chess and Xiangqi, a dedicated lobby, separate themes and game-scoped memory.
- **2026.09.14** — Published the Sanguosha four-model baseline, summary data, six figures and reproduction scripts.
- **2026.09.11** — Initial release with Sanguosha spectating, a player library, concurrent games, communication and RSI.

</details>

<a id="todo-list"></a>

<details>
<summary><strong>Next directions</strong></summary>

- Improve experience generation, selection, consolidation and feedback so lessons can be revised over time.
- Expand game content, including additional Sanguosha general profiles, skill descriptions and corresponding rules.

</details>

## License and acknowledgments

Licensed under [Apache License 2.0](LICENSE). The Sanguosha environment draws on the basic functionality and rules design of [wmzy/sanguosha](https://github.com/wmzy/sanguosha), with a reimplemented state machine, server protocol and frontend, without its images, sound effects or general artwork. Chess uses `chess.js` for move validation. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source and license notes.

<p align="center"><sub>Strategy-RSI · Play. Observe. Reflect.</sub><br /><a href="#strategy-rsi">Back to top ↑</a></p>
