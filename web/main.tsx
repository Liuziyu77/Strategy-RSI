import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentConfig, GameEvent, Memory, Observation, PlayerRecord } from '../src/types';
import { modes, statuses, names, heroNames, colors, Icon, Face, api, post } from './ui';
import { PlayerLibrary } from './PlayerLibrary';
import { NewMatch } from './NewMatch';
import { BattleEffects } from './BattleEffects';
import { ChatRoom } from './ChatRoom';
import './style.css';
import './upgrade.css';
import './chat.css';
const runNames: Record<string, string> = {
  paused: '已暂停',
  running: '进行中',
  waiting: '等待 Agent',
  reflecting: '赛后 RSI',
  finished: '已完成',
  error: '异常',
  stopped: '已停止',
};

function App() {
  const [page, setPage] = useState('arena'),
    [config, setConfig] = useState<any>(null),
    [matches, setMatches] = useState<any[]>([]),
    [matchId, setMatchId] = useState('');
  const [gameId, setGameId] = useState(''),
    [follow, setFollow] = useState(true),
    [snapshot, setSnapshot] = useState<any>(null),
    [events, setEvents] = useState<GameEvent[]>([]),
    [decisions, setDecisions] = useState<any[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]),
    [modal, setModal] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState<number | null>(null),
    [omniscient, setOmniscient] = useState(true),
    [logTab, setLogTab] = useState('events'),
    [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<PlayerRecord[]>([]),
    [profileId, setProfileId] = useState('');
  const refreshLock = useRef(false),
    viewRequest = useRef(0);
  const selected = matches.find((m) => m.id === matchId),
    games = selected?.games ?? [],
    game = games.find((g: any) => g.id === gameId);
  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      const [m, mm, pp] = await Promise.all([api('/matches'), api('/memories'), api('/players')]);
      setPlayers(pp);
      setMatches(m);
      setMemories(mm);
      setMatchId((current) => current || m[0]?.id || '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      refreshLock.current = false;
    }
  }, []);
  useEffect(() => {
    api('/config')
      .then(setConfig)
      .catch((e) => setError(e.message));
    void refresh();
    const timer = setInterval(refresh, 2000);
    const stream = new EventSource('/api/stream');
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener('update', () => void refresh());
    return () => {
      clearInterval(timer);
      stream.close();
    };
  }, [refresh]);
  useEffect(() => {
    if (!selected) {
      setGameId('');
      return;
    }
    setGameId((current) =>
      !games.some((g: any) => g.id === current)
        ? (games.find((g: any) => g.status !== 'finished')?.id ?? games.at(-1)?.id ?? '')
        : follow && (selected.config.concurrency ?? 1) === 1
          ? (games.at(-1)?.id ?? '')
          : current,
    );
  }, [matchId, selected?.games?.length, follow]);
  useEffect(() => {
    setSeq(null);
    setEvents([]);
    setDecisions([]);
    setSnapshot(null);
  }, [gameId]);
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    const load = async () => {
      const n = ++viewRequest.current;
      try {
        const [s, e, d] = await Promise.all([
          api(`/games/${gameId}${seq === null ? '' : `?seq=${seq}`}`),
          api(`/games/${gameId}/events?tail=300${seq === null ? '' : `&before=${seq}`}`),
          api(`/games/${gameId}/decisions?limit=100${seq === null ? '' : `&before=${seq}`}`),
        ]);
        if (!cancelled && n === viewRequest.current) {
          setSnapshot(s);
          setEvents(e);
          setDecisions(d);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(load, seq === null ? 1000 : 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gameId, seq]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const perform = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = async (body: unknown) => {
    const m = await post('/matches', body);
    setMatchId(m.id);
    setFollow(true);
    setPage('arena');
    setModal(false);
    if (Object.keys(m.agentTokens ?? {}).length) {
      downloadJson({ matchId: m.id, agentTokens: m.agentTokens }, 'external-agent-tokens.json');
      setNotice('外部 Agent 令牌已下载，请保存。');
    }
    await refresh();
  };
  const demo = () =>
    perform(() =>
      create({
        name: '群雄初试 · 本地演示',
        agents: Array.from({ length: 4 }, (_, i) => ({
          id: `agent-${i + 1}`,
          name: names[i],
          kind: 'heuristic',
          provider: 'default',
          model: '',
          rsi: 'off',
          hero: heroNames[i],
        })),
        paceMs: 900,
        seed: 42,
      }),
    );
  const v: Observation | undefined = snapshot?.view?.gameId === gameId ? snapshot.view : undefined,
    thinking = v ? snapshot?.thinking : null,
    lastDecision = decisions.filter((d) => seq === null || d.revision < seq).at(-1);
  const visibleEvents = events
    .filter(
      (e) => (seq === null || e.seq <= seq) && !['action', 'resolved', 'ready'].includes(e.type),
    )
    .slice(-120)
    .reverse();
  const changeMatch = (id: string) => {
    setMatchId(id);
    setFollow(true);
    setSeq(null);
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('arena');
          }}
        >
          <span className="seal">杀</span>
          <span>
            三国杀<span className="brand-en">AGENT ARENA</span>
          </span>
          <em>实验室</em>
        </a>
        <nav>
          {[
            ['arena', 'arena', '对战观测'],
            ['players', 'users', '玩家库'],
            ['rules', 'gear', '规则与接入'],
          ].map(([key, icon, label]) => (
            <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className="connection">
            <i className={connected ? 'on' : ''} />
            {connected ? '实时连接' : '正在重连'}
          </span>
          <button className="primary compact" onClick={() => setModal(true)}>
            <Icon name="plus" />
            新建对战
          </button>
        </div>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button aria-label="关闭错误提示" onClick={() => setError('')}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" />
          {notice}
        </div>
      )}
      {page === 'arena' ? (
        <div className="workspace">
          <aside className="sidebar">
            <div className="section-label">
              WORKSPACE <span>01</span>
            </div>
            <h2>对战空间</h2>
            <p className="muted">观察决策，也观察成长。</p>
            <button className="new-match" onClick={() => setModal(true)}>
              <Icon name="plus" />
              创建一场对战
              <Icon name="arrow" />
            </button>
            <div className="sidebar-heading">
              对战记录 <span>{matches.length.toString().padStart(2, '0')}</span>
            </div>
            <div className="match-list">
              {matches.length ? (
                matches.map((m) => (
                  <button
                    className={`match-item ${m.id === matchId ? 'selected' : ''}`}
                    key={m.id}
                    onClick={() => changeMatch(m.id)}
                  >
                    <span className="match-icon">
                      <Icon name="arena" />
                    </span>
                    <span>
                      <strong>{m.config.name}</strong>
                      <small>
                        {m.config.agents.length} 位 Agent · {m.config.games} 局
                      </small>
                    </span>
                    <i className={`status-dot ${m.status}`} />
                  </button>
                ))
              ) : (
                <p className="empty-small">
                  尚无对战记录
                  <br />
                  从一次本地演示开始。
                </p>
              )}
            </div>
            <div className="sidebar-bottom">
              <div className="mini-mark">策</div>
              <strong>记忆，让下一局不同。</strong>
              <p>
                即时反思与赛后复盘
                <br />
                让每一次交锋留下经验。
              </p>
              <button className="text-button" onClick={() => setPage('players')}>
                查看玩家档案 <Icon name="arrow" size={14} />
              </button>
            </div>
            <div className="version">
              STANDARD 108 <span>v1.0</span>
            </div>
          </aside>
          <main className="arena-main">
            {!selected ? (
              <div className="welcome">
                <div className="eyebrow">
                  <span />
                  MULTI-AGENT STRATEGY LAB
                </div>
                <h1>
                  让策略，
                  <br />
                  落在牌桌上。
                </h1>
                <p>
                  让不同模型同场交锋，观测每一步决策。
                  <br />
                  积累经验，复盘胜负，再战下一局。
                </p>
                <div className="welcome-buttons">
                  <button className="primary" disabled={busy} onClick={demo}>
                    <Icon name="play" />
                    运行本地演示
                  </button>
                  <button className="secondary" onClick={() => setModal(true)}>
                    配置 API Agent
                    <Icon name="arrow" />
                  </button>
                </div>
                <div className="welcome-cards">
                  <div className="decor-card c1">
                    <span>♠ A</span>
                    <b>杀</b>
                    <small>运筹帷幄</small>
                  </div>
                  <div className="decor-card c2">
                    <span>♥ 2</span>
                    <b>闪</b>
                    <small>见招拆招</small>
                  </div>
                  <div className="decor-card c3">
                    <span>♦ Q</span>
                    <b>桃</b>
                    <small>绝处逢生</small>
                  </div>
                </div>
                <div className="feature-strip">
                  <div>
                    <strong>02—08</strong>
                    <span>自定义玩家</span>
                  </div>
                  <div>
                    <strong>108</strong>
                    <span>标准卡牌</span>
                  </div>
                  <div>
                    <strong>RSI</strong>
                    <span>文本经验进化</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="arena-heading">
                  <div>
                    <div className="eyebrow">
                      LIVE OBSERVATORY{' '}
                      <span className={`badge ${selected.status}`}>
                        {statuses[selected.status]}
                      </span>
                    </div>
                    <h1>{selected.config.name}</h1>
                    <p>
                      {selected.config.agents.length} 位 Agent <span>·</span> 标准身份局{' '}
                      <span>·</span>{' '}
                      {selected.config.agents.some((a: any) => a.kind === 'llm')
                        ? '模型 API 驱动'
                        : '本地 / 外部 Agent'}{' '}
                      <span>·</span> Seed {selected.config.seed}
                    </p>
                  </div>
                  <div className="round-select">
                    <span>对局</span>
                    <select
                      aria-label="选择对局"
                      value={gameId}
                      onChange={(e) => {
                        setFollow(false);
                        setSeq(null);
                        setGameId(e.target.value);
                      }}
                    >
                      {games.map((g: any) => (
                        <option key={g.id} value={g.id}>
                          第 {g.number} / {selected.config.games} 局{' · '}
                          {runNames[g.runStatus] ?? (g.status === 'finished' ? '已完成' : '进行中')}
                          {g.winner ? ` · ${g.winner === '平局' ? '平局' : `${g.winner}胜`}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {selected.config.games > 1 && (
                  <section className="parallel-games" aria-label="多局实时战况">
                    <div className="parallel-heading">
                      <strong>并行 {selected.config.concurrency ?? 1} 局</strong>
                      <span>
                        已完成 {games.filter((g: any) => g.runStatus === 'finished').length} /{' '}
                        {selected.config.games} 局 · 等待开局 {selected.config.games - games.length}{' '}
                        局
                      </span>
                      <small>暂停 / 继续控制整场，单步执行当前所选局。</small>
                    </div>
                    <div className="parallel-game-list">
                      {games.map((g: any) => (
                        <button
                          key={g.id}
                          aria-label={`观摩第 ${g.number} 局`}
                          aria-pressed={gameId === g.id}
                          className={`parallel-game ${gameId === g.id ? 'selected' : ''}`}
                          onClick={() => {
                            setFollow(false);
                            setSeq(null);
                            setGameId(g.id);
                          }}
                        >
                          <strong>
                            第 {g.number} 局 <i className={`status-dot ${g.runStatus}`} />
                          </strong>
                          <span>
                            {runNames[g.runStatus] ?? '已暂停'} · {g.round} 轮
                          </span>
                          <small>
                            {g.runError ??
                              (g.winner
                                ? `${g.winner}${g.winner === '平局' ? '' : '胜'}`
                                : `已推进 ${g.turn} 个回合`)}
                          </small>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <div className="arena-toolbar">
                  <div className="toolbar-left">
                    <span className={`live-tag ${seq !== null ? 'replay' : ''}`}>
                      <i />
                      {seq === null ? 'LIVE' : 'REPLAY'}
                    </span>
                    <span>
                      第 <b>{v?.round ?? 1}</b> 轮
                    </span>
                    <span className="divider" />
                    <span>{v?.phase ?? '等待开局'}</span>
                  </div>
                  <div className="toolbar-right">
                    <label className="eye-toggle">
                      <input
                        type="checkbox"
                        checked={omniscient}
                        onChange={(e) => setOmniscient(e.target.checked)}
                      />
                      <Icon name="eye" size={15} />
                      全知视角
                    </label>
                    <button
                      className="icon-button"
                      title="下载完整对局 JSON"
                      aria-label="下载完整对局"
                      onClick={() => window.open(`/api/games/${gameId}/export`)}
                    >
                      <Icon name="download" />
                    </button>
                  </div>
                </div>
                <div className={`battlefield count-${v?.players.length ?? 4}`}>
                  <BattleEffects gameId={gameId} events={events} replay={seq !== null} view={v} />
                  <div className="table-watermark">逐 鹿</div>
                  <div className="player-row upper">
                    {v?.players.slice(0, Math.ceil(v.players.length / 2)).map((p) => (
                      <PlayerPanel
                        key={p.seat}
                        onProfile={() => {
                          setProfileId(p.agentId);
                          setPage('players');
                        }}
                        player={p}
                        view={v}
                        agent={selected.config.agents.find((a: any) => a.id === p.agentId)}
                        active={
                          thinking?.seat === p.seat || (!thinking && v.pending?.actor === p.seat)
                        }
                        omniscient={omniscient}
                        memories={memories.filter((m) => m.agentId === p.agentId).length}
                      />
                    ))}
                  </div>
                  <div className="table-center">
                    <div className="deck-pile">
                      <span>殺</span>
                      <small>
                        牌堆 <b>{v?.deckCount ?? 108}</b>
                      </small>
                    </div>
                    <div className="center-status">
                      {v?.status === 'finished' && !thinking ? (
                        <>
                          <span className="eyebrow">GAME COMPLETE</span>
                          <h2>{v.winner === '平局' ? '本局平局' : `${v.winner}获胜`}</h2>
                          <p>{snapshot?.state?.reason ?? '牌局已归档，可拖动时间轴回看'}</p>
                        </>
                      ) : thinking ? (
                        <>
                          <span className="thinking-dots">
                            <i />
                            <i />
                            <i />
                          </span>
                          <h3>
                            {v?.players[thinking.seat]?.name}
                            {thinking.kind.startsWith('rsi') ? '正在反思' : '正在决策'}
                          </h3>
                          <p>
                            {thinking.kind === 'rsi-immediate'
                              ? '即时 RSI · 提炼本次行动的经验'
                              : thinking.kind === 'rsi-round'
                                ? '轮次 RSI · 总结整局经验'
                                : `${v?.pending?.name ?? v?.phase} · 正在调用模型`}
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="center-seal">弈</span>
                          <h3>
                            {v?.pending
                              ? `${v.players[v.pending.actor]?.name}的行动`
                              : '正在加载牌局'}
                          </h3>
                          <p>
                            {v?.pending?.name ?? v?.phase} <span> / </span>{' '}
                            {v?.pending?.type === 'counter'
                              ? '无懈可击窗口'
                              : v?.pending?.type === 'rescue'
                                ? '濒死救援'
                                : '策略交锋中'}
                          </p>
                        </>
                      )}
                      {v?.pool.length ? (
                        <div className="pool-cards">
                          {v.pool.map((c) => (
                            <Face key={c.id} card={c} small />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="discard-pile">
                      <Icon name="arena" size={24} />
                      <small>
                        弃牌 <b>{v?.discardCount ?? 0}</b>
                      </small>
                    </div>
                  </div>
                  <div className="player-row lower">
                    {v?.players
                      .slice(Math.ceil(v.players.length / 2))
                      .reverse()
                      .map((p) => (
                        <PlayerPanel
                          key={p.seat}
                          onProfile={() => {
                            setProfileId(p.agentId);
                            setPage('players');
                          }}
                          player={p}
                          view={v}
                          agent={selected.config.agents.find((a: any) => a.id === p.agentId)}
                          active={
                            thinking?.seat === p.seat || (!thinking && v.pending?.actor === p.seat)
                          }
                          omniscient={omniscient}
                          memories={memories.filter((m) => m.agentId === p.agentId).length}
                        />
                      ))}
                  </div>
                </div>
                <div className="replay-bar">
                  <div className="replay-controls">
                    <button
                      className="round-button"
                      disabled={busy || ['finished', 'stopped'].includes(selected.status)}
                      title={selected.status === 'running' ? '暂停' : '继续'}
                      aria-label={selected.status === 'running' ? '暂停' : '继续'}
                      onClick={() =>
                        perform(() =>
                          post(
                            `/matches/${matchId}/${selected.status === 'running' ? 'pause' : 'resume'}`,
                          ),
                        )
                      }
                    >
                      <Icon name={selected.status === 'running' ? 'pause' : 'play'} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={busy || ['finished', 'stopped'].includes(selected.status)}
                      aria-label="单步执行"
                      title="暂停整场并单步执行当前局"
                      onClick={() => perform(() => post(`/matches/${matchId}/step`, { gameId }))}
                    >
                      <Icon name="next" />
                    </button>
                  </div>
                  <div className="timeline">
                    <div>
                      <span>
                        <Icon name="clock" size={13} />
                        时间轴 · 每一次状态变化均可回溯
                      </span>
                      <span>
                        {seq ?? v?.revision ?? 0} / {game?.revision ?? v?.revision ?? 0}
                      </span>
                    </div>
                    <input
                      aria-label="回放时间轴"
                      type="range"
                      min="1"
                      max={Math.max(1, game?.revision ?? v?.revision ?? 1)}
                      value={seq ?? v?.revision ?? 1}
                      onChange={(e) => setSeq(+e.target.value)}
                    />
                  </div>
                  <button
                    className={`live-return ${seq === null ? 'active' : ''}`}
                    onClick={() => {
                      setSeq(null);
                      setFollow(true);
                    }}
                  >
                    回到实时 <Icon name="arrow" size={14} />
                  </button>
                </div>
                <div className="decision-strip">
                  <span className="decision-icon">
                    <Icon name="bolt" />
                  </span>
                  <div>
                    <div className="section-label">
                      LATEST DECISION{' '}
                      <span>
                        {lastDecision ? `#${snapshot?.decisionCount ?? decisions.length}` : '—'}
                      </span>
                    </div>
                    <p>
                      {lastDecision ? (
                        <>
                          <b style={{ color: colors[lastDecision.seat % 8] }}>
                            {v?.players[lastDecision.seat]?.name}
                          </b>{' '}
                          {lastDecision.decision.reason}{' '}
                          {lastDecision.fallback && (
                            <span className="fallback">
                              API 异常，已回退：{lastDecision.fallback}
                            </span>
                          )}
                        </>
                      ) : (
                        '等待 Agent 的第一次决策。'
                      )}
                    </p>
                  </div>
                </div>
                {selected.error && <div className="inline-error">{selected.error}</div>}
              </>
            )}
          </main>
          {selected && (
            <aside className={`history-panel${logTab === 'chat' ? ' has-chat' : ''}`}>
              <div className="history-title">
                <h2>对局实录</h2>
                <span className="mini-pill">
                  {snapshot?.decisionCount ?? decisions.length} 决策
                </span>
              </div>
              <div className="log-tabs">
                <button
                  className={logTab === 'events' ? 'active' : ''}
                  onClick={() => setLogTab('events')}
                >
                  牌局动态
                </button>
                <button
                  className={logTab === 'decisions' ? 'active' : ''}
                  onClick={() => setLogTab('decisions')}
                >
                  Agent 决策
                </button>
                <button
                  className={logTab === 'chat' ? 'active' : ''}
                  onClick={() => setLogTab('chat')}
                >
                  牌局聊天
                </button>
              </div>
              {logTab === 'chat' ? (
                <ChatRoom
                  key={`${gameId}:${seq ?? 'live'}`}
                  gameId={gameId}
                  revision={v?.revision ?? 0}
                  replay={seq !== null}
                  enabled={selected.config.chatEnabled !== false}
                />
              ) : (
                <div className="history-feed">
                  {logTab === 'events'
                    ? visibleEvents.map((e) => (
                        <div className={`event-row ${e.type}`} key={e.seq}>
                          <span className="event-mark">
                            {e.type === 'damage'
                              ? '⚔'
                              : e.type === 'draw'
                                ? '+'
                                : e.type === 'death'
                                  ? '×'
                                  : e.type === 'turn'
                                    ? '◈'
                                    : '·'}
                          </span>
                          <div>
                            <small>
                              #{e.seq}{' '}
                              <span>
                                {e.actor !== undefined ? v?.players[e.actor]?.name : '系统'}
                              </span>
                            </small>
                            <p>
                              {omniscient
                                ? e.text
                                : (e.publicText ??
                                  (e.privateTo === undefined ? e.text : '私有事件'))}
                            </p>
                          </div>
                        </div>
                      ))
                    : [...decisions]
                        .filter((d) => seq === null || d.revision < seq)
                        .reverse()
                        .slice(0, 100)
                        .map((d) => (
                          <div className="decision-entry" key={d.id}>
                            <div>
                              <span style={{ color: colors[d.seat % 8] }}>
                                {v?.players[d.seat]?.name}
                              </span>
                              <small>
                                {d.source === 'forced'
                                  ? '系统'
                                  : d.source === 'heuristic'
                                    ? '本地策略'
                                    : d.model}
                              </small>
                            </div>
                            <strong>{d.action.label}</strong>
                            <p>{d.decision.reason}</p>
                            {d.fallback && <span className="fallback">回退 · {d.fallback}</span>}
                          </div>
                        ))}
                </div>
              )}
              <div className="history-footer">
                <i />
                全部历史已持久化 · SQLite
              </div>
            </aside>
          )}
        </div>
      ) : page === 'players' ? (
        <PlayerLibrary
          config={config}
          players={players}
          initialId={profileId}
          onRefresh={refresh}
          onWatch={(match, game) => {
            setFollow(false);
            setMatchId(match);
            setGameId(game);
            setSeq(null);
            setPage('arena');
          }}
        />
      ) : (
        <main className="full-page rules-page">
          <div className="eyebrow">RULES & CONNECTIONS</div>
          <h1>规则与接入</h1>
          <p className="muted">独立实现的标准规则状态机，面向可观测的多 Agent 实验。</p>
          <div className="rule-panels">
            <article>
              <Icon name="arena" size={28} />
              <h2>标准身份对战</h2>
              <p>
                2–8 人。2 人为简化主公 / 反贼对决；3–8 人按人数分配身份。5 人及以上主公体力上限
                +1。主忠消灭反贼与内奸；内奸须成为唯一存活者；否则主公阵亡即反贼胜。
              </p>
              <p>
                108 张标准包与 EX
                牌，准备、判定、摸牌、出牌、弃牌、结束六阶段。当前不包含军争扩展与全量武将包。
              </p>
            </article>
            <article>
              <Icon name="bolt" size={28} />
              <h2>RSI 如何工作</h2>
              <p>
                即时 RSI：每次有选择的行动后，模型自主判断是否需要总结。轮次
                RSI：每局结束后复盘，记忆带入下一局。两者可同时开启。
              </p>
              <p>
                经验以文本保存，与个人可见历史共同输入决策模型。完整历史永久存档；模型上下文默认使用最近
                300 条事件，并明确告知省略数量。
              </p>
            </article>
            <article>
              <Icon name="gear" size={28} />
              <h2>API 连接</h2>
              <p>
                兼容 Chat Completions 的模型服务，从项目根目录 .env 读取。支持现有 YAML 格式与标准
                dotenv 格式；每个座位可独立选择模型和 Provider。
              </p>
              <p>
                外部 Agent 使用创建比赛时下载的独立令牌，通过玩家视角 API
                获取状态、历史、记忆和合法操作，再提交 actionId 与 revision。
              </p>
            </article>
          </div>
          <div className="provider-panel">
            <h2>已配置模型</h2>
            {config?.providers.length ? (
              config.providers.map((p: any) => (
                <div className="provider-row" key={p.id}>
                  <span className={`status-dot ${p.configured ? 'running' : 'error'}`} />
                  <strong>{p.name}</strong>
                  <div>
                    {p.models.map((m: string) => (
                      <code key={m}>{m}</code>
                    ))}
                  </div>
                  <span>{p.configured ? '已配置' : '缺少 API Key'}</span>
                </div>
              ))
            ) : (
              <p className="muted">尚未配置 API，可使用本地策略模式。</p>
            )}
            <p className="muted">密钥仅在后端使用，不会发送到前端或对局历史。</p>
          </div>
          {config?.adminRequired && (
            <div className="provider-panel">
              <h2>管理令牌</h2>
              <p className="muted">此服务启用了控制 API 认证。令牌只保存在当前浏览器会话。</p>
              <input
                type="password"
                aria-label="管理令牌"
                placeholder="输入 ARENA_ADMIN_TOKEN"
                defaultValue={sessionStorage.getItem('arena-token') ?? ''}
                onChange={(e) => sessionStorage.setItem('arena-token', e.target.value)}
              />
            </div>
          )}
          <div className="heroes-panel">
            <h2>基础武将包</h2>
            <div>
              {config?.heroes.map((h: any) => (
                <article key={h.name}>
                  <span className="hero-small">{h.name[0]}</span>
                  <strong>{h.name}</strong>
                  <p>{h.description}</p>
                </article>
              ))}
            </div>
          </div>
        </main>
      )}
      {modal && config && (
        <NewMatch
          players={players}
          busy={busy}
          onManage={() => {
            setModal(false);
            setPage('players');
          }}
          onClose={() => setModal(false)}
          onCreate={(body) => perform(() => create(body))}
        />
      )}
    </div>
  );
}
function PlayerPanel({
  player: p,
  view,
  agent,
  active,
  omniscient,
  memories,
  onProfile,
}: {
  player: Observation['players'][0];
  view: Observation;
  agent: AgentConfig;
  active: boolean;
  omniscient: boolean;
  memories: number;
  onProfile: () => void;
}) {
  return (
    <article
      data-seat={p.seat}
      className={`player-panel ${active ? 'acting' : ''} ${!p.alive ? 'dead' : ''}`}
      style={{ '--seat-color': colors[p.seat % 8] } as React.CSSProperties}
    >
      <div className="player-top">
        <span className="seat-number">{String(p.seat + 1).padStart(2, '0')}</span>
        <span className={`role role-${p.role}`}>
          {omniscient || p.role === '主公' || !p.alive ? p.role : '身份未明'}
        </span>
        <span className="agent-type">
          {agent?.kind === 'llm' ? 'API' : agent?.kind === 'external' ? 'EXT' : 'LOCAL'}
        </span>
      </div>
      <div className="player-identity">
        <div className="hero-avatar">
          <span>{p.hero[0]}</span>
          <small>{p.hero}</small>
        </div>
        <div className="player-info">
          <h3>
            <button className="profile-name" onClick={onProfile} title="查看玩家档案">
              {p.name}
              <Icon name="arrow" size={12} />
            </button>
          </h3>
          <p
            title={
              agent?.kind === 'llm'
                ? agent.model
                : agent?.kind === 'external'
                  ? '外部 API Agent'
                  : '本地策略 Agent'
            }
          >
            {agent?.kind === 'llm'
              ? agent.model
              : agent?.kind === 'external'
                ? '外部 API Agent'
                : '本地策略 Agent'}
          </p>
          <div className="health" title={`${p.hp}/${p.maxHp} 体力`}>
            {Array.from({ length: p.maxHp }, (_, i) => (
              <i key={i} className={i < p.hp ? 'filled' : ''} />
            ))}
            <small>
              {p.hp}/{p.maxHp}
            </small>
          </div>
        </div>
      </div>
      <div className="equipment-line">
        {Object.values(p.equipment).map((id) => (
          <span key={id}>{view.equipmentCards[id!]?.name}</span>
        ))}
        {p.judge.map((id) => (
          <span className="delayed" key={id}>
            {view.equipmentCards[id]?.name}
          </span>
        ))}
        {!Object.keys(p.equipment).length && !p.judge.length && (
          <span className="empty-equipment">未装备</span>
        )}
      </div>
      <div className="hand-strip">
        {omniscient
          ? p.hand?.map((c) => <Face key={c.id} card={c} small />)
          : Array.from({ length: p.handCount }, (_, i) => (
              <span className="card-back" key={i}>
                杀
              </span>
            ))}
        {!p.handCount && <small>暂无手牌</small>}
      </div>
      <div className="player-footer">
        <span>
          {p.alive ? (
            <>
              <i className={active ? 'on' : ''} />
              {active ? '行动中' : `${p.handCount} 张手牌`}
            </>
          ) : (
            '已阵亡'
          )}
        </span>
        <span title={modes[agent?.rsi]} className={agent?.rsi !== 'off' ? 'rsi-enabled' : ''}>
          <Icon name="bolt" size={11} />
          {agent?.rsi === 'off'
            ? 'RSI OFF'
            : `${agent?.rsi === 'both' ? '双' : agent?.rsi === 'immediate' ? '即时' : '轮次'} · ${memories}`}
        </span>
      </div>
    </article>
  );
}
function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
createRoot(document.getElementById('root')!).render(<App />);
