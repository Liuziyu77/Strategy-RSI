import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import type {
  AgentConfig,
  GameEvent,
  GameState,
  MatchConfig,
  Memory,
  PlayerProfile,
  PlayerRecord,
  PlayerGameHistory,
  PlayerMatchHistory,
  GameStats,
  GameRunStatus,
  Consolidation,
} from '../src/types';
import type { Provider } from './config';
import { chatMessage } from '../src/chat';

const pack = (v: unknown) => gzipSync(JSON.stringify(v));
const unpack = <T>(v: Uint8Array): T => JSON.parse(gunzipSync(v).toString());
const statisticsColumns = `count(*) AS games, count(DISTINCT g.match_id) AS matches,
  coalesce(sum(g.status='finished'),0) AS finished,
  coalesce(sum(g.status='finished' AND g.winner='平局'),0) AS draws,
  coalesce(sum(g.status='finished' AND ((g.winner='主忠' AND gp.role IN ('主公','忠臣')) OR g.winner=gp.role)),0) AS wins`;
function gameStats(row: Record<string, unknown>): GameStats {
  const finished = Number(row.finished),
    wins = Number(row.wins),
    draws = Number(row.draws);
  return {
    games: Number(row.games),
    finished,
    wins,
    draws,
    losses: finished - wins - draws,
    winRate: finished ? wins / finished : null,
  };
}
export class Store {
  db: DatabaseSync;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, 'arena.sqlite'));
    // The project may live on shared storage without WAL shared-memory support.
    // A single owner + rollback journal also works there and prevents concurrent writers.
    this.db
      .exec(`PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,config TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,error TEXT);
      CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,match_id TEXT NOT NULL REFERENCES matches(id),number INTEGER NOT NULL,status TEXT NOT NULL,winner TEXT,checkpoint BLOB NOT NULL,created_at TEXT NOT NULL, UNIQUE(match_id,number));
      CREATE TABLE IF NOT EXISTS events(game_id TEXT NOT NULL REFERENCES games(id),seq INTEGER NOT NULL,event TEXT NOT NULL,state BLOB NOT NULL,PRIMARY KEY(game_id,seq));
      CREATE INDEX IF NOT EXISTS events_chat ON events(game_id,seq) WHERE json_extract(event,'$.type')='chat';
      CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES games(id),seat INTEGER NOT NULL,revision INTEGER NOT NULL,record BLOB NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS decisions_game ON decisions(game_id);
      CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,text TEXT NOT NULL,mode TEXT NOT NULL,game_id TEXT,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS memory_agent ON memories(agent_id,created_at);
      CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,game_id TEXT NOT NULL,agent_id TEXT NOT NULL,kind TEXT NOT NULL,record BLOB NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS markers(key TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS seat_tokens(match_id TEXT NOT NULL,agent_id TEXT NOT NULL,token TEXT NOT NULL,PRIMARY KEY(match_id,agent_id));
      CREATE TABLE IF NOT EXISTS player_profiles(id TEXT PRIMARY KEY,profile TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS player_providers(id TEXT PRIMARY KEY,config TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS game_players(game_id TEXT NOT NULL REFERENCES games(id),player_id TEXT NOT NULL,seat INTEGER NOT NULL,name TEXT NOT NULL,hero TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(game_id,player_id));
      CREATE INDEX IF NOT EXISTS game_player_history ON game_players(player_id,game_id);
      CREATE TABLE IF NOT EXISTS game_runs(game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,status TEXT NOT NULL,error TEXT);
      CREATE TABLE IF NOT EXISTS memory_metadata(memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,match_id TEXT,consolidation_id TEXT);
      CREATE TABLE IF NOT EXISTS consolidations(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,match_id TEXT NOT NULL,status TEXT NOT NULL,record BLOB NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS consolidation_agent ON consolidations(agent_id,created_at);
      INSERT OR IGNORE INTO game_runs SELECT g.id,CASE WHEN m.status='finished' THEN 'finished' WHEN m.status='stopped' THEN 'stopped' ELSE 'paused' END,NULL FROM games g JOIN matches m ON m.id=g.match_id;
      UPDATE game_runs SET status='paused' WHERE status IN ('running','waiting','reflecting');
      UPDATE consolidations SET status='interrupted' WHERE status='running';`);
    this.migratePlayers();
    // Process interruption is distinct from a game result. The last checkpoint remains resumable.
    this.db
      .prepare("UPDATE matches SET status='paused' WHERE status IN ('running','waiting')")
      .run();
  }
  createMatch(id: string, config: MatchConfig) {
    for (const agent of config.agents) this.ensurePlayer(agent);
    this.db
      .prepare('INSERT INTO matches VALUES(?,?,?,?,NULL)')
      .run(id, JSON.stringify(config), 'paused', new Date().toISOString());
  }
  match(id: string): any {
    const row = this.db.prepare('SELECT * FROM matches WHERE id=?').get(id) as any;
    return row
      ? {
          id: row.id,
          config: JSON.parse(row.config),
          status: row.status,
          createdAt: row.created_at,
          error: row.error,
        }
      : null;
  }
  matches() {
    return this.db
      .prepare('SELECT id FROM matches ORDER BY created_at DESC')
      .all()
      .map((r) => this.match(String(r.id)));
  }
  setStatus(id: string, status: string, error: string | null = null) {
    this.db.prepare('UPDATE matches SET status=?,error=? WHERE id=?').run(status, error, id);
  }
  createGame(id: string, matchId: string, number: number, state: GameState) {
    this.db
      .prepare('INSERT INTO games VALUES(?,?,?,?,?,?,?)')
      .run(id, matchId, number, 'playing', null, pack(state), new Date().toISOString());
    this.db.prepare('INSERT INTO game_runs VALUES(?,?,NULL)').run(id, 'paused');
    this.indexPlayers(state);
  }
  private indexPlayers(state: GameState) {
    const insert = this.db.prepare('INSERT OR IGNORE INTO game_players VALUES(?,?,?,?,?,?)');
    for (const p of state.players) insert.run(state.id, p.agentId, p.seat, p.name, p.hero, p.role);
  }
  private migratePlayers() {
    this.transaction(() => {
      // Latest historical settings become the initial library entry, once per player ID.
      for (const row of this.db
        .prepare('SELECT config FROM matches ORDER BY created_at DESC')
        .all())
        for (const agent of JSON.parse(String(row.config)).agents) this.ensurePlayer(agent);
      for (const row of this.db.prepare('SELECT DISTINCT agent_id FROM memories').all())
        this.ensurePlayer({
          id: String(row.agent_id),
          name: String(row.agent_id),
          kind: 'heuristic',
          provider: 'default',
          model: '',
          rsi: 'off',
          hero: '张飞',
        });
      for (const row of this.db
        .prepare('SELECT checkpoint FROM games WHERE id NOT IN (SELECT game_id FROM game_players)')
        .all())
        this.indexPlayers(unpack<GameState>(row.checkpoint as Uint8Array));
    });
  }
  ensurePlayer(agent: AgentConfig) {
    if (this.player(agent.id)) return;
    const now = new Date().toISOString();
    this.savePlayer({
      ...agent,
      description: '',
      color: '#86b2a0',
      apiMode: 'provider',
      baseUrl: '',
      hasApiKey: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  player(id: string): PlayerProfile | null {
    const row = this.db.prepare('SELECT profile FROM player_profiles WHERE id=?').get(id);
    return row ? JSON.parse(String(row.profile)) : null;
  }
  savePlayer(profile: PlayerProfile) {
    this.db
      .prepare(
        'INSERT INTO player_profiles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile',
      )
      .run(profile.id, JSON.stringify(profile));
  }
  savePlayerProvider(provider: Provider) {
    this.db
      .prepare('INSERT INTO player_providers VALUES(?,?)')
      .run(provider.id, JSON.stringify(provider));
  }
  playerProvider(id: string): Provider | undefined {
    const row = this.db.prepare('SELECT config FROM player_providers WHERE id=?').get(id);
    return row ? JSON.parse(String(row.config)) : undefined;
  }
  playerHistory(id: string): PlayerGameHistory[] {
    return this.db
      .prepare(
        `SELECT gp.*,g.match_id,g.number,g.status,g.winner,g.created_at,g.checkpoint,
        m.status AS match_status,m.config AS match_config,
        (SELECT event FROM events WHERE game_id=g.id ORDER BY seq LIMIT 1) AS first_event,
        (SELECT event FROM events WHERE game_id=g.id ORDER BY seq DESC LIMIT 1) AS last_event,
        (SELECT count(*) FROM decisions WHERE game_id=g.id) AS decision_count
        FROM game_players gp JOIN games g ON g.id=gp.game_id JOIN matches m ON m.id=g.match_id
        WHERE gp.player_id=? ORDER BY g.created_at DESC,g.number DESC`,
      )
      .all(id)
      .map((row) => {
        const state = unpack<GameState>(row.checkpoint as Uint8Array);
        const first: GameEvent | null = row.first_event
          ? JSON.parse(String(row.first_event))
          : null;
        const last: GameEvent | null = row.last_event ? JSON.parse(String(row.last_event)) : null;
        const startedAt = first?.time ?? String(row.created_at);
        const lastEventAt = last?.time ?? startedAt;
        const elapsed = Date.parse(lastEventAt) - Date.parse(startedAt);
        return {
          gameId: String(row.game_id),
          matchId: String(row.match_id),
          matchName: JSON.parse(String(row.match_config)).name,
          number: Number(row.number),
          status: String(row.status),
          matchStatus: String(row.match_status),
          winner: row.winner as string | null,
          seat: Number(row.seat),
          name: String(row.name),
          hero: String(row.hero),
          role: String(row.role),
          createdAt: String(row.created_at),
          startedAt,
          endedAt: row.status === 'finished' ? lastEventAt : null,
          lastEventAt,
          // Event time works for legacy archives too; API reflections are stored separately.
          durationMs: Number.isFinite(elapsed) ? Math.max(0, elapsed) : null,
          round: state.round,
          turn: state.turn,
          decisionCount: Number(row.decision_count),
          playerCount: state.players.length,
          won:
            row.status === 'finished' &&
            (row.winner === '主忠'
              ? ['主公', '忠臣'].includes(String(row.role))
              : row.winner === row.role),
        };
      });
  }
  playerMatchHistory(id: string): PlayerMatchHistory[] {
    return this.db
      .prepare(
        `SELECT m.id,m.config,m.status,m.created_at,${statisticsColumns}
      FROM game_players gp JOIN games g ON g.id=gp.game_id JOIN matches m ON m.id=g.match_id
      WHERE gp.player_id=? GROUP BY m.id ORDER BY m.created_at DESC,m.rowid DESC`,
      )
      .all(id)
      .map((row) => {
        const config: MatchConfig = JSON.parse(String(row.config));
        return {
          matchId: String(row.id),
          matchName: config.name,
          status: String(row.status),
          createdAt: String(row.created_at),
          plannedGames: config.games,
          stats: gameStats(row),
        };
      });
  }
  players(): PlayerRecord[] {
    return this.db
      .prepare('SELECT profile FROM player_profiles ORDER BY rowid DESC')
      .all()
      .map((row) => {
        const profile: PlayerProfile = JSON.parse(String(row.profile));
        // Library summaries do not need to unpack every historical game checkpoint.
        const totals = this.db
          .prepare(
            `SELECT ${statisticsColumns}
          FROM game_players gp JOIN games g ON g.id=gp.game_id WHERE gp.player_id=?`,
          )
          .get(profile.id)!;
        return {
          ...profile,
          stats: {
            ...gameStats(totals),
            matches: Number(totals.matches),
            memories: Number(
              this.db
                .prepare('SELECT count(*) AS n FROM memories WHERE agent_id=?')
                .get(profile.id)!.n,
            ),
          },
        };
      });
  }
  checkpoint(state: GameState) {
    this.db
      .prepare('UPDATE games SET status=?,winner=?,checkpoint=? WHERE id=?')
      .run(state.status, state.winner, pack(state), state.id);
  }
  game(id: string): any {
    const r = this.db
      .prepare(
        'SELECT g.*,r.status AS run_status,r.error AS run_error FROM games g LEFT JOIN game_runs r ON r.game_id=g.id WHERE g.id=?',
      )
      .get(id) as any;
    return r
      ? {
          id: r.id,
          matchId: r.match_id,
          number: r.number,
          status: r.status,
          runStatus: r.run_status ?? 'paused',
          runError: r.run_error ?? null,
          winner: r.winner,
          createdAt: r.created_at,
          state: unpack<GameState>(r.checkpoint),
        }
      : null;
  }
  games(matchId?: string): any[] {
    const rows = matchId
      ? this.db.prepare('SELECT id FROM games WHERE match_id=? ORDER BY number').all(matchId)
      : this.db.prepare('SELECT id FROM games ORDER BY created_at DESC').all();
    return rows.map((r) => {
      const { state, ...game } = this.game(String(r.id));
      return { ...game, round: state.round, turn: state.turn, revision: state.revision };
    });
  }
  gameRuns(matchId: string): { id: string; number: number; runStatus: GameRunStatus }[] {
    return this.db
      .prepare(
        'SELECT g.id,g.number,r.status AS runStatus FROM games g JOIN game_runs r ON r.game_id=g.id WHERE match_id=? ORDER BY number',
      )
      .all(matchId) as any;
  }
  setGameStatus(gameId: string, status: GameRunStatus, error: string | null = null) {
    this.db
      .prepare('UPDATE game_runs SET status=?,error=? WHERE game_id=?')
      .run(status, error, gameId);
  }
  event(gameId: string, event: GameEvent, state: GameState) {
    this.db
      .prepare('INSERT INTO events VALUES(?,?,?,?)')
      .run(gameId, event.seq, JSON.stringify(event), pack(state));
  }
  events(gameId: string, after = 0, limit = 5000): GameEvent[] {
    return this.db
      .prepare('SELECT event FROM events WHERE game_id=? AND seq>? ORDER BY seq LIMIT ?')
      .all(gameId, after, limit)
      .map((r) => JSON.parse(String(r.event)));
  }
  allEvents(gameId: string): GameEvent[] {
    return this.db
      .prepare('SELECT event FROM events WHERE game_id=? ORDER BY seq')
      .all(gameId)
      .map((r) => JSON.parse(String(r.event)));
  }
  chat(gameId: string, before = 1000000000, limit = 100) {
    const where =
      "game_id=? AND seq<=? AND json_extract(event,'$.type')='chat' AND json_extract(event,'$.privateTo') IS NULL";
    const messages = this.db
      .prepare(
        `SELECT event FROM (SELECT seq,event FROM events WHERE ${where} ORDER BY seq DESC LIMIT ?) ORDER BY seq`,
      )
      .all(gameId, before, limit)
      .flatMap((row) => chatMessage(JSON.parse(String(row.event))) ?? []);
    const total = Number(
      this.db.prepare(`SELECT count(*) AS n FROM events WHERE ${where}`).get(gameId, before)!.n,
    );
    return { messages, total };
  }
  recentEvents(gameId: string, before: number, limit: number): GameEvent[] {
    return this.db
      .prepare(
        'SELECT event FROM (SELECT seq,event FROM events WHERE game_id=? AND seq<=? ORDER BY seq DESC LIMIT ?) ORDER BY seq',
      )
      .all(gameId, before, limit)
      .map((r) => JSON.parse(String(r.event)));
  }
  frame(gameId: string, seq: number): GameState | null {
    const row = this.db
      .prepare('SELECT state FROM events WHERE game_id=? AND seq=?')
      .get(gameId, seq);
    return row ? unpack<GameState>(row.state as Uint8Array) : null;
  }
  decision(gameId: string, seat: number, revision: number, record: unknown) {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO decisions VALUES(?,?,?,?,?,?)')
      .run(id, gameId, seat, revision, pack(record), new Date().toISOString());
    return id;
  }
  decisionCount(gameId: string, before = 1000000000) {
    return Number(
      this.db
        .prepare('SELECT count(*) AS n FROM decisions WHERE game_id=? AND revision<?')
        .get(gameId, before)!.n,
    );
  }
  decisions(gameId: string, limit = 1000000, before = 1000000000): any[] {
    return this.db
      .prepare(
        'SELECT * FROM (SELECT rowid AS ordinal,* FROM decisions WHERE game_id=? AND revision<? ORDER BY rowid DESC LIMIT ?) ORDER BY ordinal',
      )
      .all(gameId, before, limit)
      .map((r) => ({
        id: r.id,
        seat: r.seat,
        revision: r.revision,
        createdAt: r.created_at,
        ...unpack<Record<string, unknown>>(r.record as Uint8Array),
      }));
  }
  memory(agentId?: string): Memory[] {
    const query = `SELECT m.*,coalesce(mm.match_id,g.match_id) AS match_id,ma.config AS match_config,g.number AS game_number,mm.consolidation_id,c.record AS consolidation_record
      FROM memories m LEFT JOIN games g ON g.id=m.game_id LEFT JOIN memory_metadata mm ON mm.memory_id=m.id
      LEFT JOIN matches ma ON ma.id=coalesce(mm.match_id,g.match_id) LEFT JOIN consolidations c ON c.id=mm.consolidation_id`;
    const rs = agentId
      ? this.db.prepare(`${query} WHERE m.agent_id=? ORDER BY m.created_at,m.rowid`).all(agentId)
      : this.db.prepare(`${query} ORDER BY m.created_at,m.rowid`).all();
    const memories: Memory[] = rs.map((r) => ({
      id: String(r.id),
      agentId: String(r.agent_id),
      text: String(r.text),
      mode: String(r.mode),
      gameId: r.game_id as string | null,
      createdAt: String(r.created_at),
      matchId: r.match_id as string | null,
      matchName: r.match_config ? JSON.parse(String(r.match_config)).name : null,
      gameNumber: r.game_number === null ? null : Number(r.game_number),
      consolidationId: r.consolidation_id as string | null,
      sourceIds: r.consolidation_record
        ? unpack<Consolidation>(r.consolidation_record as Uint8Array).sourceIds
        : undefined,
    }));
    const latest = new Map<string, Memory>();
    for (const m of memories) if (m.consolidationId) latest.set(`${m.agentId}:${m.matchId}`, m);
    const covered = new Set([...latest.values()].flatMap((m) => m.sourceIds ?? []));
    for (const m of memories)
      m.active = m.consolidationId
        ? latest.get(`${m.agentId}:${m.matchId}`)?.id === m.id
        : !covered.has(m.id);
    return agentId ? memories : memories.reverse();
  }
  activeMemory(agentId: string) {
    const active = this.memory(agentId).filter((m) => m.active);
    return [
      ...active.filter((m) => !m.consolidationId),
      ...active.filter((m) => m.consolidationId),
    ];
  }
  hasMemory(agentId: string, text: string, mode: string, gameId: string) {
    return !!this.db
      .prepare(
        'SELECT id FROM memories WHERE agent_id=? AND text=? AND mode=? AND game_id=? LIMIT 1',
      )
      .get(agentId, text, mode, gameId);
  }
  addMemory(
    agentId: string,
    text: string,
    mode = 'manual',
    gameId: string | null = null,
    metadata?: { matchId: string; consolidationId: string },
  ): Memory {
    this.ensurePlayer({
      id: agentId,
      name: agentId,
      kind: 'heuristic',
      provider: 'default',
      model: '',
      rsi: 'off',
      hero: '张飞',
    });
    const m = {
      id: randomUUID(),
      agentId,
      text,
      mode,
      gameId,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO memories VALUES(?,?,?,?,?,?)')
      .run(m.id, m.agentId, m.text, m.mode, m.gameId, m.createdAt);
    if (metadata)
      this.db
        .prepare('INSERT INTO memory_metadata VALUES(?,?,?)')
        .run(m.id, metadata.matchId, metadata.consolidationId);
    return m;
  }
  saveConsolidation(job: Consolidation, calls: unknown[] = []) {
    this.db
      .prepare(
        'INSERT INTO consolidations VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,record=excluded.record,updated_at=excluded.updated_at',
      )
      .run(
        job.id,
        job.agentId,
        job.matchId,
        job.status,
        pack({ ...job, calls }),
        job.createdAt,
        job.updatedAt,
      );
  }
  consolidations(agentId: string): Consolidation[] {
    return this.db
      .prepare(
        'SELECT record,status FROM consolidations WHERE agent_id=? ORDER BY created_at DESC,rowid DESC',
      )
      .all(agentId)
      .map((row) => {
        const { calls, ...job } = unpack<Consolidation & { calls: unknown[] }>(
          row.record as Uint8Array,
        );
        return { ...job, status: String(row.status) as Consolidation['status'] };
      });
  }
  consolidationCheckpoint(
    agentId: string,
    matchId: string,
  ): { id: string; calls: unknown[] } | null {
    const row = this.db
      .prepare(
        'SELECT id,status,record FROM consolidations WHERE agent_id=? AND match_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
      )
      .get(agentId, matchId);
    if (!row || !['error', 'interrupted'].includes(String(row.status))) return null;
    const record = unpack<{ calls?: unknown[] }>(row.record as Uint8Array);
    return { id: String(row.id), calls: record.calls ?? [] };
  }
  deleteMemory(id: string) {
    return this.db.prepare('DELETE FROM memories WHERE id=?').run(id).changes > 0;
  }
  call(gameId: string, agentId: string, kind: string, record: unknown) {
    this.db
      .prepare('INSERT INTO calls VALUES(?,?,?,?,?,?)')
      .run(randomUUID(), gameId, agentId, kind, pack(record), new Date().toISOString());
  }
  calls(gameId: string): any[] {
    return this.db
      .prepare('SELECT * FROM calls WHERE game_id=? ORDER BY rowid')
      .all(gameId)
      .map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        kind: r.kind,
        createdAt: r.created_at,
        ...unpack<Record<string, unknown>>(r.record as Uint8Array),
      }));
  }
  marked(key: string) {
    return !!this.db.prepare('SELECT key FROM markers WHERE key=?').get(key);
  }
  mark(key: string) {
    this.db.prepare('INSERT OR IGNORE INTO markers VALUES(?)').run(key);
  }
  token(matchId: string, agentId: string) {
    const r = this.db
      .prepare('SELECT token FROM seat_tokens WHERE match_id=? AND agent_id=?')
      .get(matchId, agentId);
    return r ? String(r.token) : null;
  }
  setToken(matchId: string, agentId: string, token: string) {
    this.db
      .prepare('INSERT OR REPLACE INTO seat_tokens VALUES(?,?,?)')
      .run(matchId, agentId, token);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
