# Adding a game / 新游戏接入指南

[Documentation index](README.md) · [Architecture](MULTIGAME_ARCHITECTURE.md) · [Game catalog](games/README.md)

To add a game, implement its engine and player observations, register it, and add a frontend view. The existing runtime handles model calls, communication, RSI and storage.

## Engine contract

Implement `GamePlugin` and `GameEngine` from `src/games/core.ts`. `BaseEngine` provides revision validation, normalized chat, visibility filtering and event emission for new plugins. The Sanguosha plugin adapts the original engine without changing old serialized states.

An engine must provide:

- JSON-only state extending `ArenaState`, with a plugin-specific state version, game discriminator, locale, participants, counters and a terminal `outcome` (`winners` Agent IDs and `draw`). Never store model clients or callbacks in state.
- `legalActions` / `resolveAction`: authoritative actions for the current actor. Validation must precede any mutation or speech.
- `apply`: deterministic rule execution. Random games serialize RNG state. Terminal outcomes must include all winning teammates, even if eliminated.
- `view(seat)` and `visibleHistory(seat)`: matching privacy boundaries. `view(-1)` is the experimenter view. Do not expose hidden state through pending actors, action labels, event data or unfiltered history.
- `start`, `finish`, `p`, `actor`, `pending`, and the `onEvent` callback. `ready` events represent stable action boundaries; the scheduler saves a resumable checkpoint after each accepted action.
- `requiresDecision` for single-action discussion windows. Otherwise the runtime automatically executes forced choices.
- `rules(locale)` and an observation-only local heuristic. Neither may read other players’ memory or hidden engine state.

`BaseEngine.speechAudience()` returns `undefined` for public, a seat list for private team speech, or `null` for silence. Private events use `visibleTo`; public chat pagination excludes them. Reflection consumes the same filtered history as decisions.

## Registration and UI

1. Add the game ID to the `GameType` union, metadata in `catalog.ts`, and a factory/restore adapter in `registry.ts`.
2. Extend configuration and memory-scope validation enums in `server/config.ts` and `server/app.ts` (search for the existing game IDs). Declare valid player counts, languages and a rules version; unsupported values must fail before creating a match.
3. Add a renderer in `web/GameBoards.tsx`, presentation metadata in `web/game-presentation.ts` and a symbol in `web/GameSymbols.tsx`. Define the new game’s page tokens and visual treatment in `web/themes.css`; see [visual design](VISUAL_DESIGN.md). Configure creation in `web/MultiGameArena.tsx`, or supply a dedicated renderer module. The lobby in `web/GameLobby.tsx` lists catalog entries automatically; no header button is needed. Reuse `web/navigation.ts` to preserve per-game observation state. Do not put rules, model requests or hidden-state reconstruction in React.
4. Add localized rules under `docs/games/`, update the documentation index, game catalog, API guide and both project READMEs. Update the UI guide and preview sources if navigation or rendering changes.

The shared runtime handles concurrent matches, game workers, external-token actions, cancellation, transaction rollback, replay and consolidation. Reuse these services when registering the plugin.

## Persistence and compatibility

Existing records with no `gameType` retain Sanguosha semantics. Existing game checkpoints remain untouched. Generic game outcomes and explicit manual-memory scopes use additional tables, avoiding destructive rewrites. Game-generated memory derives its scope from the source match; consolidation also inherits the source match’s language.

All current state formats use version 1. `restoreEngine` in `src/games/registry.ts` rejects other versions before calling the plugin, so a state-format change must update both this check and the plugin's restore adapter. Add explicit migrations for old archives and reject unsupported versions.

The match configuration also records `rulesVersion`. This identifies the experimental ruleset separately from the state format; it does not select a historical engine implementation.

## Required tests

Engine tests should cover legal and illegal moves, terminal cases, private observations and history, seeded reproducibility, and rejection of stale revisions without publishing speech. Check that JSON and SQLite round trips preserve both state and history.

Integration tests should cover game-scoped memory, model and external actions, chat, both RSI modes, consolidation, pause/restart and transaction rollback. Browser tests should cover creation, board display, language, replay, chat, memory and narrow viewports. Use mocked model endpoints for CI; real API keys are not required.

```bash
./run.sh typecheck
./run.sh test
./run.sh build
./run.sh format:check
CHROMIUM_PATH=/path/to/chrome ./run.sh test:e2e
```

Browser tests accept `E2E_PORT` to avoid local port conflicts and `CHROMIUM_PATH` to reuse an installed browser. Optional remote fonts are blocked by test fixtures so UI tests also work offline. If HTTP proxy environment variables route localhost requests externally, exempt loopback hosts with `NO_PROXY` / `no_proxy`, or unset the proxy variables for the test command.
