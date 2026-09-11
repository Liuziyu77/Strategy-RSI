import React from 'react';
import type { Consolidation, Memory, PlayerGameHistory } from '../src/types';
import { Icon } from './ui';

const modes = {
  consolidated: '归纳结果',
  immediate: '即时 RSI',
  round: '轮次 RSI · 赛后复盘',
  manual: '手动经验',
  import: '导入经验',
};
export function ExperienceGroups({
  memories,
  history,
  jobs,
  busy,
  canConsolidate,
  onConsolidate,
  onDelete,
  onWatch,
}: {
  memories: Memory[];
  history: PlayerGameHistory[];
  jobs: Consolidation[];
  busy: boolean;
  canConsolidate: boolean;
  onConsolidate: (matchId: string) => void;
  onDelete: (memoryId: string) => void;
  onWatch: (matchId: string, gameId: string) => void;
}) {
  const groups = new Map<string, { id: string | null; name: string; entries: Memory[] }>();
  for (const m of [...memories].reverse()) {
    const key = m.matchId ?? '';
    if (!groups.has(key))
      groups.set(key, {
        id: m.matchId ?? null,
        name: m.matchName ?? (m.matchId ? '历史对战' : '手动与导入经验'),
        entries: [],
      });
    groups.get(key)!.entries.push(m);
  }
  return (
    <div className="experience-groups">
      {[...groups.values()].map((group) => {
        const immediate = group.entries.filter((m) => m.mode === 'immediate'),
          round = group.entries.filter((m) => m.mode === 'round');
        const job = jobs.find((j) => j.matchId === group.id),
          running = job?.status === 'running';
        return (
          <section className="experience-group" key={group.id ?? 'unassigned'}>
            <header>
              <div>
                <span className="eyebrow">EXPERIENCE ARCHIVE</span>
                <h4>{group.name}</h4>
                <p>
                  {immediate.length} 条即时 / {round.length} 条轮次 · 共 {group.entries.length}{' '}
                  条记录
                </p>
              </div>
              {group.id && immediate.length + round.length > 0 && (
                <button
                  className="secondary compact"
                  disabled={busy || running || !canConsolidate}
                  title={
                    canConsolidate
                      ? '调用该玩家当前配置的模型，归纳本场各局的 RSI 经验'
                      : '请先为玩家配置模型 API'
                  }
                  onClick={() => onConsolidate(group.id!)}
                >
                  <Icon name="bolt" size={14} />
                  {running ? '正在归纳…' : '经验归纳'}
                </button>
              )}
            </header>
            {group.id && immediate.length + round.length > 0 && (
              <p className="experience-hint">
                {canConsolidate
                  ? '使用本玩家当前模型分批归纳，单批最多等待 3 分钟。原文保留；失败重试时复用匹配的已完成批次，归纳结果优先用于后续决策。'
                  : '为玩家配置模型 API 后，即可归纳本场经验。'}
              </p>
            )}
            {job && (
              <div className={`consolidation-status ${job.status}`} role="status">
                <strong>
                  {running
                    ? job.stage
                    : job.status === 'completed'
                      ? '归纳已保存'
                      : job.status === 'interrupted'
                        ? '归纳中断，可重新发起'
                        : '归纳失败，可重试'}
                </strong>
                <span>
                  {job.model} · 本次覆盖 {job.immediateCount} 条即时 / {job.roundCount} 条轮次 ·
                  已完成 {job.completedCalls} 次模型请求
                  {!!job.reusedCalls && ` · 已复用 ${job.reusedCalls} 批`}
                  {!!job.retryCount && ` · 已重试 ${job.retryCount} 次`}
                  {running && job.timeoutMs && ` · 单批最多等待 ${job.timeoutMs / 1000} 秒`}
                </span>
                {job.error && (
                  <p>
                    {job.error === 'The operation was aborted due to timeout'
                      ? '该次归纳等待模型响应超时，可重新归纳。'
                      : job.error}
                  </p>
                )}
              </div>
            )}
            <div className="experience-types">
              {Object.entries(modes).map(([mode, label]) => {
                const entries = group.entries.filter((m) => m.mode === mode);
                if (!entries.length) return null;
                return (
                  <details
                    className={`experience-type type-${mode}`}
                    key={mode}
                    open={mode === 'consolidated' || entries.length <= 6}
                  >
                    <summary>
                      <strong>{label}</strong>
                      <span>{entries.length} 条</span>
                      <Icon name="chevron" size={14} />
                    </summary>
                    <div className="profile-memories">
                      {entries.map((m) => {
                        const game = history.find((g) => g.gameId === m.gameId);
                        return (
                          <article
                            className={`memory-card ${m.active === false ? 'archived-memory' : ''}`}
                            key={m.id}
                          >
                            <div className="memory-card-header">
                              <span>
                                <i />
                                {m.gameNumber
                                  ? `第 ${m.gameNumber} 局`
                                  : mode === 'consolidated'
                                    ? '多局经验归纳'
                                    : '个人经验'}
                              </span>
                              <small>
                                {m.active === false
                                  ? mode === 'consolidated'
                                    ? '历史版本'
                                    : '已归纳 · 原文保留'
                                  : mode === 'consolidated'
                                    ? '用于后续决策'
                                    : label}
                              </small>
                            </div>
                            <p>{m.text}</p>
                            <footer>
                              <span>
                                {new Date(m.createdAt).toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })}
                              </span>
                              <div>
                                {game && (
                                  <button
                                    className="text-button"
                                    onClick={() => onWatch(game.matchId, game.gameId)}
                                  >
                                    来源牌局
                                    <Icon name="arrow" size={12} />
                                  </button>
                                )}
                                <button
                                  className="icon-button"
                                  disabled={busy || running}
                                  aria-label={`删除经验 ${m.id}`}
                                  title={
                                    mode === 'consolidated'
                                      ? '删除后使用上一归纳版本；无旧版本则恢复原文'
                                      : '删除此条经验'
                                  }
                                  onClick={() => onDelete(m.id)}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                            </footer>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
