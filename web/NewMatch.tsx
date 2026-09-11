import React, { useEffect, useState } from 'react';
import type { PlayerRecord, Role } from '../src/types';
import { randomRoles, ROLES } from '../src/roles';
import { Icon, modes } from './ui';

export function NewMatch({
  players,
  busy,
  onClose,
  onCreate,
  onManage,
}: {
  players: PlayerRecord[];
  busy: boolean;
  onClose: () => void;
  onCreate: (body: unknown) => void;
  onManage: () => void;
}) {
  const [ids, setIds] = useState<string[]>(
    Array.from(
      { length: Math.min(4, Math.max(2, players.length)) },
      (_, i) => players[i]?.id ?? '',
    ),
  );
  const [roles, setRoles] = useState<Role[]>(() => randomRoles(ids.length));
  const [roleMode, setRoleMode] = useState<'random' | 'fixed'>('random');
  const [name, setName] = useState('群雄逐鹿'),
    [games, setGames] = useState(1),
    [concurrency, setConcurrency] = useState(1),
    [chatEnabled, setChatEnabled] = useState(true),
    [contextChatMessages, setContextChatMessages] = useState(80),
    [pace, setPace] = useState(1000),
    [seed, setSeed] = useState(() => Math.floor(Math.random() * 2147483648)),
    [cap, setCap] = useState(1800),
    [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [busy, onClose]);
  return (
    <div className="modal-backdrop">
      <form
        className="modal match-builder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate({
            name,
            playerIds: ids,
            games,
            concurrency,
            chatEnabled,
            contextChatMessages,
            paceMs: pace,
            seed,
            maxDecisions: cap,
            roleMode,
            roleAssignments: Object.fromEntries(ids.map((id, i) => [id, roles[i]])),
          });
        }}
      >
        <header>
          <div>
            <span className="eyebrow">GATHER THE STRATEGISTS</span>
            <h2 id="dialog-title">创建一场对战</h2>
            <p>从玩家库邀请入座，带上各自的模型与经验。</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭创建对战"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">
          <div className="form-row">
            <label>
              对战名称
              <input
                autoFocus
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              玩家人数
              <select
                aria-label="玩家人数"
                value={ids.length}
                onChange={(e) => {
                  setIds((old) =>
                    Array.from(
                      { length: +e.target.value },
                      (_, i) =>
                        old[i] ??
                        players.filter((p) => !old.includes(p.id))[i - old.length]?.id ??
                        '',
                    ),
                  );
                  setRoles(randomRoles(+e.target.value));
                }}
              >
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} 人
                  </option>
                ))}
              </select>
            </label>
            <label>
              总局数
              <input
                type="number"
                min={1}
                max={100}
                value={games}
                onChange={(e) => {
                  setGames(+e.target.value);
                  setConcurrency((old) => Math.min(old, Math.max(1, +e.target.value)));
                }}
              />
            </label>
            <label>
              并行局数
              <input
                aria-label="并行局数"
                type="number"
                min={1}
                max={Math.max(1, games)}
                value={concurrency}
                onChange={(e) => setConcurrency(+e.target.value)}
              />
            </label>
          </div>
          <p className="form-hint">
            同时运行最多 {concurrency} 局，其余依次开局。各局可独立观摩，RSI 经验共同归入参战玩家。
          </p>
          <div className="role-allocation">
            <label>
              身份分配
              <select
                aria-label="身份分配"
                value={roleMode}
                onChange={(e) => setRoleMode(e.target.value as 'random' | 'fixed')}
              >
                <option value="random">每局随机身份</option>
                <option value="fixed">固定玩家身份</option>
              </select>
            </label>
            <div>
              <strong>
                {roleMode === 'random' ? '下方显示首局随机结果' : '下方身份用于本场全部牌局'}
              </strong>
              <p>可直接调整身份，系统会交换另一位玩家的身份，保持人数配比。</p>
            </div>
            <button
              type="button"
              className="secondary compact"
              onClick={() => {
                setRoles(randomRoles(ids.length));
                setRoleMode('random');
              }}
            >
              重新随机分配
            </button>
          </div>
          <label className="chat-setting">
            <input
              type="checkbox"
              checked={chatEnabled}
              onChange={(e) => setChatEnabled(e.target.checked)}
            />
            <span>
              <strong>开启 Agent 牌局聊天</strong>
              <small>由玩家自主选择发言或沉默。本局公开对话供后续决策参考。</small>
            </span>
          </label>
          <div className="seat-picker-heading">
            <h3>
              入座名单{' '}
              <span>
                {ids.filter(Boolean).length} / {ids.length}
              </span>
            </h3>
            <button type="button" className="text-button" onClick={onManage}>
              <Icon name="users" size={15} />
              管理玩家库
              <Icon name="arrow" size={13} />
            </button>
          </div>
          {!players.length && (
            <div className="seat-empty">
              <Icon name="users" size={26} />
              <p>玩家库还是空的。先创建玩家，再邀请他们入座。</p>
              <button className="secondary" type="button" onClick={onManage}>
                前往玩家库
              </button>
            </div>
          )}
          <div className="seat-picker-grid">
            {ids.map((id, i) => {
              const p = players.find((p) => p.id === id);
              return (
                <div
                  key={i}
                  className={`seat-picker ${p ? 'occupied' : ''}`}
                  style={{ '--player-color': p?.color ?? '#86b2a0' } as React.CSSProperties}
                >
                  <div className="seat-picker-top">
                    <span>SEAT {String(i + 1).padStart(2, '0')}</span>
                    <small>{roles[i]}</small>
                  </div>
                  <label>
                    <span className="sr-only">座位 {i + 1} 玩家</span>
                    <select
                      aria-label={`座位 ${i + 1} 玩家`}
                      value={id}
                      required
                      onChange={(e) =>
                        setIds((old) => old.map((x, n) => (n === i ? e.target.value : x)))
                      }
                    >
                      <option value="">选择玩家</option>
                      {players.map((player) => (
                        <option
                          key={player.id}
                          value={player.id}
                          disabled={ids.some((x, n) => n !== i && x === player.id)}
                        >
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="seat-role-picker">
                    <span>游戏身份</span>
                    <select
                      aria-label={`座位 ${i + 1} 身份`}
                      value={roles[i]}
                      onChange={(e) => {
                        const role = e.target.value as Role;
                        setRoles((old) => {
                          const next = [...old],
                            other = next.findIndex((r, n) => n !== i && r === role);
                          if (other >= 0) [next[i], next[other]] = [next[other], next[i]];
                          return next;
                        });
                        setRoleMode('fixed');
                      }}
                    >
                      {[...new Set(ROLES[ids.length])].map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  {p ? (
                    <div className="seat-player-preview">
                      <span className="seat-portrait">{p.name[0]}</span>
                      <div>
                        <strong>
                          {p.hero}
                          <small>
                            {p.kind === 'llm' ? 'API' : p.kind === 'external' ? 'EXT' : 'LOCAL'}
                          </small>
                        </strong>
                        <p title={p.model}>
                          {p.kind === 'llm'
                            ? p.model
                            : p.kind === 'external'
                              ? '外部 Agent'
                              : '本地策略'}
                        </p>
                        <span>
                          <Icon name="bolt" size={11} />
                          {modes[p.rsi]} <i>·</i> {p.stats.memories} 条经验
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="seat-placeholder">虚位以待</p>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="text-button advanced-toggle"
            onClick={() => setAdvanced(!advanced)}
          >
            <Icon name="gear" size={14} />
            {advanced ? '收起' : '展开'}实验参数
          </button>
          {advanced && (
            <div className="form-row advanced">
              <label>
                随机种子
                <input
                  type="number"
                  min={0}
                  max={2147483647}
                  value={seed}
                  onChange={(e) => setSeed(+e.target.value)}
                />
              </label>
              <label>
                行动间隔 (ms)
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={pace}
                  onChange={(e) => setPace(+e.target.value)}
                />
              </label>
              <label>
                每局决策上限
                <input
                  type="number"
                  min={20}
                  max={10000}
                  value={cap}
                  onChange={(e) => setCap(+e.target.value)}
                />
              </label>
              <label>
                聊天上下文条数
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={contextChatMessages}
                  disabled={!chatEnabled}
                  onChange={(e) => setContextChatMessages(+e.target.value)}
                />
              </label>
            </div>
          )}
          <p className="form-hint">
            {roleMode === 'random'
              ? '首局按上方结果分配，后续每局重新随机身份。'
              : '身份绑定玩家，后续各局沿用上方分配。'}
            多局自动轮换座位，由主公先行动。经验始终跟随玩家。
          </p>
        </div>
        <footer>
          <span>
            <Icon name="eye" size={15} />
            就座之后，即可观战
          </span>
          <button
            className="primary"
            disabled={
              busy || !name.trim() || ids.some((id) => !id) || new Set(ids).size !== ids.length
            }
          >
            {busy ? '正在创建…' : '开始对战'}
            <Icon name="arrow" />
          </button>
        </footer>
      </form>
    </div>
  );
}
