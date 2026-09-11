import React, { useEffect, useRef, useState } from 'react';
import type { Card, GameEvent, Observation } from '../src/types';
import { Face } from './ui';

type Point = { x: number; y: number };
type Effect = {
  id: number;
  kind: string;
  from: Point;
  center: Point;
  targets: Point[];
  cards: Card[];
  label: string;
  name: string;
  amount: number;
  delay: number;
};
export function BattleEffects({
  gameId,
  events,
  replay,
  view,
}: {
  gameId: string;
  events: GameEvent[];
  replay: boolean;
  view?: Observation;
}) {
  const layer = useRef<HTMLDivElement>(null),
    cursor = useRef<{ key: string; seq: number } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [effects, setEffects] = useState<Effect[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );
  useEffect(() => {
    const key = `${gameId}:${replay}`,
      newest = events.at(-1)?.seq ?? 0;
    if (cursor.current && cursor.current.key !== key) {
      cursor.current = null;
      setEffects([]);
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    }
    if (!view || view.gameId !== gameId || !events.length) return;
    if (cursor.current?.key !== key || replay || newest < cursor.current.seq) {
      cursor.current = { key, seq: newest };
      setEffects([]);
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
      return;
    }
    const incoming = events.filter((e) => e.seq > cursor.current!.seq);
    cursor.current.seq = newest;
    const field = layer.current?.parentElement;
    if (!field || !incoming.length) return;
    const bounds = field.getBoundingClientRect(),
      middle = field.querySelector('.table-center')?.getBoundingClientRect();
    const center = {
      x: (middle ? middle.left + middle.width / 2 : bounds.left + bounds.width / 2) - bounds.left,
      y: (middle ? middle.top + middle.height / 2 : bounds.top + bounds.height / 2) - bounds.top,
    };
    const point = (seat: number | undefined): Point => {
      const rect =
        seat === undefined
          ? null
          : field.querySelector(`[data-seat="${seat}"]`)?.getBoundingClientRect();
      return rect
        ? {
            x: rect.left + rect.width / 2 - bounds.left,
            y: rect.top + rect.height / 2 - bounds.top,
          }
        : center;
    };
    const next: Effect[] = [];
    for (const e of incoming) {
      const visual = e.data?.visual as
        | { cards: Card[]; targets: number[]; label: string; name: string }
        | undefined;
      if (e.type === 'action' && visual?.cards.length)
        next.push({
          id: e.seq,
          kind: 'card',
          from: point(e.actor),
          center,
          targets: visual.targets.filter((x) => Number.isInteger(x)).map(point),
          cards: visual.cards,
          label: `${view.players[e.actor ?? 0]?.name} · ${visual.label}`,
          name: visual.name,
          amount: 0,
          delay: 0,
        });
      else if (e.type === 'damage' || e.type === 'heal')
        next.push({
          id: e.seq,
          kind: e.type,
          from: point(e.type === 'damage' ? Number(e.data?.target) : e.actor),
          center,
          targets: [],
          cards: [],
          label: e.text,
          name: '',
          amount: Number(e.data?.amount ?? 1),
          delay: 0,
        });
    }
    // Fast simulations may publish several actions in one frame; overlap a short burst instead of building a stale backlog.
    const burst = next.slice(-10).map((e, i) => ({ ...e, delay: i * 120 }));
    if (!burst.length) return;
    setEffects((old) => [...old, ...burst].slice(-16));
    for (const effect of burst) {
      const timer = setTimeout(() => {
        setEffects((old) => old.filter((e) => e.id !== effect.id));
        timers.current.delete(timer);
      }, 1500 + effect.delay);
      timers.current.add(timer);
    }
  }, [events, gameId, replay, view?.gameId]);
  return (
    <div
      ref={layer}
      className="battle-effects"
      aria-hidden="true"
      data-effect-count={effects.length}
    >
      {effects.map((e) =>
        e.kind === 'card' ? (
          <div
            key={e.id}
            className={`card-play-effect ${e.name === '杀' ? 'attack' : e.name === '桃' ? 'restore' : 'tactic'}`}
            data-event-seq={e.id}
            style={{ '--effect-delay': `${e.delay}ms` } as React.CSSProperties}
          >
            <svg className="effect-trails">
              {e.targets.map((p, i) => (
                <g key={i}>
                  <path
                    d={`M ${e.center.x} ${e.center.y} Q ${(e.center.x + p.x) / 2 + 30} ${(e.center.y + p.y) / 2} ${p.x} ${p.y}`}
                  />
                  <circle cx={p.x} cy={p.y} r="32" />
                </g>
              ))}
            </svg>
            <div className="play-ripple" style={{ left: e.center.x, top: e.center.y }} />
            <div
              className="flying-card-group"
              style={
                {
                  left: e.center.x,
                  top: e.center.y,
                  '--from-x': `${e.from.x - e.center.x}px`,
                  '--from-y': `${e.from.y - e.center.y}px`,
                  '--fly-angle': `${e.from.x < e.center.x ? -18 : 18}deg`,
                } as React.CSSProperties
              }
            >
              <div className="played-cards">
                {e.cards.map((c, i) => (
                  <div
                    className="played-card"
                    key={c.id}
                    style={{ '--card-index': i } as React.CSSProperties}
                  >
                    <Face card={c} />
                    {e.name !== c.name && <span className="converted-card">视为{e.name}</span>}
                  </div>
                ))}
              </div>
              <span className="play-caption">{e.label}</span>
            </div>
            {e.targets.map((p, i) => (
              <div className="target-burst" key={i} style={{ left: p.x, top: p.y }}>
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        ) : (
          <div
            key={e.id}
            data-event-seq={e.id}
            className={`health-effect ${e.kind}`}
            style={{ left: e.from.x, top: e.from.y, animationDelay: `${e.delay}ms` }}
          >
            <span>
              {e.kind === 'heal' ? '+' : '−'}
              {e.amount}
            </span>
            <small>{e.kind === 'heal' ? '体力回复' : '受到伤害'}</small>
          </div>
        ),
      )}
    </div>
  );
}
