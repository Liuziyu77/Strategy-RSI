import React, { useState } from 'react';
import { GameSymbol } from './GameSymbols';
import type { ArenaObservation, Locale } from '../src/games/core';
import type { GameEvent } from '../src/types';
import { roleName, phaseName } from '../src/games/werewolf-labels';

type Cell = { type: string; color: string; square: string; label?: string } | null;
const shapes: Record<string, React.ReactNode> = {
  p: (
    <>
      <circle cx="24" cy="14" r="7" />
      <path d="M19 21h10l-2 8 6 9H15l6-9Z" />
    </>
  ),
  r: (
    <>
      <path d="M12 9h6v6h4V9h4v6h4V9h6v13l-5 4v12H17V26l-5-4Z" />
      <path d="M17 23h14M17 32h14" />
    </>
  ),
  n: (
    <>
      <path d="m14 37 2-9 10-8-10 2-5-4 8-9 1-5 6 5c13 1 13 18 10 28Z" />
      <path d="m18 30 10-6" />
      <circle cx="23" cy="14" r="1.4" fill="currentColor" />
    </>
  ),
  b: (
    <>
      <path d="M24 5c-2 5-10 8-10 15 0 5 5 7 10 7s10-2 10-7c0-7-8-10-10-15Zm-5 23-5 10h20l-5-10Z" />
      <path d="m25 12-5 9" />
    </>
  ),
  q: (
    <>
      <path d="m10 13 6 20h16l6-20-10 9-4-13-4 13Z" />
      <path d="M16 33h16l3 5H13Z" />
      <circle cx="10" cy="11" r="2.5" />
      <circle cx="24" cy="7" r="2.5" />
      <circle cx="38" cy="11" r="2.5" />
    </>
  ),
  k: (
    <>
      <path d="M24 3v10m-5-6h10" />
      <path d="M24 17c-12-12-21 2-10 12l3 8h14l3-8c11-10 2-24-10-12Z" />
      <path d="M15 29h18M18 33h12" />
    </>
  ),
};
function ChessPiece({ type, white }: { type: string; white: boolean }) {
  return (
    <svg
      className={`chess-piece ${white ? 'white' : 'black'}`}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        {shapes[type]}
        <path d="M12 39h24l2 5H10Z" />
      </g>
    </svg>
  );
}
function RiverGrid() {
  return (
    <svg className="river-grid" viewBox="0 0 900 1000" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        {Array.from({ length: 10 }, (_, y) => (
          <path key={`h${y}`} d={`M50 ${50 + y * 100}H850`} />
        ))}
        {Array.from({ length: 9 }, (_, x) => (
          <path
            key={`v${x}`}
            d={
              x === 0 || x === 8
                ? `M${50 + x * 100} 50V950`
                : `M${50 + x * 100} 50V450M${50 + x * 100} 550V950`
            }
          />
        ))}
        <path d="M350 50 550 250M550 50 350 250M350 750 550 950M550 750 350 950" />
        {[1, 7].flatMap((x) =>
          [2, 7].map((y) => (
            <path
              key={`${x}-${y}`}
              d={`M${x * 100 + 38} ${y * 100 + 26}v12h-12m36-12v12h12m-36 36v-12h-12m36 12v-12h12`}
            />
          )),
        )}
      </g>
      <g className="river-label" fill="currentColor" fontSize="38" textAnchor="middle">
        <text x="250" y="514">
          楚 河
        </text>
        <text x="650" y="514">
          汉 界
        </text>
      </g>
    </svg>
  );
}
export function GameBoard({
  view,
  locale,
  lastMove,
}: {
  view: ArenaObservation;
  locale: Locale;
  lastMove?: GameEvent;
}) {
  const [flipped, setFlipped] = useState(false);
  const en = locale === 'en',
    t = (zh: string, english: string) => (en ? english : zh);
  if (view.gameType === 'werewolf') {
    const day = ['discussion', 'vote', 'hunter'].includes(view.phase),
      alive = view.players.filter((p) => p.alive).length;
    const marks: Record<string, string> = {
      wolf: '☾',
      seer: '◈',
      witch: '⚗',
      hunter: '⌖',
      villager: '♧',
    };
    return (
      <div
        className={`wolf-table ${day ? 'is-day' : 'is-night'}`}
        aria-label={t('狼人杀场地', 'Werewolf table')}
      >
        <div className="wolf-phase">
          <div className="phase-orb" aria-hidden="true">
            {day ? '☀' : <GameSymbol type="werewolf" />}
          </div>
          <span className="eyebrow">
            {day ? 'DAYLIGHT' : 'AFTER DARK'} / {String(view.round).padStart(2, '0')}
          </span>
          <h2>{phaseName(view.phase, locale)}</h2>
          <p>
            {alive} / {view.players.length} {t('位玩家存活', 'players alive')}
            <span> · </span>
            {view.viewer === -1
              ? t('全知视角', 'All roles visible')
              : t('身份仅对本人可见', 'Your perspective')}
          </p>
        </div>
        <div className="wolf-phase-track">
          {[t('夜间行动', 'Night actions'), t('白天讨论', 'Discussion'), t('投票放逐', 'Vote')].map(
            (label, i) => (
              <span
                key={label}
                className={
                  (!day && i === 0) ||
                  (view.phase === 'discussion' && i === 1) ||
                  (view.phase === 'vote' && i === 2)
                    ? 'active'
                    : ''
                }
              >
                <i>{i + 1}</i>
                {label}
              </span>
            ),
          )}
        </div>
        <div className="wolf-seats">
          {view.players.map((p) => (
            <article
              key={p.seat}
              className={`${p.alive ? '' : 'eliminated'} ${view.active === p.seat && p.alive ? 'acting' : ''}`}
            >
              <div className="wolf-seat-top">
                <small>
                  {t('席位', 'SEAT')} {String(p.seat + 1).padStart(2, '0')}
                </small>
                <i className={p.alive ? 'alive-dot' : ''} />
              </div>
              <div className={`role-emblem role-${p.role}`} aria-hidden="true">
                {p.role === 'wolf' ? <GameSymbol type="werewolf" /> : (marks[p.role] ?? '?')}
              </div>
              <h3>{p.name}</h3>
              <strong>{roleName(p.role, locale)}</strong>
              <p>
                {p.alive
                  ? view.active === p.seat
                    ? t('正在行动', 'Acting now')
                    : t('存活', 'Alive')
                  : t('已出局', 'Eliminated')}
              </p>
            </article>
          ))}
        </div>
        {!!view.details?.visions && (
          <p className="seer-notes">
            {t('预言家查验', 'Seer observations')}:{' '}
            {Object.entries(view.details.visions as Record<string, boolean>)
              .map(
                ([seat, wolf]) =>
                  `${+seat + 1}: ${wolf ? roleName('wolf', locale) : t('非狼人', 'Not a werewolf')}`,
              )
              .join(' · ') || '—'}
          </p>
        )}
      </div>
    );
  }
  const chinese = view.gameType === 'xiangqi',
    board = view.board as Cell[][];
  const rows = board.map((row, y) =>
    row.map((cell, x) => ({
      cell,
      square: `${String.fromCharCode(97 + x)}${board.length - y - (chinese ? 1 : 0)}`,
    })),
  );
  const oriented = flipped ? rows.toReversed().map((row) => row.toReversed()) : rows;
  const move = lastMove?.data as { from?: string; to?: string; san?: string } | undefined;
  return (
    <div className="board-wrap">
      <div className="board-players">
        {view.players.map((p) => (
          <div key={p.seat} className={view.active === p.seat ? 'acting' : ''}>
            <span className={`player-side side-${p.seat}`}>
              {chinese ? (p.seat ? '黑' : '红') : p.seat ? '●' : '○'}
            </span>
            <div>
              <small>
                {chinese
                  ? p.seat
                    ? '黑方'
                    : '红方'
                  : p.seat
                    ? t('黑方', 'BLACK')
                    : t('白方', 'WHITE')}
              </small>
              <strong>{p.name}</strong>
            </div>
            {view.active === p.seat && <span className="turn-marker">{t('行棋', 'TO MOVE')}</span>}
          </div>
        ))}
      </div>
      <div
        className={`strategy-board ${chinese ? 'xiangqi-board' : 'chess-board'}`}
        role="img"
        aria-label={chinese ? '中国象棋棋盘' : t('国际象棋棋盘', 'Chess board')}
      >
        {chinese && <RiverGrid />}
        {oriented.map((row, y) =>
          row.map(({ cell, square }, x) => (
            <div
              key={square}
              data-square={square}
              className={`board-cell ${(x + y) % 2 ? 'dark-square' : 'light-square'} ${move?.from === square ? 'move-from' : ''} ${move?.to === square ? 'move-to' : ''} ${cell?.type === 'k' && view.details?.check && (cell.color === 'w' || cell.color === 'red' ? view.active === 0 : view.active === 1) ? 'in-check' : ''}`}
            >
              {(x === 0 || y === oriented.length - 1) && (
                <small className="square-coordinate">
                  {x === 0 ? square.slice(1) : ''}
                  {y === oriented.length - 1 ? square[0] : ''}
                </small>
              )}
              {cell && (
                <span
                  className={`board-piece ${cell.color === 'red' || cell.color === 'w' ? 'light-piece' : 'dark-piece'}`}
                  title={`${square} ${cell.label ?? cell.type}`}
                >
                  {chinese ? (
                    cell.label
                  ) : (
                    <ChessPiece type={cell.type} white={cell.color === 'w'} />
                  )}
                </span>
              )}
            </div>
          )),
        )}
      </div>
      <div className="board-caption">
        <span>
          {flipped
            ? t('黑方在下', 'Black at bottom')
            : chinese
              ? '红方在下'
              : t('白方在下', 'White at bottom')}
          {view.details?.check ? t(' · 将军', ' · CHECK') : ''}
        </span>
        <button
          aria-label={t('翻转棋盘', 'Flip board')}
          aria-pressed={flipped}
          onClick={() => setFlipped((v) => !v)}
        >
          ⇅ {t('翻转', 'Flip')}
        </button>
      </div>
      <div className="last-move">
        <span>{t('最近落子', 'LAST MOVE')}</span>
        <strong>{move ? (move.san ?? `${move.from} → ${move.to}`) : '—'}</strong>
      </div>
    </div>
  );
}
