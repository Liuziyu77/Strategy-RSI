import React from 'react';
import type { GameType } from '../src/games/core';

/** Native vectors avoid platform-dependent fallback glyphs for game navigation. */
export function GameSymbol({ type }: { type: GameType }) {
  if (type === 'sanguosha' || type === 'xiangqi') return <>{type === 'sanguosha' ? '杀' : '将'}</>;
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="game-symbol">
      {type === 'werewolf' ? (
        <>
          <path
            d="M32 7a18 18 0 1 0 9 28A19 19 0 0 1 32 7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="m36 13 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="currentColor" />
        </>
      ) : (
        <>
          <path
            d="m12 37 2-9 12-9-11 3-5-5 9-9 1-5 7 5c13 1 13 18 9 29Z"
            fill="currentColor"
            fillOpacity=".16"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="m17 31 11-8M12 40h24l2 5H10Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <circle cx="23" cy="13" r="1.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
