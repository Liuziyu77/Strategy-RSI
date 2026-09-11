import React from 'react';
import type { Card } from '../src/types';

export const modes: Record<string, string> = {
  off: '关闭 RSI',
  immediate: '即时 RSI',
  round: '轮次 RSI',
  both: '双模式 RSI',
};
export const statuses: Record<string, string> = {
  paused: '已暂停',
  running: '对战中',
  waiting: '等待外部 Agent',
  finished: '已结束',
  stopped: '已停止',
  error: '运行异常',
};
export const names = ['观澜', '长风', '星河', '云策', '听雨', '惊鸿', '知微', '望舒'];
export const heroNames = ['张飞', '关羽', '赵云', '马超', '黄月英', '许褚', '张辽', '吕布'];
export const colors = [
  '#e2ba73',
  '#82bbae',
  '#a0a9da',
  '#d59984',
  '#c4b082',
  '#91ad82',
  '#a391bb',
  '#8caab9',
];
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a5 5 0 0 0-3-4" />
      </>
    ),
    edit: (
      <>
        <path d="m15 4 5 5M4 20l4-1L21 6l-4-4L4 15Z" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    trophy: (
      <>
        <path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5m-4 2v6m-4 0h8" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    next: (
      <>
        <path d="m5 5 10 7-10 7ZM19 5v14" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    book: (
      <>
        <path d="M4 4h6a3 3 0 0 1 2 2 3 3 0 0 1 2-2h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4Z" />
        <path d="M12 6v14" />
      </>
    ),
    arena: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4M7 9h3m4 3h3" />
      </>
    ),
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7Z" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    trash: <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />,
    check: <path d="m5 12 4 4L19 6" />,
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m12 2 2 3 4-1 1 4 3 4-3 2 1 4-4 1-4 3-2-3-4 1-1-4-3-4 3-2-1-4 4-1Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.arena}
    </svg>
  );
}
export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('arena-token') ?? '';
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? '请求失败');
  return body;
}
export const post = (path: string, body?: unknown) =>
  api(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export function Face({ card, small = false }: { card: Card; small?: boolean }) {
  return (
    <span
      className={`card-face ${small ? 'small' : ''} ${card.suit === '♥' || card.suit === '♦' ? 'red' : ''}`}
      title={`${card.suit}${card.rank} ${card.name}`}
      style={{ '--card-name-length': [...card.name].length } as React.CSSProperties}
    >
      <span className="corner">
        {['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][card.rank]}
        <b>{card.suit}</b>
      </span>
      <strong>
        {[...card.name].map((character, index) => (
          <span key={index}>{character}</span>
        ))}
      </strong>
      <i>{card.type === 'equipment' ? '装备' : card.type === 'trick' ? '锦囊' : '基本'}</i>
    </span>
  );
}
