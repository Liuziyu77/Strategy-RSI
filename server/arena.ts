import { EventEmitter } from 'node:events';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { GameEngine } from '../src/games/core';
import { gamePlugin, restoreEngine } from '../src/games/registry';
import { GAME_CATALOG } from '../src/games/catalog';
import type { AgentConfig, MatchConfig, Decision } from '../src/types';
import {
  agentInput,
  callModel,
  DecisionSchema,
  decisionMessages,
  heuristic,
  ReflectionSchema,
  reflectionMessages,
  ModelOutputError,
} from './agents';
import { AgentSchema, MatchSchema, safeError, type AppConfig } from './config';
import { z } from 'zod';
import { Store } from './store';
import { Consolidator } from './consolidation';
import { normalizeSpeech } from '../src/chat';

export class Arena extends EventEmitter {
  engines = new Map<string, GameEngine>();
  workers = new Map<string, Promise<void>>();
  controllers = new Map<string, AbortController>();
  thinking = new Map<string, { seat: number; kind: string; startedAt: string }>();
  gameWorkers = new Map<string, Promise<void>>();
  gameControllers = new Map<string, AbortController>();
  waiters = new Map<string, () => void>();
  closed = false;
  consolidator: Consolidator;
  constructor(
    public store: Store,
    public config: AppConfig,
  ) {
    super();
    this.consolidator = new Consolidator(
      store,
      (id) => this.provider(id),
      () => this.signal('players'),
    );
  }
  signal(matchId: string) {
    this.emit('change', matchId);
  }
  create(input: unknown) {
    if (input && typeof input === 'object' && 'playerIds' in input) {
      const ids = z.array(z.string()).min(2).max(12).parse(input.playerIds);
      input = {
        ...input,
        agents: ids.map((id) => {
          const profile = this.store.player(id);
          if (!profile) throw new Error(`玩家不存在：${id}`);
          return AgentSchema.parse(profile);
        }),
      };
    }
    const parsed = MatchSchema.parse(input);
    const config = { ...parsed, rulesVersion: GAME_CATALOG[parsed.gameType].rulesVersion };
    for (const a of config.agents) {
      if (a.kind === 'llm' || a.rsi !== 'off') {
        const provider = this.provider(a.provider);
        if (!provider?.apiKey) throw new Error(`${a.name} 的 API 未配置`);
        if (!provider.models.includes(a.model)) throw new Error(`${a.name} 的模型不在已配置列表中`);
      }
    }
    const id = randomUUID();
    const engine = this.buildGame(config, 1);
    const agentTokens: Record<string, string> = {};
    this.store.transaction(() => {
      this.store.createMatch(id, config);
      for (const a of config.agents.filter((a) => a.kind === 'external')) {
        const token = randomBytes(24).toString('hex');
        this.store.setToken(id, a.id, token);
        agentTokens[a.id] = token;
      }
      this.initializeGame(engine, id, 1);
    });
    this.attach(engine, id);
    if (config.autoStart) this.resume(id);
    this.signal(id);
    return { ...this.store.match(id), agentTokens };
  }
  provider(id: string) {
    return this.config.providers.find((p) => p.id === id) ?? this.store.playerProvider(id);
  }
  newGame(matchId: string, config: MatchConfig, number: number) {
    const engine = this.buildGame(config, number);
    this.store.transaction(() => this.initializeGame(engine, matchId, number));
    this.attach(engine, matchId);
    this.signal(matchId);
    return engine;
  }
  private buildGame(config: MatchConfig, number: number) {
    const agents = [...config.agents];
    if (config.rotateSeats) {
      const offset = (number - 1) % agents.length;
      agents.push(...agents.splice(0, offset));
    }
    const roles =
      config.roleAssignments && (config.roleMode === 'fixed' || number === 1)
        ? agents.map((a) => config.roleAssignments![a.id])
        : undefined;
    return gamePlugin(config.gameType ?? 'sanguosha').create(
      randomUUID(),
      agents,
      config.seed + number - 1,
      config.locale ?? 'zh',
      roles,
    );
  }
  /** Called inside the caller's transaction; publish/cache only after commit. */
  private initializeGame(engine: GameEngine, matchId: string, number: number) {
    this.store.createGame(engine.s.id, matchId, number, engine.s);
    engine.onEvent = (event, state) => this.store.event(state.id, event, state);
    engine.start();
    this.store.checkpoint(engine.s);
  }
  attach(engine: GameEngine, matchId: string) {
    engine.onEvent = (event, state) => {
      this.store.event(state.id, event, state);
      this.signal(matchId);
    };
    this.engines.set(engine.s.id, engine);
  }
  engine(gameId: string) {
    let engine = this.engines.get(gameId);
    if (!engine) {
      const g = this.store.game(gameId);
      if (!g) throw new Error('对局不存在');
      engine = restoreEngine(g.state);
      engine.events = this.store.allEvents(gameId);
      this.attach(engine, g.matchId);
    }
    return engine;
  }
  current(matchId: string) {
    const games = this.store.games(matchId);
    return games.at(-1);
  }
  snapshot(gameId: string, seq?: number, viewer = -1) {
    const game = this.store.game(gameId);
    if (!game) throw new Error('对局不存在');
    const engine =
      seq === undefined
        ? this.engine(gameId)
        : restoreEngine(
            this.store.frame(gameId, seq) ??
              (() => {
                throw new Error('回放帧不存在');
              })(),
          );
    if (viewer !== -1 && !engine.p(viewer)) throw new Error('座位不存在');
    const { state, ...meta } = game;
    const view = engine.view(viewer);
    return {
      ...meta,
      view,
      decisionCount: this.store.decisionCount(gameId, seq),
      thinking:
        seq === undefined && (viewer === -1 || view.active >= 0)
          ? (this.thinking.get(gameId) ?? null)
          : null,
    };
  }
  context(gameId: string, seat: number) {
    const engine = this.engine(gameId),
      game = this.store.game(gameId),
      match = this.store.match(game.matchId);
    if (!engine.p(seat)) throw new Error('座位不存在');
    return agentInput(
      engine.view(seat),
      engine.visibleHistory(seat),
      this.store.activeMemory(engine.p(seat).agentId, match.config.gameType ?? 'sanguosha'),
      match.config,
    );
  }
  resume(id: string) {
    const match = this.store.match(id);
    if (!match) throw new Error('比赛不存在');
    if (['finished', 'stopped'].includes(match.status)) throw new Error('比赛已经结束');
    for (const game of this.store.gameRuns(id))
      if (game.runStatus === 'error') this.store.setGameStatus(game.id, 'paused');
    this.store.setStatus(id, 'running');
    this.signal(id);
    this.kick(id);
  }
  wake(id: string) {
    this.waiters.get(id)?.();
    this.waiters.delete(id);
  }
  kick(id: string) {
    if (this.workers.has(id) || this.closed) {
      this.wake(id);
      return;
    }
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const job = Promise.resolve()
      .then(() => this.run(id, controller.signal))
      .catch(async (error) => {
        if (!controller.signal.aborted) {
          controller.abort();
          for (const game of this.store.gameRuns(id)) this.gameControllers.get(game.id)?.abort();
          await Promise.allSettled(
            this.store.gameRuns(id).flatMap((g) => this.gameWorkers.get(g.id) ?? []),
          );
          this.store.setStatus(id, 'error', safeError(error));
        }
      })
      .finally(() => {
        this.workers.delete(id);
        this.controllers.delete(id);
        this.waiters.delete(id);
        this.signal(id);
        if (!this.closed && this.store.match(id)?.status === 'running') this.kick(id);
      });
    this.workers.set(id, job);
  }
  async pause(id: string) {
    const match = this.store.match(id);
    if (!match) throw new Error('比赛不存在');
    if (['finished', 'stopped'].includes(match.status)) return;
    this.store.setStatus(id, 'paused');
    this.controllers.get(id)?.abort();
    for (const game of this.store.gameRuns(id)) this.gameControllers.get(game.id)?.abort();
    this.wake(id);
    await this.workers.get(id);
    await Promise.allSettled(
      this.store.gameRuns(id).flatMap((g) => this.gameWorkers.get(g.id) ?? []),
    );
    for (const game of this.store.gameRuns(id))
      if (['running', 'waiting', 'reflecting'].includes(game.runStatus))
        this.store.setGameStatus(game.id, 'paused');
    this.signal(id);
  }
  async stop(id: string) {
    if (this.store.match(id)?.status === 'finished') return;
    await this.pause(id);
    this.store.setStatus(id, 'stopped');
    for (const game of this.store.gameRuns(id))
      if (game.runStatus !== 'finished') this.store.setGameStatus(game.id, 'stopped');
    this.signal(id);
  }
  startGameJob(
    matchId: string,
    gameId: string,
    work: (signal: AbortSignal) => Promise<void>,
    parent?: AbortSignal,
  ) {
    if (this.gameWorkers.has(gameId)) throw new Error('本局正在处理，请重试');
    const controller = new AbortController();
    this.gameControllers.set(gameId, controller);
    const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
    this.store.setGameStatus(gameId, 'running');
    const job = Promise.resolve()
      .then(() => work(signal))
      .finally(() => {
        this.gameWorkers.delete(gameId);
        this.gameControllers.delete(gameId);
        if (signal.aborted && !['finished', 'stopped'].includes(this.store.game(gameId)?.runStatus))
          this.store.setGameStatus(gameId, 'paused');
        this.wake(matchId);
        this.signal(matchId);
      });
    this.gameWorkers.set(gameId, job);
    return job;
  }
  finishMatchIfReady(id: string) {
    const games = this.store.gameRuns(id),
      config: MatchConfig = this.store.match(id).config;
    if (games.length === config.games && games.every((g) => g.runStatus === 'finished')) {
      this.store.setStatus(id, 'finished');
      return true;
    }
    return false;
  }
  async finishGame(matchId: string, engine: GameEngine, signal: AbortSignal) {
    this.store.setGameStatus(engine.s.id, 'reflecting');
    this.signal(matchId);
    await this.roundReflection(matchId, engine, signal);
    if (!signal.aborted) this.store.setGameStatus(engine.s.id, 'finished');
  }
  async step(id: string, gameId?: string) {
    const match = this.store.match(id);
    if (!match || ['finished', 'stopped'].includes(match.status))
      throw new Error('比赛已经结束或不存在');
    const game = gameId ? this.store.game(gameId) : this.current(id);
    if (!game || game.matchId !== id) throw new Error('对局不属于该对战');
    await this.pause(id);
    await this.startGameJob(id, game.id, async (signal) => {
      const engine = this.engine(game.id);
      await this.recoverImmediate(id, engine, signal);
      if (!signal.aborted && engine.s.status !== 'finished')
        await this.makeDecision(id, engine, signal);
      if (!signal.aborted && engine.s.status === 'finished')
        await this.finishGame(id, engine, signal);
      else if (!signal.aborted) this.store.setGameStatus(game.id, 'paused');
    });
    this.finishMatchIfReady(id);
    this.signal(id);
  }
  async runGame(id: string, gameId: string, signal: AbortSignal) {
    const engine = this.engine(gameId),
      config: MatchConfig = this.store.match(id).config;
    while (!signal.aborted && !this.closed) {
      await this.recoverImmediate(id, engine, signal);
      if (signal.aborted) return;
      if (engine.s.status === 'finished') {
        await this.finishGame(id, engine, signal);
        return;
      }
      if (!(await this.makeDecision(id, engine, signal))) return;
      if (signal.aborted) return;
      if (config.paceMs)
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', finish);
            resolve();
          };
          const timer = setTimeout(finish, config.paceMs);
          signal.addEventListener('abort', finish, { once: true });
        });
    }
  }
  async run(id: string, signal: AbortSignal) {
    try {
      while (!signal.aborted && !this.closed && this.store.match(id)?.status === 'running') {
        const config: MatchConfig = this.store.match(id).config;
        let games = this.store.gameRuns(id);
        let occupied = games.filter(
          (g) => this.gameWorkers.has(g.id) || g.runStatus === 'waiting',
        ).length;
        while (occupied < (config.concurrency ?? 1)) {
          let next = games.find((g) => !this.gameWorkers.has(g.id) && g.runStatus === 'paused');
          if (!next && games.length < config.games) {
            const engine = this.newGame(id, config, games.length + 1);
            next = { id: engine.s.id, number: games.length + 1, runStatus: 'paused' };
            games.push(next);
          }
          if (!next) break;
          const gameId = next.id;
          void this.startGameJob(
            id,
            gameId,
            async (childSignal) => {
              try {
                await this.runGame(id, gameId, childSignal);
              } catch (error) {
                if (!childSignal.aborted)
                  this.store.setGameStatus(gameId, 'error', safeError(error));
              }
            },
            signal,
          );
          occupied++;
        }
        games = this.store.gameRuns(id);
        if (!games.some((g) => this.gameWorkers.has(g.id))) {
          if (!this.finishMatchIfReady(id)) {
            if (games.some((g) => g.runStatus === 'error'))
              this.store.setStatus(id, 'error', '部分对局异常，可继续重试');
            else this.store.setStatus(id, 'waiting');
          }
          return;
        }
        await new Promise<void>((resolve) => this.waiters.set(id, resolve));
      }
    } catch (error) {
      for (const game of this.store.gameRuns(id)) this.gameControllers.get(game.id)?.abort();
      throw error;
    } finally {
      await Promise.allSettled(
        this.store.gameRuns(id).flatMap((g) => this.gameWorkers.get(g.id) ?? []),
      );
    }
  }
  async makeDecision(
    matchId: string,
    engine: GameEngine,
    signal: AbortSignal,
    external?: Decision & { revision: number },
  ) {
    const match = this.store.match(matchId),
      config: MatchConfig = match.config;
    if (engine.s.status === 'finished') return false;
    const count = this.store.decisionCount(engine.s.id);
    if (count >= config.maxDecisions) {
      try {
        this.store.transaction(() => {
          engine.finish(
            engine.s.locale === 'en' ? 'draw' : '平局',
            engine.s.locale === 'en' ? 'Decision limit reached' : '达到配置的决策上限',
          );
          this.store.checkpoint(engine.s);
        });
      } catch (error) {
        this.engines.delete(engine.s.id);
        throw error;
      }
      return true;
    }
    const seat = engine.actor,
      agent = config.agents.find((a) => a.id === engine.p(seat)?.agentId)!;
    if (!agent) throw new Error('当前座位未绑定 Agent');
    const input = this.context(engine.s.id, seat),
      actions = input.observation.legalActions;
    if (!actions.length) throw new Error(`无合法行动：${engine.pending?.type}`);
    const selection = actions[0].selectCards;
    const forced =
      !engine.requiresDecision &&
      actions.length === 1 &&
      (!selection || selection.count === selection.from.length);
    if (agent.kind === 'external' && !external && !forced) {
      this.store.setGameStatus(engine.s.id, 'waiting');
      this.signal(matchId);
      return false;
    }
    const revision = engine.s.revision;
    let decision: Decision,
      fallback: string | null = null,
      source: string = agent.kind,
      usage: unknown = null;
    if (external) {
      if (external.revision !== revision) throw new Error('过期决策');
      decision = external;
    } else if (forced) {
      decision = {
        actionId: actions[0].id,
        reason: '唯一合法行动，由系统执行',
        ...(selection ? { cardIds: selection.from } : {}),
      };
      source = 'forced';
    } else if (agent.kind === 'heuristic') decision = heuristic(input);
    else {
      this.thinking.set(engine.s.id, {
        seat,
        kind: 'decision',
        startedAt: new Date().toISOString(),
      });
      this.signal(matchId);
      let result: typeof decision | undefined;
      try {
        for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
          const messages = decisionMessages(input);
          if (attempt)
            messages.push({
              role: 'user',
              content:
                config.locale === 'en'
                  ? 'Invalid response. Choose an exact legalActions actionId and return valid JSON.'
                  : '上次响应无效。请仅选择本次 legalActions 中存在的 actionId；有 selectCards 时还须提供恰好 count 张不同可选手牌的 cardIds，返回正确 JSON。',
            });
          try {
            const output = await callModel(
              this.provider(agent.provider)!,
              agent.model,
              messages,
              config.apiTimeoutMs,
              signal,
              config.modelOutputLimit ?? 4096,
            );
            this.store.call(engine.s.id, agent.id, 'decision', {
              attempt,
              input: messages,
              ...output,
            });
            usage = output.usage;
            const parsed = DecisionSchema.parse(output.content);
            engine.resolveAction(parsed.actionId, parsed.cardIds);
            result = parsed;
            break;
          } catch (error) {
            if (signal.aborted) return false;
            fallback = safeError(error);
            this.store.call(engine.s.id, agent.id, 'decision-error', {
              attempt,
              error: fallback,
              ...(error instanceof ModelOutputError ? error.output : {}),
            });
          }
        }
        if (signal.aborted) return false;
        decision = result ?? heuristic(input);
        if (result) fallback = null;
      } finally {
        this.thinking.delete(engine.s.id);
        this.signal(matchId);
      }
    }
    if (signal.aborted) return false;
    decision = {
      ...decision,
      speech:
        config.chatEnabled === false || source === 'forced' || fallback
          ? ''
          : normalizeSpeech(decision.speech),
    };
    const chosen = engine.resolveAction(decision.actionId, decision.cardIds);
    // State, events, and accepted decision are one SQLite transaction.
    try {
      this.store.transaction(() => {
        engine.apply(decision.actionId, revision, decision.cardIds, decision.speech);
        this.store.decision(engine.s.id, seat, revision, {
          agentId: agent.id,
          model: agent.model,
          source,
          decision,
          action: chosen,
          fallback,
          usage,
          input,
          afterRevision: engine.s.revision,
          needsImmediateRsi:
            (agent.rsi === 'immediate' || agent.rsi === 'both') && source !== 'forced',
        });
        this.store.checkpoint(engine.s);
      });
    } catch (error) {
      this.engines.delete(engine.s.id);
      throw error;
    }
    if ((agent.rsi === 'immediate' || agent.rsi === 'both') && source !== 'forced') {
      await this.reflect(matchId, engine, agent, seat, 'immediate', signal, {
        ...decision,
        action: chosen,
      });
    }
    this.signal(matchId);
    return true;
  }
  async recoverImmediate(matchId: string, engine: GameEngine, signal: AbortSignal) {
    const last = this.store.decisions(engine.s.id, 1)[0];
    if (!last) return;
    const agent: AgentConfig = this.store
      .match(matchId)
      .config.agents.find((a: AgentConfig) => a.id === last.agentId);
    const needed =
      last.needsImmediateRsi ??
      ((agent.rsi === 'immediate' || agent.rsi === 'both') && last.source !== 'forced');
    if (!needed || (last.afterRevision !== undefined && last.afterRevision !== engine.s.revision))
      return;
    await this.reflect(matchId, engine, agent, last.seat, 'immediate', signal, {
      ...last.decision,
      action: last.action,
    });
  }
  async reflect(
    matchId: string,
    engine: GameEngine,
    agent: AgentConfig,
    seat: number,
    mode: 'immediate' | 'round',
    signal: AbortSignal,
    lastDecision?: unknown,
  ) {
    if (signal.aborted) return;
    const key = `${engine.s.id}:${agent.id}:${mode}:${mode === 'round' ? 'end' : engine.s.revision}`;
    if (this.store.marked(key)) return;
    this.thinking.set(engine.s.id, {
      seat,
      kind: `rsi-${mode}`,
      startedAt: new Date().toISOString(),
    });
    this.signal(matchId);
    try {
      const input = this.context(engine.s.id, seat),
        messages = reflectionMessages(input, mode, lastDecision),
        config: MatchConfig = this.store.match(matchId).config;
      const output = await callModel(
        this.provider(agent.provider)!,
        agent.model,
        messages,
        config.apiTimeoutMs,
        signal,
        config.modelOutputLimit ?? 4096,
      );
      const reflection = ReflectionSchema.parse(output.content);
      if (signal.aborted) return;
      this.store.transaction(() => {
        this.store.call(engine.s.id, agent.id, `rsi-${mode}`, {
          input: messages,
          ...output,
          reflection,
        });
        if (reflection.shouldRemember && reflection.memory.trim()) {
          const text = reflection.memory.trim();
          if (!this.store.hasMemory(agent.id, text, mode, engine.s.id))
            this.store.addMemory(agent.id, text, mode, engine.s.id);
        }
        this.store.mark(key);
      });
    } catch (error) {
      if (!signal.aborted) {
        this.store.call(engine.s.id, agent.id, `rsi-${mode}-error`, {
          error: safeError(error),
          ...(error instanceof ModelOutputError ? error.output : {}),
        });
        this.store.mark(key);
      }
    } finally {
      this.thinking.delete(engine.s.id);
      this.signal(matchId);
    }
  }
  async roundReflection(matchId: string, engine: GameEngine, signal: AbortSignal) {
    const config: MatchConfig = this.store.match(matchId).config;
    for (const p of engine.s.players) {
      const agent = config.agents.find((a) => a.id === p.agentId)!;
      if (agent.rsi === 'round' || agent.rsi === 'both')
        await this.reflect(matchId, engine, agent, p.seat, 'round', signal);
      if (signal.aborted) return;
    }
  }
  verifySeatToken(matchId: string, agentId: string, token: string) {
    const expected = this.store.token(matchId, agentId);
    return (
      !!expected &&
      Buffer.byteLength(token) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    );
  }
  async externalAction(gameId: string, agentId: string, action: Decision & { revision: number }) {
    const game = this.store.game(gameId);
    if (!game) throw new Error('对局不存在');
    const engine = this.engine(gameId),
      match = this.store.match(game.matchId);
    if (engine.p(engine.actor)?.agentId !== agentId) throw new Error('尚未轮到此 Agent');
    if (this.gameWorkers.has(gameId)) throw new Error('本局正在处理，请重试');
    if (
      !['paused', 'waiting', 'running'].includes(match.status) ||
      !['paused', 'waiting'].includes(game.runStatus)
    )
      throw new Error('当前状态不接受外部行动');
    const auto = match.status !== 'paused';
    if (auto) this.store.setStatus(match.id, 'running');
    try {
      await this.startGameJob(
        match.id,
        gameId,
        async (signal) => {
          try {
            await this.recoverImmediate(match.id, engine, signal);
            await this.makeDecision(match.id, engine, signal, action);
            if (!signal.aborted && engine.s.status === 'finished')
              await this.finishGame(match.id, engine, signal);
          } finally {
            if (this.store.game(gameId).runStatus === 'running')
              this.store.setGameStatus(gameId, 'paused');
          }
        },
        this.controllers.get(match.id)?.signal,
      );
    } finally {
      if (this.store.game(gameId).runStatus === 'running')
        this.store.setGameStatus(gameId, 'paused');
      if (auto && ['running', 'waiting'].includes(this.store.match(match.id).status)) {
        this.store.setStatus(match.id, 'running');
        this.kick(match.id);
      }
      this.signal(match.id);
    }
  }
  async close() {
    this.closed = true;
    for (const match of this.store.matches())
      if (!['finished', 'stopped'].includes(match.status)) await this.pause(match.id);
    await this.consolidator.close();
    this.store.close();
  }
}
