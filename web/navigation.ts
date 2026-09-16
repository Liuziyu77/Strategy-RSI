import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameType } from '../src/games/core';
import { GAME_CATALOG } from '../src/games/catalog';

export interface WorkspaceView {
  matchId: string;
  gameId: string;
  seq: number | null;
  viewer: number;
}
const empty: WorkspaceView = { matchId: '', gameId: '', seq: null, viewer: -1 };
const eventName = 'arena-navigation';
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing can disable storage. */
  }
}
export function savedView(type: GameType): WorkspaceView {
  try {
    const v = JSON.parse(stored(`arena:view:${type}`) ?? '{}');
    return {
      matchId: typeof v.matchId === 'string' ? v.matchId : '',
      gameId: typeof v.gameId === 'string' ? v.gameId : '',
      seq: Number.isInteger(v.seq) && v.seq >= 1 ? v.seq : null,
      viewer: Number.isInteger(v.viewer) && v.viewer >= -1 && v.viewer <= 11 ? v.viewer : -1,
    };
  } catch {
    return { ...empty };
  }
}
export function locationState() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/');
  const last = stored('arena:last-game') ?? 'sanguosha';
  const candidate = parts[0] === 'arena' ? parts[1] : last;
  const gameType: GameType =
    candidate && Object.hasOwn(GAME_CATALOG, candidate) ? (candidate as GameType) : 'sanguosha';
  const page =
    parts[0] === 'players' || parts[0] === 'rules'
      ? parts[0]
      : parts[0] === 'arena'
        ? gameType === 'sanguosha'
          ? 'arena'
          : 'games'
        : 'lobby';
  const p = new URLSearchParams(query),
    base = savedView(gameType);
  const frame = Number(p.get('frame')),
    viewer = Number(p.get('viewer'));
  const view = p.has('match')
    ? {
        matchId: p.get('match') ?? '',
        gameId: p.get('game') ?? '',
        seq: Number.isInteger(frame) && frame > 0 ? frame : null,
        viewer:
          p.has('viewer') && Number.isInteger(viewer) && viewer >= -1 && viewer <= 11 ? viewer : -1,
      }
    : base;
  return { gameType, page, view };
}
function hashFor(type: GameType, view: WorkspaceView) {
  const p = new URLSearchParams();
  if (view.matchId) p.set('match', view.matchId);
  if (view.gameId) p.set('game', view.gameId);
  if (view.seq !== null) p.set('frame', String(view.seq));
  if (view.viewer >= 0) p.set('viewer', String(view.viewer));
  return `#/arena/${type}${p.size ? `?${p}` : ''}`;
}
function writeHash(hash: string, push: boolean) {
  if (location.hash === hash) return;
  history[push ? 'pushState' : 'replaceState'](null, '', hash);
  window.dispatchEvent(new Event(eventName));
}
export function navigateGame(type: GameType, view = savedView(type)) {
  save('arena:last-game', type);
  save(`arena:view:${type}`, JSON.stringify(view));
  writeHash(hashFor(type, view), true);
}
export function navigatePage(page: string) {
  if (page === 'lobby' || page === 'players' || page === 'rules') writeHash(`#/${page}`, true);
  else navigateGame(page === 'arena' ? 'sanguosha' : locationState().gameType);
}
export function useLocationState() {
  const [route, setRoute] = useState(locationState);
  useEffect(() => {
    const update = () => setRoute(locationState());
    for (const event of ['hashchange', 'popstate', eventName])
      window.addEventListener(event, update);
    return () => {
      for (const event of ['hashchange', 'popstate', eventName])
        window.removeEventListener(event, update);
    };
  }, []);
  return route;
}
export function useWorkspaceView(type: GameType) {
  const initial = () =>
    locationState().gameType === type ? locationState().view : savedView(type);
  const [view, setView] = useState<WorkspaceView>(initial),
    current = useRef(view);
  const update = useCallback(
    (
      patch: Partial<WorkspaceView> | ((v: WorkspaceView) => Partial<WorkspaceView>),
      push = false,
    ) => {
      const next = {
        ...current.current,
        ...(typeof patch === 'function' ? patch(current.current) : patch),
      };
      current.current = next;
      setView(next);
      save(`arena:view:${type}`, JSON.stringify(next));
      const route = locationState();
      if (route.gameType === type && ['arena', 'games'].includes(route.page))
        writeHash(hashFor(type, next), push);
    },
    [type],
  );
  useEffect(() => {
    const sync = () => {
      const route = locationState();
      if (route.gameType === type && ['arena', 'games'].includes(route.page)) {
        current.current = route.view;
        setView(route.view);
        save(`arena:view:${type}`, JSON.stringify(route.view));
        save('arena:last-game', type);
      }
    };
    sync();
    for (const event of ['hashchange', 'popstate', eventName]) window.addEventListener(event, sync);
    return () => {
      for (const event of ['hashchange', 'popstate', eventName])
        window.removeEventListener(event, sync);
    };
  }, [type]);
  return [view, update] as const;
}
