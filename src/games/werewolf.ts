import { phaseName } from './werewolf-labels';
import { BaseEngine } from './base';
import type { ArenaObservation, ArenaState, Locale } from './core';
import type { AgentConfig, Choice } from '../types';
export type WolfRole = 'wolf' | 'seer' | 'witch' | 'hunter' | 'villager';
export interface WerewolfState extends ArenaState {
  gameType: 'werewolf';
  locale: Locale;
  rng: number;
  queue: number[];
  ballots: Record<string, number>;
  victims: number[];
  poisoned: number | null;
  antidote: boolean;
  poison: boolean;
  visions: Record<string, boolean>;
  runoff: number[];
  voteRound: number;
  afterHunter: 'day' | 'night';
}
export const wolfRoles = (n: number): WolfRole[] => [
  ...Array<WolfRole>(Math.floor(n / 3)).fill('wolf'),
  'seer',
  'witch',
  'hunter',
  ...Array<WolfRole>(n - Math.floor(n / 3) - 3).fill('villager'),
];
export class WerewolfEngine extends BaseEngine<WerewolfState> {
  constructor(
    id: string,
    agents: AgentConfig[],
    seed: number,
    locale: Locale = 'zh',
    restored?: WerewolfState,
  ) {
    let rng = seed >>> 0 || 1;
    const random = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    const roles = restored ? [] : wolfRoles(agents.length);
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    super(
      restored
        ? structuredClone(restored)
        : {
            id,
            version: 1,
            gameType: 'werewolf',
            locale,
            rng,
            revision: 0,
            round: 1,
            turn: 1,
            active: 0,
            phase: 'wolf_discussion',
            status: 'playing',
            winner: null,
            reason: null,
            players: agents.map((a, seat) => ({
              seat,
              agentId: a.id,
              name: a.name,
              role: roles[seat],
              alive: true,
            })),
            queue: [],
            ballots: {},
            victims: [],
            poisoned: null,
            antidote: true,
            poison: true,
            visions: {},
            runoff: [],
            voteRound: 1,
            afterHunter: 'day',
          },
    );
    if (!restored) this.setPhase('wolf_discussion', this.living('wolf'));
  }
  living(role?: string) {
    return this.s.players.filter((p) => p.alive && (!role || p.role === role)).map((p) => p.seat);
  }
  get requiresDecision() {
    return ['wolf_discussion', 'discussion'].includes(this.s.phase);
  }
  setPhase(phase: string, seats: number[]) {
    this.s.phase = phase;
    this.s.queue = [...seats];
    this.s.active = seats[0] ?? -1;
  }
  start() {
    this.emit('start', this.text('狼人杀开始，天黑请闭眼', 'Werewolf begins. Night falls.'));
    this.ready();
  }
  speechAudience() {
    if (['wolf_discussion', 'wolf_vote'].includes(this.s.phase))
      return this.s.players.filter((p) => p.role === 'wolf').map((p) => p.seat);
    if (['discussion', 'vote', 'hunter'].includes(this.s.phase)) return undefined;
    return null;
  }
  legalActions(): Choice[] {
    if (this.s.status !== 'playing') return [];
    const phase = this.s.phase;
    const target = (kind: string, seats: number[], zh: string, en: string): Choice[] =>
      seats.map((seat) => ({
        id: `${kind}:${seat}`,
        kind,
        targets: [seat],
        label: `${this.text(zh, en)} ${seat + 1} · ${this.p(seat).name}`,
      }));
    const skip = { id: 'skip', kind: 'skip', label: this.text('跳过 / 弃权', 'Pass / abstain') };
    if (['wolf_discussion', 'discussion'].includes(phase))
      return [
        {
          id: 'speak',
          kind: 'speak',
          label: this.text('发言或保持沉默', 'Speak or remain silent'),
        },
      ];
    if (phase === 'wolf_vote')
      return [
        ...target(
          'attack',
          this.living().filter((s) => this.p(s).role !== 'wolf'),
          '袭击',
          'Attack',
        ),
        skip,
      ];
    if (phase === 'seer')
      return [
        ...target(
          'inspect',
          this.living().filter((s) => s !== this.actor && !Object.hasOwn(this.s.visions, s)),
          '查验',
          'Inspect',
        ),
        skip,
      ];
    if (phase === 'witch') {
      const heal =
        this.s.antidote &&
        this.s.victims.length &&
        (this.s.victims[0] !== this.actor || this.s.round === 1)
          ? target('heal', this.s.victims, '使用解药救', 'Heal')
          : [];
      return [
        ...heal,
        ...(this.s.poison
          ? target(
              'poison',
              this.living().filter((s) => s !== this.actor),
              '使用毒药',
              'Poison',
            )
          : []),
        skip,
      ];
    }
    if (phase === 'hunter')
      return [
        ...target(
          'shoot',
          this.living().filter((s) => s !== this.actor),
          '开枪',
          'Shoot',
        ),
        skip,
      ];
    if (phase === 'vote')
      return [
        ...target(
          'vote',
          (this.s.runoff.length ? this.s.runoff : this.living()).filter((s) => s !== this.actor),
          '放逐',
          'Exile',
        ),
        skip,
      ];
    return [];
  }
  execute(choice: Choice) {
    const actor = this.actor,
      phase = this.s.phase,
      target = choice.targets?.[0];
    this.s.turn++;
    if (phase === 'wolf_vote' || phase === 'vote') this.s.ballots[actor] = target ?? -1;
    if (phase === 'seer' && target !== undefined) {
      this.s.visions[target] = this.p(target).role === 'wolf';
      this.emit(
        'inspection',
        this.text(
          `${target + 1} 号${this.s.visions[target] ? '是狼人' : '不是狼人'}`,
          `Seat ${target + 1} is ${this.s.visions[target] ? 'a werewolf' : 'not a werewolf'}`,
        ),
        actor,
        { target, wolf: this.s.visions[target] },
        [actor],
      );
    } else if (phase === 'witch') {
      if (choice.kind === 'heal') {
        this.s.antidote = false;
        this.s.victims = [];
      }
      if (choice.kind === 'poison') {
        this.s.poison = false;
        this.s.poisoned = target!;
      }
      this.emit('night_action', choice.label, actor, undefined, [actor]);
    } else if (phase === 'wolf_vote')
      this.emit(
        'night_action',
        choice.label,
        actor,
        undefined,
        this.s.players.filter((p) => p.role === 'wolf').map((p) => p.seat),
      );
    else if (phase === 'vote')
      this.emit(
        'ballot',
        this.text('已提交秘密投票', 'Secret ballot submitted'),
        actor,
        undefined,
        [actor],
      );
    else if (phase === 'hunter') {
      if (target !== undefined) this.kill([target]);
      this.emit('hunter', choice.label, actor);
      if (!this.checkWin()) this.s.afterHunter === 'day' ? this.day() : this.night();
      return;
    }
    this.s.queue.shift();
    if (this.s.queue.length) {
      this.s.active = this.s.queue[0];
      return;
    }
    if (phase === 'wolf_discussion') {
      this.s.ballots = {};
      this.setPhase('wolf_vote', this.living('wolf'));
    } else if (phase === 'wolf_vote') {
      const leaders = this.leaders();
      this.s.victims = leaders.length === 1 ? leaders : [];
      this.s.ballots = {};
      if (this.living('seer').length) this.setPhase('seer', this.living('seer'));
      else this.witch();
    } else if (phase === 'seer') this.witch();
    else if (phase === 'witch') this.dawn();
    else if (phase === 'discussion') {
      this.s.ballots = {};
      this.setPhase('vote', this.living());
    } else if (phase === 'vote') this.exile();
  }
  leaders() {
    const counts = new Map<number, number>();
    for (const seat of Object.values(this.s.ballots))
      if (seat >= 0) counts.set(seat, (counts.get(seat) ?? 0) + 1);
    const max = Math.max(0, ...counts.values());
    return [...counts.keys()].filter((s) => counts.get(s) === max).sort((a, b) => a - b);
  }
  witch() {
    if (this.living('witch').length) this.setPhase('witch', this.living('witch'));
    else this.dawn();
  }
  kill(seats: number[]) {
    for (const s of [...new Set(seats)])
      if (this.p(s).alive) {
        this.p(s).alive = false;
        this.emit('death', this.text(`${s + 1} 号出局`, `Seat ${s + 1} was eliminated`), s);
      }
  }
  dawn() {
    const dead = [
      ...new Set([...this.s.victims, ...(this.s.poisoned === null ? [] : [this.s.poisoned])]),
    ];
    this.s.phase = 'discussion';
    this.emit('dawn', this.text('天亮了', 'Dawn breaks'));
    this.kill(dead);
    const hunter = dead.find((s) => this.p(s).role === 'hunter' && s !== this.s.poisoned);
    this.s.victims = [];
    this.s.poisoned = null;
    if (hunter !== undefined) {
      this.s.afterHunter = 'day';
      this.setPhase('hunter', [hunter]);
    } else if (!this.checkWin()) this.day();
  }
  day() {
    this.s.runoff = [];
    this.s.voteRound = 1;
    this.setPhase('discussion', this.living());
  }
  night() {
    this.s.round++;
    this.s.victims = [];
    this.s.poisoned = null;
    this.s.ballots = {};
    this.s.runoff = [];
    this.setPhase('wolf_discussion', this.living('wolf'));
    this.emit('night', this.text(`第 ${this.s.round} 夜`, `Night ${this.s.round}`));
  }
  exile() {
    const leaders = this.leaders();
    this.emit('votes', this.text('投票结果公布', 'Ballots revealed'), undefined, {
      ballots: { ...this.s.ballots },
      voteRound: this.s.voteRound,
    });
    this.s.ballots = {};
    if (leaders.length > 1 && this.s.voteRound === 1) {
      this.s.runoff = leaders;
      this.s.voteRound = 2;
      this.emit(
        'runoff',
        this.text('平票，候选人再次发言后重新投票', 'Tie: candidates speak before a runoff'),
        undefined,
        { candidates: leaders },
      );
      this.setPhase('discussion', leaders);
      return;
    }
    if (leaders.length === 1) {
      const victim = leaders[0];
      this.kill([victim]);
      if (this.p(victim).role === 'hunter') {
        this.s.afterHunter = 'night';
        this.setPhase('hunter', [victim]);
        return;
      }
    } else this.emit('no_exile', this.text('无人被放逐', 'No player exiled'));
    if (!this.checkWin()) this.night();
  }
  checkWin() {
    const wolves = this.living('wolf').length,
      others = this.living().length - wolves;
    if (!wolves) {
      this.finish(
        'village',
        this.text('狼人全部出局，好人获胜', 'All werewolves eliminated. Village wins.'),
      );
      return true;
    }
    if (wolves >= others) {
      this.finish(
        'wolves',
        this.text('狼人数量达到或超过好人，狼人获胜', 'Werewolves reach parity. Wolves win.'),
      );
      return true;
    }
    return false;
  }
  finish(winner: string, reason: string) {
    // Set team outcomes before emitting the final frame, including eliminated teammates.
    this.s.status = 'finished';
    this.s.winner = winner;
    this.s.reason = reason;
    const draw = ['平局', 'draw'].includes(winner);
    this.s.outcome = {
      draw,
      winners: draw
        ? []
        : this.s.players
            .filter((p) => (p.role === 'wolf') === (winner === 'wolves'))
            .map((p) => p.agentId),
    };
    this.emit('finish', reason, undefined, { winner, outcome: this.s.outcome });
  }
  view(viewer = -1): ArenaObservation {
    const view = this.observation(viewer),
      self = this.p(viewer),
      wolf = self?.role === 'wolf';
    const publicPhase = ['discussion', 'vote', 'hunter'].includes(this.s.phase);
    view.players = this.s.players.map((p) => ({
      ...p,
      role: viewer === -1 || p.seat === viewer || (wolf && p.role === 'wolf') ? p.role : 'unknown',
    }));
    if (
      viewer !== -1 &&
      !publicPhase &&
      viewer !== this.actor &&
      !(wolf && this.s.phase.startsWith('wolf_'))
    ) {
      view.phase = 'night';
      view.active = -1;
      view.pending = null;
    }
    view.speechChannel = publicPhase
      ? 'public'
      : wolf && this.s.phase.startsWith('wolf_')
        ? 'team'
        : 'none';
    view.details = {
      phaseLabel: phaseName(view.phase, this.s.locale),
      reason: this.s.reason,
      ...(publicPhase ? { runoff: [...this.s.runoff], voteRound: this.s.voteRound } : {}),
      ...(self?.role === 'seer' || viewer === -1 ? { visions: { ...this.s.visions } } : {}),
      ...(self?.role === 'witch' || viewer === -1
        ? {
            antidote: this.s.antidote,
            poison: this.s.poison,
            ...(this.s.phase === 'witch' && this.s.antidote
              ? { attacked: [...this.s.victims] }
              : {}),
          }
        : {}),
    };
    return view;
  }
}
export const werewolfRules = (locale: Locale) =>
  locale === 'en'
    ? 'Werewolf, 6–12 players. floor(n/3) wolves, one seer, witch and hunter; others villagers. Roles are seeded and secret. Wolves know teammates and discuss privately at night, then vote to attack a non-wolf; tied wolf votes cause no attack. Seer inspects one living player per night (wolf/not wolf). Witch has one antidote and one poison for the game, at most one potion per night; self-healing only on night one. Deaths resolve together at dawn. Hunter may shoot after attack or exile, but not poison; resolve shot before victory. Day: each survivor speaks, then secret exile ballots are revealed together. A tie has candidate speeches and one runoff; a second tie or all abstaining causes no exile. No self-vote. Roles remain hidden on death. Village wins when all wolves die; wolves win at parity. No sheriff or last words. Chat is only public by day and team-private for wolves at night; other night roles cannot speak.'
    : '狼人杀，6–12人。狼人数量为人数除以3向下取整，预言家、女巫、猎人各一，其余村民。种子随机分配隐藏身份。狼人夜间密谈后投票袭击非狼人，平票无人受袭；预言家每夜查验一名存活玩家是否狼人。女巫全局各一瓶解药和毒药，每夜至多用一瓶，仅首夜可自救。天亮同时结算死亡；猎人被袭击或放逐后可开枪，被毒不能开枪，开枪后再判断胜负。白天每人依次发言，然后秘密投票同时公开结果。平票候选人再次发言后进行一轮重投，再平票或全弃权则无人放逐。不能投自己。死亡不翻牌。狼人全灭好人胜；狼人数量不少于好人时狼人胜。无警长、无遗言。白天交流公开，夜晚仅狼人可密谈，其他夜间角色不能发言。';
export function werewolfHeuristic(view: ArenaObservation) {
  const actions = view.legalActions;
  const heal = actions.find((a) => a.kind === 'heal');
  const candidates = actions.filter((a) => !['skip', 'poison'].includes(a.kind));
  const chosen =
    heal ?? candidates[(view.round + view.viewer) % Math.max(1, candidates.length)] ?? actions[0];
  return {
    actionId: chosen.id,
    reason: view.locale === 'en' ? 'Observation-only baseline' : '仅使用可见信息的基线策略',
    ...(chosen.kind === 'speak'
      ? {
          speech:
            view.locale === 'en'
              ? 'Let us compare claims with votes and observed actions.'
              : '请结合发言、投票与已知行动判断身份。',
        }
      : {}),
  };
}
