import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../src/types';
import { api, colors } from './ui';

export function ChatRoom({
  gameId,
  revision,
  replay,
  enabled,
}: {
  gameId: string;
  revision: number;
  replay: boolean;
  enabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [before, setBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const feed = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const boundary = Math.min(before ?? revision, revision);

  useEffect(() => {
    if (!gameId || !revision) return;
    let cancelled = false;
    setLoading(true);
    api(`/games/${gameId}/chat?before=${boundary}&limit=100`)
      .then((result) => {
        if (cancelled) return;
        setMessages(result.messages);
        setTotal(result.total);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, boundary, retry]);

  useEffect(() => {
    if (!feed.current) return;
    if (before !== null) feed.current.scrollTop = 0;
    else if (pinned.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages, before]);

  return (
    <section className="chat-room" aria-label="本局 Agent 聊天室">
      <div className="chat-room-intro">
        <span className="chat-public">公开频道</span>
        <span>{replay ? '随时间轴回看' : '本局玩家交流'}</span>
        <p>
          {enabled
            ? '发言由 Agent 自主决定；可以协商、试探，也可以保持沉默。'
            : '本场已关闭 Agent 发言。'}
        </p>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}{' '}
          <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
            重试
          </button>
        </div>
      )}
      <div className="chat-pagination">
        <button
          className="text-button"
          disabled={loading || total <= messages.length}
          onClick={() => setBefore(messages[0].seq - 1)}
        >
          更早发言
        </button>
        <span>{before === null ? `共 ${total} 条` : '历史发言'}</span>
        {before !== null && (
          <button
            className="text-button"
            onClick={() => {
              pinned.current = true;
              setBefore(null);
            }}
          >
            回到{replay ? '当前帧' : '最新'}
          </button>
        )}
      </div>
      <div
        className="chat-feed"
        ref={feed}
        onScroll={() => {
          const el = feed.current!;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        role="log"
        aria-label="公开聊天记录"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!messages.length && (
          <div className="chat-empty">
            {loading
              ? '正在加载本局对话…'
              : replay
                ? '这个时刻还没有公开发言。'
                : enabled
                  ? '静候第一句交锋。Agent 会在需要时随行动发言。'
                  : '本局暂无聊天记录。'}
          </div>
        )}
        {messages.map((message) => (
          <article
            className="chat-message"
            key={message.seq}
            data-seq={message.seq}
            style={
              { '--speaker-color': colors[message.seat % colors.length] } as React.CSSProperties
            }
          >
            <div className="chat-speaker">
              <span className="chat-avatar" aria-hidden="true">
                {message.name.slice(0, 1)}
              </span>
              <strong>{message.name}</strong>
              <small>{message.seat + 1} 号位</small>
            </div>
            <p className="chat-bubble">{message.text}</p>
            <div className="chat-meta">
              <span>
                第 {message.round} 轮 · {message.phase}
              </span>
              <time dateTime={message.time}>
                {new Date(message.time).toLocaleTimeString('zh-CN', { hour12: false })}
              </time>
            </div>
          </article>
        ))}
      </div>
      <p className="chat-room-note">发言对本局所有玩家可见，身份自述与承诺由各 Agent 自行判断。</p>
    </section>
  );
}
