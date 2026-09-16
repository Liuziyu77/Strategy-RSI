import React, { useEffect, useRef, useState } from 'react';
import type {
  Memory,
  PlayerProfile,
  PlayerRecord,
  PlayerGameHistory,
  PlayerMatchHistory,
  Consolidation,
} from '../src/types';
import { api, post, Icon, modes, colors, heroNames, statuses } from './ui';
import { ExperienceGroups } from './ExperienceGroups';
import { GAME_CATALOG } from '../src/games/catalog';
import type { GameType } from '../src/games/core';

type Detail = PlayerRecord & {
  memories: Memory[];
  history: PlayerGameHistory[];
  matchHistory: PlayerMatchHistory[];
  consolidations: Consolidation[];
};
const winRate = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 1000) / 10}%`;
const kindNames = { llm: '模型 API', heuristic: '本地策略', external: '外部 Agent' };
const date = (value: string) => new Date(value).toLocaleDateString('zh-CN');
const dateTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
function duration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return '不足 1 秒';
  const seconds = Math.floor(ms / 1000),
    hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours} 小时 ` : ''}${minutes || hours ? `${minutes} 分 ` : ''}${seconds % 60} 秒`;
}

export function PlayerLibrary({
  config,
  players,
  initialId,
  onRefresh,
  onWatch,
}: {
  config: any;
  players: PlayerRecord[];
  initialId: string;
  onRefresh: () => Promise<void>;
  onWatch: (matchId: string, gameId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(initialId || players[0]?.id || '');
  const [detail, setDetail] = useState<Detail | null>(null),
    [tab, setTab] = useState('overview');
  const [search, setSearch] = useState(''),
    [editor, setEditor] = useState<PlayerProfile | 'new' | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [memoryGame, setMemoryGame] = useState<GameType>('sanguosha');
  useEffect(() => {
    if (!selectedId && players.length) setSelectedId(players[0].id);
  }, [players, selectedId]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api<Detail>(`/players/${selectedId}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, players]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const choose = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setText('');
    setNotice('');
  };
  const filtered = players.filter((p) =>
    `${p.name} ${p.hero} ${p.model}`.toLowerCase().includes(search.toLowerCase()),
  );
  const profile = detail?.id === selectedId ? detail : null;
  return (
    <main className="full-page library-page">
      <div className="library-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-diamond" /> THE STRATEGISTS
          </div>
          <h1>
            群英册 <span>玩家库</span>
          </h1>
          <p>一位玩家，一段成长。配置策略，积累经验，再赴牌局。</p>
        </div>
        <button className="primary" onClick={() => setEditor('new')}>
          <Icon name="plus" />
          创建玩家
        </button>
      </div>
      <div className="library-metrics">
        <div>
          <Icon name="users" />
          <strong>{players.length.toString().padStart(2, '0')}</strong>
          <span>在册玩家</span>
        </div>
        <div>
          <Icon name="bolt" />
          <strong>
            {players
              .filter((p) => p.rsi !== 'off')
              .length.toString()
              .padStart(2, '0')}
          </strong>
          <span>开启 RSI</span>
        </div>
        <div>
          <Icon name="book" />
          <strong>
            {players
              .reduce((n, p) => n + p.stats.memories, 0)
              .toString()
              .padStart(2, '0')}
          </strong>
          <span>累积经验</span>
        </div>
        <div className="metrics-note">
          养成各自的策略
          <br />
          <b>留下每一次交锋。</b>
        </div>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="library-notice" role="status">
          <Icon name="check" size={16} />
          {notice}
        </div>
      )}
      {!players.length ? (
        <div className="library-empty">
          <div className="empty-roster-art">
            <span>将</span>
            <span>策</span>
            <span>谋</span>
          </div>
          <h2>为第一位玩家立传</h2>
          <p>保存名字、模型与学习方式，今后开局直接入座。</p>
          <button className="primary" onClick={() => setEditor('new')}>
            <Icon name="plus" />
            创建第一位玩家
          </button>
        </div>
      ) : (
        <div className="library-layout">
          <aside className="roster-sidebar">
            <label className="roster-search">
              <Icon name="search" size={17} />
              <input
                aria-label="搜索玩家"
                placeholder="搜索玩家、武将、模型"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="roster-label">
              全部玩家 <span>{filtered.length}</span>
            </div>
            <div className="roster-list">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  className={`roster-item ${p.id === selectedId ? 'selected' : ''}`}
                  style={{ '--player-color': p.color } as React.CSSProperties}
                  onClick={() => choose(p.id)}
                >
                  <span className="roster-avatar">
                    {p.name.slice(0, 1)}
                    <i />
                  </span>
                  <span className="roster-identity">
                    <strong>{p.name}</strong>
                    <small>{p.kind === 'llm' ? p.model : kindNames[p.kind]}</small>
                    <span>
                      {p.hero} <i>·</i> {modes[p.rsi]}
                    </span>
                  </span>
                  <Icon name="chevron" size={15} />
                </button>
              ))}
              {!filtered.length && <p className="empty-small">没有匹配的玩家。</p>}
            </div>
            <p className="roster-footnote">
              玩家资料、经验与战绩
              <br />
              始终保存在同一份档案中。
            </p>
          </aside>
          <section className="profile-detail" aria-label="玩家详情">
            {!profile ? (
              <div className="profile-loading">正在打开玩家档案…</div>
            ) : (
              <>
                <div
                  className="profile-banner"
                  style={{ '--player-color': profile.color } as React.CSSProperties}
                >
                  <div className="profile-banner-art" aria-hidden="true">
                    {profile.hero[0]}
                  </div>
                  <div className="profile-avatar">
                    {profile.name.slice(0, 1)}
                    <small>{profile.hero}</small>
                  </div>
                  <div className="profile-title">
                    <span className="eyebrow">PLAYER DOSSIER</span>
                    <h2>{profile.name}</h2>
                    <div className="profile-tags">
                      <span>{kindNames[profile.kind]}</span>
                      <span className={profile.rsi === 'off' ? '' : 'learning'}>
                        <Icon name="bolt" size={12} />
                        {modes[profile.rsi]}
                      </span>
                    </div>
                  </div>
                  <button className="secondary" onClick={() => setEditor(profile)}>
                    <Icon name="edit" size={15} />
                    编辑玩家
                  </button>
                </div>
                <div className="profile-scoreboard">
                  <div>
                    <strong>{profile.stats.games}</strong>
                    <span>参与牌局</span>
                  </div>
                  <div>
                    <strong>{profile.stats.wins}</strong>
                    <span>胜利场次</span>
                  </div>
                  <div>
                    <strong>{winRate(profile.stats.winRate)}</strong>
                    <span>全部牌局胜率</span>
                  </div>
                  <div>
                    <strong>{profile.stats.memories}</strong>
                    <span>个人经验</span>
                  </div>
                </div>
                <div className="profile-tabs" role="tablist" aria-label="玩家档案内容">
                  {[
                    ['overview', '玩家资料'],
                    ['memories', '个人经验'],
                    ['history', '参战历史'],
                  ].map(([id, label]) => (
                    <button
                      role="tab"
                      aria-selected={tab === id}
                      key={id}
                      className={tab === id ? 'active' : ''}
                      onClick={() => setTab(id)}
                    >
                      {label}
                      {id === 'memories' && <small>{profile.stats.memories}</small>}
                      {id === 'history' && <small>{profile.stats.games}</small>}
                    </button>
                  ))}
                </div>
                <div className="profile-content" role="tabpanel">
                  {tab === 'overview' ? (
                    <>
                      <div className="profile-section-title">
                        <span>01 / CONFIGURATION</span>
                        <h3>策略与连接</h3>
                      </div>
                      <dl className="profile-fields">
                        <div>
                          <dt>默认武将</dt>
                          <dd>{profile.hero}</dd>
                        </div>
                        <div>
                          <dt>控制方式</dt>
                          <dd>{kindNames[profile.kind]}</dd>
                        </div>
                        <div>
                          <dt>API 服务</dt>
                          <dd>
                            {profile.apiMode === 'custom'
                              ? '专属 API'
                              : (config?.providers.find((p: any) => p.id === profile.provider)
                                  ?.name ?? '未配置')}
                          </dd>
                        </div>
                        <div>
                          <dt>模型</dt>
                          <dd>{profile.model || '本地策略，无需模型'}</dd>
                        </div>
                        {profile.apiMode === 'custom' && (
                          <div className="wide">
                            <dt>API 基础地址</dt>
                            <dd>
                              {profile.baseUrl}
                              <span className="key-status">
                                <Icon name="check" size={12} />
                                密钥已保存
                              </span>
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>学习方式</dt>
                          <dd>{modes[profile.rsi]}</dd>
                        </div>
                        <div>
                          <dt>创建日期</dt>
                          <dd>{date(profile.createdAt)}</dd>
                        </div>
                      </dl>
                      <div className="profile-note">
                        <Icon name="book" />
                        <div>
                          <h4>玩家备注</h4>
                          <p>
                            {profile.description ||
                              '还没有备注。可以记录这位玩家的定位、实验目标或模型特点。'}
                          </p>
                        </div>
                      </div>
                      <div className="profile-id">
                        档案 ID <code>{profile.id}</code>
                        <span>修改资料后，已有牌局仍保留开局时的配置。</span>
                      </div>
                    </>
                  ) : tab === 'memories' ? (
                    <>
                      <div className="profile-section-title with-actions">
                        <div>
                          <span>02 / EXPERIENCE</span>
                          <h3>把交锋化作经验</h3>
                        </div>
                        <div className="button-group">
                          <button
                            className="secondary compact"
                            disabled={busy}
                            onClick={() => fileRef.current?.click()}
                          >
                            <Icon name="plus" size={14} />
                            导入经验
                          </button>
                          <a
                            className="secondary compact"
                            href={`/api/memories/export?agentId=${encodeURIComponent(profile.id)}`}
                          >
                            <Icon name="download" size={14} />
                            导出经验
                          </a>
                        </div>
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        hidden
                        accept=".json,.txt"
                        onChange={(e) => {
                          const file = e.target.files?.[0],
                            owner = profile.id;
                          e.target.value = '';
                          if (file)
                            void run(async () => {
                              const raw = await file.text();
                              const body = file.name.toLowerCase().endsWith('.txt')
                                ? [{ text: raw, gameType: memoryGame }]
                                : JSON.parse(raw);
                              const result = await post(`/players/${owner}/memories/import`, body);
                              setNotice(`已向此玩家导入 ${result.imported} 条经验`);
                            });
                        }}
                      />
                      <p className="section-explainer">
                        经验只用于同一玩家的同类游戏。手动经验与 TXT 按下方所选游戏保存；JSON
                        保留每条 gameType，未标记的旧数据默认三国杀。导出包含全部游戏的经验。
                      </p>
                      <form
                        className="profile-memory-compose"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await post(`/players/${profile.id}/memories`, {
                              text,
                              gameType: memoryGame,
                            });
                            setText('');
                            setNotice('经验已保存');
                          });
                        }}
                      >
                        <label htmlFor="player-memory-game">经验所属游戏</label>
                        <select
                          id="player-memory-game"
                          value={memoryGame}
                          onChange={(e) => setMemoryGame(e.target.value as GameType)}
                        >
                          {Object.values(GAME_CATALOG).map((game) => (
                            <option key={game.id} value={game.id}>
                              {game.name.zh}
                            </option>
                          ))}
                        </select>
                        <label htmlFor="player-memory">添加经验</label>
                        <textarea
                          id="player-memory"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          rows={3}
                          maxLength={4000}
                          placeholder="写下可在下一局复用的策略或观察…"
                        />
                        <button className="primary compact" disabled={busy || !text.trim()}>
                          <Icon name="plus" size={15} />
                          保存经验
                        </button>
                      </form>
                      <ExperienceGroups
                        memories={profile.memories}
                        history={profile.history}
                        jobs={profile.consolidations ?? []}
                        busy={busy}
                        canConsolidate={
                          !!profile.model &&
                          (profile.apiMode === 'custom'
                            ? profile.hasApiKey
                            : !!config?.providers.find((p: any) => p.id === profile.provider)
                                ?.configured)
                        }
                        onWatch={onWatch}
                        onConsolidate={(matchId) =>
                          void run(async () => {
                            await post(`/players/${profile.id}/memories/consolidate`, { matchId });
                            setNotice(
                              '已开始归纳，本次覆盖已有的即时与轮次经验；期间新产生的经验会单独保留。',
                            );
                          })
                        }
                        onDelete={(memoryId) =>
                          void run(async () => {
                            await api(`/players/${profile.id}/memories/${memoryId}`, {
                              method: 'DELETE',
                            });
                            setNotice('经验已删除');
                          })
                        }
                      />
                      {!profile.memories.length && (
                        <div className="profile-empty">
                          <Icon name="book" size={30} />
                          <h3>第一条经验，尚待落笔</h3>
                          <p>开启 RSI 自动总结，或在上方手动添加。</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="profile-section-title">
                        <span>03 / BATTLE RECORD</span>
                        <h3>按对战记录，每一局可回看</h3>
                        <p className="history-duration-note">
                          时长按开局至最后一条游戏事件计算，包含中途暂停，不含赛后复盘。
                        </p>
                      </div>
                      <div className="history-overall" aria-label="全部对战统计">
                        <div>
                          <span>全部牌局胜率</span>
                          <strong>{winRate(profile.stats.winRate)}</strong>
                        </div>
                        <p>
                          参与 {profile.stats.matches} 场对战 · 已结束 {profile.stats.finished} 局
                          <br />
                          {profile.stats.wins} 胜 / {profile.stats.losses} 负 /{' '}
                          {profile.stats.draws} 平
                        </p>
                        <small>胜率 = 获胜局数 ÷ 已结束局数；平局计入分母，未结束局不计入。</small>
                      </div>
                      <div className="player-history-list">
                        {profile.matchHistory.map((match) => (
                          <details className="match-history-group" key={match.matchId} open>
                            <summary>
                              <div className="match-history-title">
                                <strong>{match.matchName}</strong>
                                <small>
                                  {date(match.createdAt)} · {statuses[match.status] ?? match.status}{' '}
                                  · 已结束 {match.stats.finished} / 计划 {match.plannedGames} 局
                                </small>
                              </div>
                              <div className="match-history-score">
                                <strong>{winRate(match.stats.winRate)}</strong>
                                <span>本场胜率</span>
                              </div>
                              <span className="match-history-results">
                                {match.stats.wins} 胜 / {match.stats.losses} 负 /{' '}
                                {match.stats.draws} 平
                              </span>
                              <Icon name="chevron" size={16} />
                            </summary>
                            <div className="match-history-games">
                              {profile.history
                                .filter((g) => g.matchId === match.matchId)
                                .map((g) => (
                                  <button
                                    key={g.gameId}
                                    className="player-history-row"
                                    onClick={() => onWatch(g.matchId, g.gameId)}
                                  >
                                    <span
                                      className={`result-medal ${g.won ? 'won' : g.status === 'finished' ? 'lost' : ''}`}
                                    >
                                      <Icon name={g.won ? 'trophy' : 'arena'} size={21} />
                                    </span>
                                    <span className="history-game-name">
                                      <strong>{g.matchName}</strong>
                                      <small>
                                        第 {g.number} 局 · {g.playerCount} 人局 · {g.hero} ·{' '}
                                        {g.role}
                                        {g.name !== profile.name ? ` · 当时名为 ${g.name}` : ''}
                                      </small>
                                      <span className="history-metrics">
                                        <span className="history-duration">
                                          <Icon name="clock" size={13} />
                                          <span>
                                            {g.status === 'finished' ? '对局时长' : '已记录时长'}{' '}
                                            <b>{duration(g.durationMs)}</b>
                                          </span>
                                        </span>
                                        <span
                                          className="history-rounds"
                                          title={`共推进 ${g.turn} 个玩家回合`}
                                        >
                                          轮次 <b>{g.round} 轮</b>
                                        </span>
                                        <span className="history-decisions">
                                          行动 <b>{g.decisionCount} 次</b>
                                        </span>
                                      </span>
                                      <span className="history-timestamps">
                                        <span>
                                          开局{' '}
                                          <time dateTime={g.startedAt}>
                                            {dateTime(g.startedAt)}
                                          </time>
                                        </span>
                                        <span>
                                          {g.endedAt ? '结束' : '最近记录'}{' '}
                                          <time dateTime={g.endedAt ?? g.lastEventAt}>
                                            {dateTime(g.endedAt ?? g.lastEventAt)}
                                          </time>
                                        </span>
                                      </span>
                                    </span>
                                    <span className="history-result">
                                      <strong>
                                        {g.status === 'finished'
                                          ? g.winner === '平局'
                                            ? '平局'
                                            : g.won
                                              ? '获胜'
                                              : '落败'
                                          : (statuses[g.matchStatus] ?? '未结束')}
                                      </strong>
                                      <small>查看牌局</small>
                                    </span>
                                    <Icon name="arrow" size={17} />
                                  </button>
                                ))}
                            </div>
                          </details>
                        ))}
                      </div>
                      {!profile.history.length && (
                        <div className="profile-empty">
                          <Icon name="arena" size={30} />
                          <h3>尚未出征</h3>
                          <p>新建对战时选择这位玩家，牌局会自动归档到这里。</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {editor && (
        <PlayerEditor
          key={typeof editor === 'string' ? 'new' : editor.id}
          profile={editor === 'new' ? null : editor}
          config={config}
          onClose={() => setEditor(null)}
          onSaved={async (p) => {
            await onRefresh();
            setSelectedId(p.id);
            setTab('overview');
            setEditor(null);
            setNotice('玩家资料已保存');
          }}
        />
      )}
    </main>
  );
}

function PlayerEditor({
  profile,
  config,
  onClose,
  onSaved,
}: {
  profile: PlayerProfile | null;
  config: any;
  onClose: () => void;
  onSaved: (p: PlayerProfile) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: profile?.name ?? '',
    kind: profile?.kind ?? 'heuristic',
    hero: profile?.hero ?? '张飞',
    rsi: profile?.rsi ?? 'off',
    description: profile?.description ?? '',
    color: profile?.color ?? colors[1],
    provider:
      profile?.apiMode === 'custom'
        ? 'custom'
        : (profile?.provider ?? config?.providers[0]?.id ?? 'default'),
    model: profile?.model ?? config?.providers[0]?.models[0] ?? '',
    baseUrl: profile?.baseUrl ?? '',
    apiKey: '',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [busy, onClose]);
  const needApi = form.kind === 'llm' || form.rsi !== 'off';
  return (
    <div className="modal-backdrop">
      <form
        className="modal player-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-editor-title"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const result = await api<PlayerProfile>(
              profile ? `/players/${profile.id}` : '/players',
              {
                method: profile ? 'PUT' : 'POST',
                body: JSON.stringify({
                  ...form,
                  provider: form.provider === 'custom' ? 'default' : form.provider,
                  apiMode: form.provider === 'custom' ? 'custom' : 'provider',
                }),
              },
            );
            await onSaved(result);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <header>
          <div>
            <span className="eyebrow">CRAFT A STRATEGIST</span>
            <h2 id="player-editor-title">{profile ? '编辑玩家' : '创建玩家'}</h2>
            <p>让名字、策略与经验，拥有长期的归属。</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭玩家编辑"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <div className="editor-identity">
            <span
              className="editor-avatar"
              style={{ '--player-color': form.color } as React.CSSProperties}
            >
              {form.name[0] || '将'}
            </span>
            <div className="editor-identity-fields">
              <label>
                玩家名字
                <input
                  autoFocus
                  required
                  maxLength={40}
                  value={form.name}
                  placeholder="为这位玩家起个名字"
                  onChange={(e) => update('name', e.target.value)}
                />
              </label>
              <div className="color-choices" aria-label="档案颜色">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`选择颜色 ${color}`}
                    aria-pressed={form.color === color}
                    style={{ background: color }}
                    onClick={() => update('color', color)}
                  >
                    {form.color === color && <Icon name="check" size={12} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="editor-grid">
            <label>
              控制方式
              <select
                aria-label="控制方式"
                value={form.kind}
                onChange={(e) => update('kind', e.target.value)}
              >
                <option value="heuristic">本地策略</option>
                <option value="llm">模型 API</option>
                <option value="external">外部 Agent</option>
              </select>
            </label>
            <label>
              默认武将
              <select
                aria-label="默认武将"
                value={form.hero}
                onChange={(e) => update('hero', e.target.value)}
              >
                {heroNames.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="wide">
              RSI 学习方式
              <select
                aria-label="RSI 学习方式"
                value={form.rsi}
                onChange={(e) => update('rsi', e.target.value)}
              >
                {Object.entries(modes).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="rsi-explanation">
            <Icon name="bolt" size={16} />
            {form.rsi === 'off'
              ? '保留并使用已有经验，本次不自动总结。'
              : form.rsi === 'immediate'
                ? '每次有选择的行动后，判断是否值得记住。'
                : form.rsi === 'round'
                  ? '每局结束后复盘，让下一局带着经验开始。'
                  : '行动后即时反思，每局结束后再进行整体复盘。'}
          </div>
          <fieldset className="api-settings">
            <legend>
              <Icon name="arena" size={15} />
              API 连接 {needApi ? '' : '（可选）'}
            </legend>
            <label>
              API 服务
              <select
                aria-label="API 服务"
                value={form.provider}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    provider: e.target.value,
                    model:
                      e.target.value === 'custom'
                        ? f.model
                        : (config?.providers.find((p: any) => p.id === e.target.value)?.models[0] ??
                          ''),
                  }))
                }
              >
                {!config?.providers.length && <option value="default">未配置共享 API</option>}
                {config?.providers.map((p: any) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                    {p.configured ? '' : ' · 未配置密钥'}
                  </option>
                ))}
                <option value="custom">自定义专属 API</option>
              </select>
            </label>
            {form.provider === 'custom' ? (
              <>
                <label>
                  API 基础地址
                  <input
                    type="url"
                    required
                    placeholder="https://api.example.com/v1"
                    value={form.baseUrl}
                    onChange={(e) => update('baseUrl', e.target.value)}
                  />
                </label>
                <label>
                  API Key
                  <input
                    type="password"
                    autoComplete="new-password"
                    required={!profile?.hasApiKey}
                    placeholder={
                      profile?.hasApiKey ? '已保存；留空沿用现有密钥' : '输入此玩家的 API 密钥'
                    }
                    value={form.apiKey}
                    onChange={(e) => update('apiKey', e.target.value)}
                  />
                </label>
                <label>
                  模型名称
                  <input
                    required
                    maxLength={150}
                    placeholder="服务商提供的模型 ID"
                    value={form.model}
                    onChange={(e) => update('model', e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label>
                模型
                <select
                  aria-label="模型"
                  value={form.model}
                  onChange={(e) => update('model', e.target.value)}
                >
                  <option value="">请选择模型</option>
                  {config?.providers
                    .find((p: any) => p.id === form.provider)
                    ?.models.map((m: string) => (
                      <option key={m}>{m}</option>
                    ))}
                </select>
              </label>
            )}
          </fieldset>
          <label className="editor-note">
            玩家备注
            <textarea
              rows={3}
              maxLength={1000}
              value={form.description}
              placeholder="记录玩家定位、实验目标或模型特点"
              onChange={(e) => update('description', e.target.value)}
            />
          </label>
        </div>
        <footer>
          <span>{profile ? '更新后用于新创建的牌局' : '经验和参战记录将自动绑定此玩家'}</span>
          <button className="primary" disabled={busy || !form.name.trim()}>
            {busy ? '正在保存…' : '保存玩家'}
            <Icon name="arrow" size={17} />
          </button>
        </footer>
      </form>
    </div>
  );
}
