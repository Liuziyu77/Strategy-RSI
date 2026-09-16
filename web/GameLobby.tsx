import React, { useState } from 'react';
import { GAME_CATALOG } from '../src/games/catalog';
import type { GameType } from '../src/games/core';
import { gamePresentation } from './game-presentation';
import { GameSymbol } from './GameSymbols';
import { Icon } from './ui';
import './lobby.css';

export function GameLobby({
  counts,
  onSelect,
}: {
  counts: Partial<Record<GameType, number>>;
  onSelect: (type: GameType) => void;
}) {
  const [query, setQuery] = useState('');
  const catalog = Object.values(GAME_CATALOG);
  const games = catalog.filter((game) => {
    const p = gamePresentation[game.id];
    return `${game.id} ${game.name.zh} ${game.name.en} ${p.en} ${p.tagline}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  const running = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return (
    <main className="game-lobby">
      <header className="lobby-hero">
        <div>
          <div className="lobby-eyebrow">
            <span /> PLAY · OBSERVE · EVOLVE
          </div>
          <h1>
            策略，没有边界。
            <br />
            <em>从这里，进入游戏。</em>
          </h1>
          <p>
            在不同规则中，观察智能如何决策。
            <br />
            选择一个世界，开启 Agent 的下一次探索。
          </p>
        </div>
        <div className="lobby-manifest">
          <div className="lobby-worlds" aria-hidden="true">
            {catalog.map((game) => (
              <span key={game.id} className={`world-symbol world-${game.id}`}>
                <GameSymbol type={game.id} />
              </span>
            ))}
          </div>
          <p>ONE LAB. MANY WORLDS.</p>
          <div>
            <span>
              <b>{String(catalog.length).padStart(2, '0')}</b>游戏场地
            </span>
            <span>
              <b>{String(running).padStart(2, '0')}</b>运行中对战
            </span>
          </div>
        </div>
      </header>
      <section aria-labelledby="lobby-collection-title">
        <div className="lobby-tools">
          <div>
            <h2 id="lobby-collection-title">
              游戏大厅 <span>ALL GAMES</span>
            </h2>
            <p>选择游戏，开始实验或继续观战。</p>
          </div>
          <label className="lobby-search">
            <Icon name="search" size={17} />
            <input
              type="search"
              aria-label="搜索游戏 / Search games"
              placeholder="搜索游戏名称…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="清空搜索" onClick={() => setQuery('')}>
                <Icon name="close" size={16} />
              </button>
            )}
          </label>
        </div>
        <div className="lobby-grid" aria-label="游戏列表">
          {games.map((game) => {
            const p = gamePresentation[game.id];
            return (
              <button
                key={game.id}
                className={`lobby-card lobby-card-${game.id}`}
                aria-label={`进入${game.name.zh}`}
                onClick={() => onSelect(game.id)}
                style={{ '--game-accent': p.accent } as React.CSSProperties}
              >
                <div className="lobby-card-art" aria-hidden="true">
                  <div className="lobby-art-grid" />
                  <span>
                    <GameSymbol type={game.id} />
                  </span>
                  <small>{p.en}</small>
                </div>
                <div className="lobby-card-copy">
                  <span className="lobby-card-category">{p.tagline}</span>
                  <h3>{game.name.zh}</h3>
                  <p>{p.description}</p>
                  <div className="lobby-card-meta">
                    <span>
                      {game.minPlayers === game.maxPlayers
                        ? game.minPlayers
                        : `${game.minPlayers}–${game.maxPlayers}`}{' '}
                      人
                    </span>
                    <span>
                      {game.locales.map((l) => (l === 'zh' ? '中文' : 'English')).join(' / ')}
                    </span>
                  </div>
                  <div className="lobby-card-footer">
                    <span>
                      {counts[game.id] ? (
                        <>
                          <i />
                          {counts[game.id]} 场运行中
                        </>
                      ) : (
                        '就绪 · 随时开局'
                      )}
                    </span>
                    <strong>
                      进入观战室 <Icon name="arrow" size={17} />
                    </strong>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {!games.length && (
          <div className="lobby-no-results" role="status">
            <Icon name="search" size={28} />
            <h3>没有找到对应的游戏</h3>
            <p>试试中文名或英文名，也可以查看全部游戏。</p>
            <button className="secondary" onClick={() => setQuery('')}>
              查看全部游戏
            </button>
          </div>
        )}
      </section>
      <footer className="lobby-footer">
        <span>
          <Icon name="bolt" size={15} /> 模型交流 · 持续反思 · 经验积累
        </span>
        <p>离开观战室不会中断对战，回放位置与视角会为你保留。</p>
      </footer>
    </main>
  );
}
