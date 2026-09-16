import React, { useEffect, useRef, useState } from 'react';
import { GAME_CATALOG } from '../src/games/catalog';
import type { ArenaObservation, GameType, Locale } from '../src/games/core';
import type { GameEvent, Memory, PlayerRecord } from '../src/types';
import { api, post, Icon } from './ui';
import { GameBoard } from './GameBoards';
import { GameSymbol } from './GameSymbols';
import { gamePresentation } from './game-presentation';
import { useWorkspaceView } from './navigation';
import './multigame.css';

type Match = {
  id: string;
  status: string;
  config: {
    name: string;
    gameType: GameType;
    locale: Locale;
    games: number;
    agents: { id: string; name: string; rsi: string }[];
  };
  games: {
    id: string;
    number: number;
    revision: number;
    runStatus: string;
    winner: string | null;
  }[];
};
export function MultiGameArena({
  players,
  onManage,
  gameType,
  createRequest,
  onCreateHandled,
}: {
  players: PlayerRecord[];
  onManage: () => void;
  gameType: GameType;
  createRequest: number;
  onCreateHandled: () => void;
}) {
  const [viewState, updateView] = useWorkspaceView(gameType);
  const { matchId, gameId, seq, viewer } = viewState;
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      return gameType !== 'xiangqi' && localStorage.getItem(`arena:language:${gameType}`) === 'en'
        ? 'en'
        : 'zh';
    } catch {
      return 'zh';
    }
  });
  const [matches, setMatches] = useState<Match[]>([]),
    [loaded, setLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    view: ArenaObservation;
    requestedSeq: number | null;
    thinking?: { seat: number; kind: string };
    decisionCount: number;
  } | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]),
    [messages, setMessages] = useState<{ seq: number; name: string; text: string }[]>([]);
  const [count, setCount] = useState(6),
    [games, setGames] = useState(1),
    [concurrency, setConcurrency] = useState(1),
    [seed, setSeed] = useState(42);
  const [ids, setIds] = useState<string[]>([]),
    [chat, setChat] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [rules, setRules] = useState(''),
    [memories, setMemories] = useState<Memory[]>([]),
    [jobs, setJobs] = useState<any[]>([]);
  const [memoryPlayer, setMemoryPlayer] = useState(''),
    [memoryText, setMemoryText] = useState(''),
    [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false),
    [panel, setPanel] = useState<'chat' | 'events' | 'memory'>('chat');
  const dialog = useRef<HTMLDialogElement>(null),
    createEpoch = useRef(0);
  const match = matches.find((m) => m.id === matchId),
    game = match?.games.find((g) => g.id === gameId);
  const language = match?.config.locale ?? locale,
    en = language === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const displayGame = gameType,
    presentation = gamePresentation[gameType];
  const stateLabel = (s: string) =>
    en
      ? s
      : ((
          {
            running: '运行中',
            paused: '已暂停',
            waiting: '等待 Agent',
            reflecting: '赛后反思',
            finished: '已完成',
            stopped: '已停止',
            error: '异常',
          } as Record<string, string>
        )[s] ?? s);
  const resultLabel = (s: string | null) =>
    !s
      ? '—'
      : ((
          {
            draw: ['平局', 'Draw'],
            wolves: ['狼人', 'Wolves'],
            village: ['好人', 'Village'],
            white: ['白方', 'White'],
            black: ['黑方', 'Black'],
            平局: ['平局', 'Draw'],
          } as Record<string, string[]>
        )[s]?.[en ? 1 : 0] ?? s);
  const chooseMatch = (id: string) => {
    updateView(
      {
        matchId: id,
        gameId: matches.find((m) => m.id === id)?.games[0]?.id ?? '',
        seq: null,
        viewer: -1,
      },
      true,
    );
    setMemoryPlayer('');
    setMemoryText('');
    setSnapshot(null);
  };
  const chooseGame = (id: string) => {
    updateView({ gameId: id, seq: null, viewer: -1 }, true);
    setSnapshot(null);
  };
  useEffect(() => {
    // Browser history and direct links also change matches, bypassing chooseMatch.
    setMemoryPlayer('');
    setMemoryText('');
    setMemories([]);
    setJobs([]);
  }, [matchId]);
  useEffect(() => {
    if (createRequest) {
      setCreating(true);
      onCreateHandled();
    }
  }, [createRequest]);
  useEffect(() => {
    if (creating) dialog.current?.showModal();
    else dialog.current?.close();
  }, [creating]);
  useEffect(() => {
    try {
      localStorage.setItem(`arena:language:${gameType}`, locale);
    } catch {
      /* Storage optional. */
    }
  }, [locale, gameType]);
  useEffect(() => {
    let cancelled = false,
      loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      const epoch = createEpoch.current;
      try {
        const data: Match[] = await api('/matches'),
          list = data.filter((m) => m.config.gameType === gameType);
        if (!cancelled && epoch === createEpoch.current) {
          setMatches(list);
          setLoaded(true);
          updateView((v) => {
            if (v.matchId && list.some((m) => m.id === v.matchId)) return {};
            const recent = list.find((m) => ['running', 'waiting'].includes(m.status)) ?? list[0];
            return {
              matchId: recent?.id ?? '',
              gameId: recent?.games[0]?.id ?? '',
              seq: null,
              viewer: -1,
            };
          });
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gameType, updateView]);
  useEffect(() => {
    if (match && !match.games.some((g) => g.id === gameId))
      updateView({ gameId: match.games[0]?.id ?? '', seq: null, viewer: -1 });
  }, [matchId, match?.games.length, gameId, updateView]);
  useEffect(() => {
    if (!game || !match) return;
    if (viewer >= match.config.agents.length) updateView({ viewer: -1 });
    if (seq !== null && seq > Math.max(1, game.revision))
      updateView({ seq: Math.max(1, game.revision) });
  }, [game?.id, game?.revision, viewer, seq, match?.config.agents.length, updateView]);
  useEffect(() => {
    setSnapshot(null);
    setEvents([]);
    setMessages([]);
    if (!gameId || !match?.games.some((g) => g.id === gameId)) return;
    let cancelled = false,
      loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const suffix = seq === null ? '' : `&seq=${seq}`;
        const [snap, history, chatData] = await Promise.all([
          api(`/games/${gameId}?viewer=${viewer}${suffix}`),
          api(`/games/${gameId}/events?tail=200${seq === null ? '' : `&before=${seq}`}`),
          api(`/games/${gameId}/chat?limit=100${seq === null ? '' : `&before=${seq}`}`),
        ]);
        if (!cancelled) {
          setSnapshot({ ...snap, requestedSeq: seq });
          setEvents(history.filter((e: GameEvent) => e.seq <= snap.view.revision));
          setMessages(
            chatData.messages.filter((e: { seq: number }) => e.seq <= snap.view.revision),
          );
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(load, seq === null ? 1000 : 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gameId, seq, viewer, !!game]);
  useEffect(() => {
    let cancelled = false;
    api(`/game-types/${displayGame}/rules?locale=${language}`)
      .then((data) => {
        if (!cancelled) setRules(data.rules);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [displayGame, language]);
  useEffect(() => {
    let cancelled = false;
    setMemories([]);
    setJobs([]);
    if (!memoryPlayer) return;
    const load = async () => {
      try {
        const p = await api(`/players/${memoryPlayer}`);
        if (!cancelled) {
          setMemories(p.memories.filter((m: Memory) => m.gameType === displayGame));
          setJobs(p.consolidations.filter((j: any) => j.matchId === matchId));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [memoryPlayer, displayGame, matchId]);
  const perform = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = async (demo: boolean) =>
    perform(async () => {
      const n = gameType === 'werewolf' ? count : 2,
        runId = crypto.randomUUID().slice(0, 8);
      const m = await post('/matches', {
        gameType,
        locale,
        name: `${GAME_CATALOG[gameType].name[locale]} · ${new Date().toLocaleTimeString()}`,
        games,
        concurrency,
        seed,
        paceMs: demo ? 700 : 0,
        maxDecisions: gameType === 'werewolf' ? 600 : 1000,
        chatEnabled: chat,
        ...(demo
          ? {
              agents: Array.from({ length: n }, (_, i) => ({
                id: `${gameType}-${runId}-${i}`,
                name: `Agent ${i + 1}`,
                kind: 'heuristic',
                rsi: 'off',
              })),
            }
          : { playerIds: Array.from({ length: n }, (_, i) => ids[i] ?? '') }),
      });
      if (Object.keys(m.agentTokens ?? {}).length) {
        const blob = new Blob(
          [JSON.stringify({ matchId: m.id, agentTokens: m.agentTokens }, null, 2)],
          { type: 'application/json' },
        );
        const url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = 'external-agent-tokens.json';
        a.click();
        URL.revokeObjectURL(url);
        setNotice(
          locale === 'en' ? 'External Agent tokens downloaded.' : '外部 Agent 令牌已下载。',
        );
      }
      createEpoch.current++;
      const all: Match[] = await api('/matches');
      setMatches(all.filter((m) => m.config.gameType === gameType));
      setLoaded(true);
      updateView(
        {
          matchId: m.id,
          gameId: all.find((row) => row.id === m.id)?.games[0]?.id ?? '',
          seq: null,
          viewer: -1,
        },
        true,
      );
      setCreating(false);
      setMemoryPlayer('');
      setMemoryText('');
    });
  const ready =
    snapshot?.view.gameId === gameId &&
    snapshot.view.viewer === viewer &&
    snapshot.requestedSeq === seq &&
    (seq === null || snapshot.view.revision === seq)
      ? snapshot
      : null;
  const filteredEvents = (ready ? events : []).filter(
    (e) =>
      viewer === -1 ||
      ((!e.visibleTo || e.visibleTo.includes(viewer)) &&
        (e.privateTo === undefined || e.privateTo === viewer)),
  );
  const teamMessages = filteredEvents.filter((e) => e.type === 'chat' && e.visibleTo);
  const lastMove = filteredEvents.filter((e) => e.type === 'move').at(-1);
  return (
    <main
      className={`multi-arena arena-${gameType}`}
      style={{ '--game-accent': presentation.accent } as React.CSSProperties}
    >
      <header className="multi-title">
        <div>
          <span className="eyebrow">{presentation.en} / AGENT OBSERVATORY</span>
          <h1>
            {GAME_CATALOG[gameType].name[language]}
            <span>{t('观战室', 'Observatory')}</span>
          </h1>
          <p>
            {t(
              presentation.description,
              gameType === 'werewolf'
                ? 'Read the room. Question every claim.'
                : 'Every move tells a story.',
            )}
          </p>
        </div>
        <div className="room-actions">
          <label>
            {t('新对局语言', 'New match language')}
            <select
              aria-label="Language / 语言"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              disabled={gameType === 'xiangqi'}
            >
              <option value="zh">中文</option>
              {gameType !== 'xiangqi' && <option value="en">English</option>}
            </select>
          </label>
          <button className="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            {t('创建对战', 'New match')}
          </button>
        </div>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label={t('关闭错误', 'Dismiss error')}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <p className="room-notice" role="status">
          {notice}
        </p>
      )}
      <dialog
        ref={dialog}
        className="game-create-dialog"
        onCancel={() => setCreating(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setCreating(false);
        }}
        aria-label={locale === 'en' ? 'Create match' : '创建对战设置'}
      >
        <div>
          <button
            className="dialog-close"
            aria-label={locale === 'en' ? 'Close settings' : '关闭设置'}
            onClick={() => setCreating(false)}
          >
            ×
          </button>
          <section className="multi-create">
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            <span className="eyebrow">{presentation.en} / NEW MATCH</span>
            <h2>{locale === 'en' ? 'Create an experiment' : '创建实验'}</h2>
            <div className="multi-fields">
              {gameType === 'werewolf' && (
                <label>
                  {locale === 'en' ? 'Players' : '人数'}
                  <select
                    aria-label="Players / 人数"
                    value={count}
                    onChange={(e) => setCount(+e.target.value)}
                  >
                    {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {locale === 'en' ? 'Games' : '局数'}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={games}
                  onChange={(e) => {
                    setGames(+e.target.value);
                    setConcurrency((c) => Math.min(c, Math.max(1, +e.target.value)));
                  }}
                />
              </label>
              <label>
                {locale === 'en' ? 'Concurrency' : '并行数'}
                <input
                  type="number"
                  min={1}
                  max={games}
                  value={concurrency}
                  onChange={(e) => setConcurrency(+e.target.value)}
                />
              </label>
              <label>
                Seed
                <input
                  type="number"
                  min={0}
                  max={2147483647}
                  value={seed}
                  onChange={(e) => setSeed(+e.target.value)}
                />
              </label>
            </div>
            <label className="multi-check">
              <input type="checkbox" checked={chat} onChange={(e) => setChat(e.target.checked)} />
              {locale === 'en' ? 'Enable Agent communication' : '开启 Agent 交流'}
            </label>
            <details>
              <summary>
                {locale === 'en'
                  ? 'Choose model / external players and RSI settings'
                  : '选择模型 / 外部玩家与 RSI 设置'}
              </summary>
              <p>
                {locale === 'en'
                  ? 'Players retain their model and RSI settings. Experience is isolated by game. Manage profiles in the player library.'
                  : '沿用玩家的模型与 RSI 设置，经验按游戏隔离。可在玩家库修改配置。'}
              </p>
              <div className="multi-fields">
                {Array.from({ length: gameType === 'werewolf' ? count : 2 }, (_, i) => (
                  <label key={i}>
                    {locale === 'en' ? 'Seat' : '座位'} {i + 1}
                    <select
                      aria-label={`Multi seat ${i + 1}`}
                      value={ids[i] ?? ''}
                      onChange={(e) =>
                        setIds((old) =>
                          Array.from({ length: 12 }, (_, j) =>
                            j === i ? e.target.value : (old[j] ?? ''),
                          ),
                        )
                      }
                    >
                      <option value="">{locale === 'en' ? 'Select player' : '选择玩家'}</option>
                      {players.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={ids.some(
                            (id, j) =>
                              j !== i && j < (gameType === 'werewolf' ? count : 2) && id === p.id,
                          )}
                        >
                          {p.name} · {p.model || p.kind} · RSI: {p.rsi}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button className="secondary" onClick={onManage}>
                {locale === 'en' ? 'Player library' : '管理玩家库'}
              </button>{' '}
              <button className="primary" disabled={busy} onClick={() => void create(false)}>
                {locale === 'en' ? 'Start configured match' : '启动配置对战'}
              </button>
            </details>
            <button className="primary" disabled={busy} onClick={() => void create(true)}>
              {locale === 'en' ? 'Run local demo' : '运行本地游戏演示'}
            </button>
            <small>
              {locale === 'en'
                ? ' Local policies · no model requests · no new RSI'
                : ' 本地策略 · 无模型请求 · 不新增 RSI'}
            </small>
          </section>
        </div>
      </dialog>
      <div className="room-layout">
        <aside className="match-shelf">
          <div className="shelf-heading">
            <span>{t('对战档案', 'MATCH ARCHIVE')}</span>
            <b>{String(matches.length).padStart(2, '0')}</b>
          </div>
          <label className="mobile-match-picker">
            {t('选择对战', 'Select match')}
            <select
              aria-label="Multi match"
              value={matchId}
              onChange={(e) => chooseMatch(e.target.value)}
            >
              <option value="">—</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.config.name} · {stateLabel(m.status)}
                </option>
              ))}
            </select>
          </label>
          <div className="shelf-list">
            {matches.map((m) => (
              <button
                key={m.id}
                className={`shelf-match ${matchId === m.id ? 'selected' : ''}`}
                aria-pressed={matchId === m.id}
                onClick={() => chooseMatch(m.id)}
              >
                <span className="shelf-match-top">
                  <i className={`status-dot ${m.status}`} />
                  {stateLabel(m.status)}
                  <small>{m.config.locale.toUpperCase()}</small>
                </span>
                <strong>{m.config.name}</strong>
                <span>
                  {m.config.agents.length} {t('位玩家', 'players')} ·{' '}
                  {m.games.filter((g) => g.runStatus === 'finished').length}/{m.config.games}{' '}
                  {t('局', 'games')}
                </span>
              </button>
            ))}
          </div>
          {!matches.length && (
            <p className="shelf-empty">
              {t('第一场对战，从这里开始。', 'Your first match starts here.')}
            </p>
          )}
          <button
            aria-label={t('运行本地游戏演示', 'Run local demo')}
            className="shelf-demo"
            disabled={busy}
            onClick={() => void create(true)}
          >
            <Icon name="play" />
            {t('运行本地游戏演示', 'Run local demo')}
            <span>↗</span>
          </button>
          <p className="shelf-note">{t('本地策略，无需 API。', 'Local agents. No API needed.')}</p>
          <details className="multi-rules">
            <summary>{t('规则与实验口径', 'Rules & protocol')}</summary>
            <p>{rules}</p>
          </details>
        </aside>
        <section className="room-main">
          {!match ? (
            <div className="room-empty">
              <span className="empty-game-mark">
                <GameSymbol type={gameType} />
              </span>
              <span className="eyebrow">
                {loaded ? 'READY WHEN YOU ARE' : 'LOADING YOUR ARENA'}
              </span>
              <h2>{t('等待下一场交锋', 'The next match awaits')}</h2>
              <p>
                {t(
                  '启动一次本地演示，或邀请带着经验的 Agent 入座。',
                  'Try a local demonstration or bring your own experienced Agents.',
                )}
              </p>
              <button className="secondary" onClick={() => setCreating(true)}>
                {t('配置模型与 RSI', 'Configure models & RSI')} ↗
              </button>
            </div>
          ) : (
            <>
              <div className="match-overview">
                <div className="match-heading">
                  <div>
                    <span className={`match-state ${match.status}`}>
                      <i />
                      {stateLabel(match.status)}
                    </span>
                    <h2>{match.config.name}</h2>
                  </div>
                  <a
                    className="export-link"
                    href={`/api/games/${gameId}/export`}
                    download
                    aria-label={t('导出对局', 'Export game')}
                  >
                    <Icon name="download" />
                    {t('导出', 'Export')}
                  </a>
                </div>
                <div className="game-rounds" aria-label={t('切换对局', 'Switch round')}>
                  {match.games.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => chooseGame(g.id)}
                      aria-pressed={g.id === gameId}
                      className={g.id === gameId ? 'selected' : ''}
                    >
                      <span>
                        {t('第', 'ROUND')} {String(g.number).padStart(2, '0')}
                        {en ? '' : ' 局'}
                      </span>
                      <small>
                        <i className={`status-dot ${g.runStatus}`} />
                        {g.winner ? resultLabel(g.winner) : stateLabel(g.runStatus)}
                      </small>
                    </button>
                  ))}
                  {match.config.games > match.games.length && (
                    <span className="round-queued">
                      +{match.config.games - match.games.length} {t('待开局', 'queued')}
                    </span>
                  )}
                </div>
              </div>
              <div className="room-toolbar">
                <span className={`live-tag ${seq !== null ? 'replay' : ''}`}>
                  <i />
                  {seq === null ? 'LIVE' : 'REPLAY'}
                </span>
                <span>
                  {t('第', 'ROUND')} {ready?.view.round ?? '—'} {en ? '' : '轮'}
                </span>
                <span className="decision-count">
                  {ready?.decisionCount ?? '—'} {t('次决策', 'decisions')}
                </span>
                <label>
                  <Icon name="eye" size={16} />
                  <select
                    aria-label="Perspective / 视角"
                    value={viewer}
                    onChange={(e) => updateView({ viewer: +e.target.value })}
                  >
                    <option value={-1}>{t('全知观战', 'Omniscient spectator')}</option>
                    {match.config.agents.map((a, i) => {
                      const p = ready?.view.players[i];
                      return (
                        <option key={i} value={i}>
                          {p?.name ?? a.name}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              <div className="multi-layout">
                <section className="multi-stage" aria-busy={!ready}>
                  {!ready ? (
                    <div className="board-loading" role="status">
                      <span className="loading-orbit" />
                      {t('正在加载对局…', 'Loading game…')}
                    </div>
                  ) : (
                    <>
                      <div
                        className={`multi-status ${ready.view.status === 'finished' ? 'is-result' : ''}`}
                      >
                        <i className={ready.thinking ? 'thinking-pulse' : ''} />
                        {ready.view.status === 'finished'
                          ? `${t('结果', 'Result')}: ${resultLabel(ready.view.winner)} · ${ready.view.details?.reason ?? ''}`
                          : ready.thinking
                            ? `${ready.view.players[ready.thinking.seat]?.name ?? ''} · ${t(ready.thinking.kind.startsWith('rsi') ? '正在反思' : '正在思考', ready.thinking.kind.startsWith('rsi') ? 'Reflecting' : 'Thinking')}`
                            : `${t('当前行动', 'To move')}: ${ready.view.players[ready.view.active]?.name ?? t('夜间行动', 'Night action')}`}
                      </div>
                      <GameBoard
                        key={gameId}
                        view={ready.view}
                        locale={language}
                        lastMove={lastMove}
                      />
                    </>
                  )}
                  <div className="room-playback">
                    <div className="playback-actions">
                      {(['pause', 'resume', 'step'] as const)
                        .filter(
                          (op) =>
                            op === 'step' ||
                            (match.status === 'running' || match.status === 'waiting'
                              ? op === 'pause'
                              : op === 'resume'),
                        )
                        .map((op) => (
                          <button
                            key={op}
                            className={op === 'step' ? 'secondary' : 'primary'}
                            disabled={busy || ['finished', 'stopped'].includes(match.status)}
                            onClick={() =>
                              void perform(() =>
                                post(`/matches/${matchId}/${op}`, op === 'step' ? { gameId } : {}),
                              )
                            }
                          >
                            <Icon
                              name={op === 'pause' ? 'pause' : op === 'step' ? 'next' : 'play'}
                              size={16}
                            />
                            {t(
                              op === 'pause' ? '暂停' : op === 'resume' ? '继续' : '单步',
                              op === 'pause' ? 'Pause' : op === 'resume' ? 'Resume' : 'Step',
                            )}
                          </button>
                        ))}
                    </div>
                    <label className="room-timeline">
                      <span>
                        {t('回放时间轴', 'Replay timeline')}
                        <b>
                          {seq ?? ready?.view.revision ?? 1} / {game?.revision ?? 1}
                        </b>
                      </span>
                      <input
                        aria-label="Replay frame"
                        type="range"
                        min={1}
                        max={Math.max(1, game?.revision ?? 1)}
                        value={seq ?? ready?.view.revision ?? 1}
                        onChange={(e) => updateView({ seq: +e.target.value })}
                      />
                    </label>
                    <button
                      aria-label={t('实时', 'Live')}
                      className={`live-return ${seq === null ? 'active' : ''}`}
                      onClick={() => updateView({ seq: null })}
                    >
                      {t('实时', 'Live')} ↗
                    </button>
                  </div>
                </section>
                <aside className="room-inspector">
                  <div
                    className="inspector-tabs"
                    role="tablist"
                    aria-label={t('对局详情', 'Game details')}
                  >
                    {(['chat', 'events', 'memory'] as const).map((id, i) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={panel === id}
                        onClick={() => setPanel(id)}
                      >
                        {t(['交流', '实录', '经验'][i], ['Chat', 'Events', 'Memory'][i])}
                        {id === 'chat' && <small>{messages.length}</small>}
                      </button>
                    ))}
                  </div>
                  <div className="inspector-content" role="tabpanel">
                    {panel === 'chat' && (
                      <section className="multi-chat">
                        <div className="inspector-heading">
                          <span>PUBLIC CHANNEL</span>
                          <h3>{t('公开交流', 'Public conversation')}</h3>
                        </div>
                        <div role="log" aria-label={t('公开消息', 'Public messages')}>
                          {messages.map((m) => (
                            <article key={m.seq}>
                              <span className="speaker-avatar">{m.name.slice(0, 1)}</span>
                              <div>
                                <strong>
                                  {m.name}
                                  <small>#{m.seq}</small>
                                </strong>
                                <p>{m.text}</p>
                              </div>
                            </article>
                          ))}
                          {!messages.length && (
                            <div className="inspector-empty">
                              <Icon name="chat" size={28} />
                              <p>{t('安静也是一种策略。', 'Silence is a strategy, too.')}</p>
                              <small>
                                {t(
                                  '玩家发言后，会显示在这里。',
                                  'Agent messages will appear here.',
                                )}
                              </small>
                            </div>
                          )}
                        </div>
                        {!!teamMessages.length && (
                          <details className="team-conversation">
                            <summary>
                              {t(
                                '狼人密谈 · 当前视角可见',
                                'Wolf chat · visible to this perspective',
                              )}
                            </summary>
                            {teamMessages.map((e) => (
                              <article key={e.seq}>{e.text}</article>
                            ))}
                          </details>
                        )}
                        <p className="inspector-footnote">
                          {t('消息随回放位置同步。', 'Messages follow the replay position.')}
                        </p>
                      </section>
                    )}
                    {panel === 'events' && (
                      <section className="event-inspector">
                        <div className="inspector-heading">
                          <span>EVENT JOURNAL</span>
                          <h3>{t('每一步，都有迹可循', 'Every move, recorded')}</h3>
                        </div>
                        <ol className="multi-log">
                          {filteredEvents
                            .filter((e) => e.type !== 'ready')
                            .slice(-80)
                            .reverse()
                            .map((e) => (
                              <li key={e.seq}>
                                <small>
                                  #{e.seq} <span>{e.type}</span>
                                </small>
                                <p>{e.text}</p>
                              </li>
                            ))}
                        </ol>
                      </section>
                    )}
                    {panel === 'memory' && (
                      <>
                        {' '}
                        <section className="multi-memory">
                          <h2>{t('个人经验与 RSI', 'Personal experience and RSI')}</h2>
                          <label>
                            {t('玩家', 'Player')}
                            <select
                              aria-label="Memory player"
                              value={memoryPlayer}
                              onChange={(e) => setMemoryPlayer(e.target.value)}
                            >
                              <option value="">{t('选择玩家', 'Select player')}</option>
                              {match?.config.agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} · RSI: {a.rsi}
                                </option>
                              ))}
                            </select>
                          </label>
                          {memoryPlayer && (
                            <>
                              <p>
                                {t(
                                  '经验仅用于当前游戏类型；归纳保留原文。',
                                  'Experience applies only to this game type. Consolidation preserves source records.',
                                )}
                              </p>
                              <textarea
                                aria-label="Experience / 经验"
                                value={memoryText}
                                onChange={(e) => setMemoryText(e.target.value)}
                                maxLength={4000}
                                placeholder={t(
                                  '添加该游戏的个人经验',
                                  'Add personal experience for this game',
                                )}
                              />
                              <div className="multi-controls">
                                <button
                                  className="secondary"
                                  disabled={busy || !memoryText.trim()}
                                  onClick={() =>
                                    void perform(async () => {
                                      await post(`/players/${memoryPlayer}/memories`, {
                                        text: memoryText,
                                        gameType: displayGame,
                                      });
                                      setMemoryText('');
                                    })
                                  }
                                >
                                  {t('保存经验', 'Save experience')}
                                </button>
                                <button
                                  className="primary"
                                  disabled={
                                    busy ||
                                    !memories.some(
                                      (m) =>
                                        m.matchId === matchId &&
                                        ['immediate', 'round'].includes(m.mode),
                                    ) ||
                                    jobs.some((j) => j.status === 'running')
                                  }
                                  onClick={() =>
                                    void perform(() =>
                                      post(`/players/${memoryPlayer}/memories/consolidate`, {
                                        matchId,
                                      }),
                                    )
                                  }
                                >
                                  {t('归纳本场经验', 'Consolidate this match')}
                                </button>
                              </div>
                              {jobs.slice(0, 1).map((j) => (
                                <p key={j.id} role="status">
                                  {t('归纳任务', 'Consolidation')}: {j.status} ·{' '}
                                  {j.error ?? `${j.completedCalls ?? 0} calls`}
                                </p>
                              ))}
                              {memories
                                .slice(-30)
                                .reverse()
                                .map((m) => (
                                  <article key={m.id}>
                                    <small>
                                      {m.mode} ·{' '}
                                      {m.active ? t('生效', 'Active') : t('已归档', 'Archived')}
                                    </small>
                                    <p>{m.text}</p>
                                  </article>
                                ))}
                            </>
                          )}
                        </section>
                      </>
                    )}
                  </div>
                </aside>
              </div>
              <details className="match-advanced">
                <summary>{t('对战管理', 'Match management')}</summary>
                <p>
                  {t(
                    '暂停与继续作用于整场；单步仅推进所选对局。切换游戏不会中断运行。',
                    'Pause/resume control the whole match. Step advances only this round. Switching games does not stop running matches.',
                  )}
                </p>
                <button
                  className="secondary danger"
                  disabled={busy || ['finished', 'stopped'].includes(match.status)}
                  onClick={() => void perform(() => post(`/matches/${matchId}/stop`, {}))}
                >
                  {t('停止', 'Stop')}
                </button>
              </details>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
