"""Generate a game's bilingual report from audited data and analysis; no model calls."""
from collections import Counter
import hashlib
import json
from pathlib import Path

LABELS={'chess':('国际象棋','Chess'),'xiangqi':('中国象棋','Xiangqi'),'werewolf':('狼人杀','Werewolf')}

def table(headers, rows):
    def cell(x): return str(x).replace('|','\\|').replace('\n',' ')
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+
                     ['| '+' | '.join(cell(x) for x in row)+' |' for row in rows])

def pct(x): return 'N/A' if x is None else '{:.1%}'.format(x)
def interval(x): return 'N/A' if x is None else '{}–{}'.format(pct(x[0]),pct(x[1]))


def write(root, input_path=None, output_path=None):
    root=Path(root); source=Path(input_path) if input_path else root/'results.json'
    out=Path(output_path) if output_path else root
    d=json.loads(source.read_text());a=json.loads(source.with_name('analysis.json').read_text())
    assert a['inputSha256']==hashlib.sha256(source.read_bytes()).hexdigest()
    if out.resolve()==root.resolve():assert d['complete'] and d['verification']['allPassed']
    out.mkdir(parents=True,exist_ok=True)
    game=d['gameType'];wolf=game=='werewolf';m=d['aggregate'];b=d['budget'];u=d['baselineUsage']
    names=dict(zip(d['models'],d['names']));checks=d['validation']['checks']
    clean=sum(bool(c['ok']) for c in checks)
    verrors=sum(len(c.get('callErrors',[])) for c in checks)
    fallbacks=sum(c.get('fallbacks',0) for c in checks)
    conso=[j for c in checks for j in c.get('consolidations',[])]
    for en in [False,True]:
        T=lambda zh,eng: eng if en else zh
        title=LABELS[game][en]
        langfile='README.en.md' if en else 'README.md'
        parts=['# '+T(title+'四模型基线实验',title+': four-model baseline'),
          T('[项目首页](../../README.md#基线实验) · [实验索引](../README.md) · [English](README.en.md)',
            '[Project](../../README.en.md#experiments) · [Experiments](../README.md) · [中文](README.md)')+
          ' · [results.json](results.json) · [analysis.json](analysis.json) · [plan.json](plan.json)',
          T(title+'基线共安排 **168 局**：原始 24 局加上本次扩展的 144 局，'
            '最终 {} 局完成、{} 局异常。计入此前试跑和功能验证后，共运行 {} 局，上限为 200 局。异常局保留在记录中，没有补跑替换。'.format(m['finished'],m['errors'],b['totalGames']),
            'The '+title+' baseline scheduled **168 games**: 24 initial games plus 144 in the extension. '
            '{} completed and {} failed. Including earlier pilots and functionality checks, {} games were started against a cap of 200. Failed games remain in the records and were not replaced.'.format(m['finished'],m['errors'],b['totalGames']))]
        if not d['complete']:parts.append(T('**仅供内部排版检查：实验尚未完成，以下是部分数据。**','**Internal layout preview: the experiment is incomplete; results below are partial.**'))
        parts += ['## '+T('实验设置与场数','Setup and game budget')]
        schedule={'chess':T('6 组模型配对 × 2 种执色 × 2 种语言 × 7 次重复 = 168 局。','6 model pairs × 2 colors × 2 languages × 7 repetitions = 168 games.'),
          'xiangqi':T('6 组模型配对 × 2 种执色 × 14 次重复 = 168 局，仅中文。','6 model pairs × 2 colors × 14 repetitions = 168 games, Chinese only.'),
          'werewolf':T('8 人局；21 个角色洗牌种子 × 4 种模型循环轮换 × 2 种语言 = 168 局。每模型每局占两个席位。','8 players; 21 role-shuffle seeds × 4 cyclic model rotations × 2 languages = 168 games. Each model occupies two seats in every game.')}[game]
        parts.append(schedule)
        if wolf:
            parts.append(T('固定角色为 2 狼人、1 预言家、1 女巫、1 猎人、3 村民，覆盖夜间行动、白天讨论、投票与结算。排程中每模型合计 336 个席位：狼人 84、预言家 42、女巫 42、猎人 42、村民 126。中英文共享同组角色种子；种子为 `930001 + 997 × block`，block 取 0–20。',
              'Roles: 2 wolves, 1 seer, 1 witch, 1 hunter and 3 villagers, with night actions, discussion, voting and outcomes. Each model has 336 scheduled seats: 84 wolf, 42 seer, 42 witch, 42 hunter and 126 villager. Both languages use the same role seeds: `930001 + 997 × block`, for blocks 0–20.'))
        else:
            parts.append(T('所有对局都从标准初始棋盘开始，`seed=42` 不会改变开局。重复对局用于观察模型在相同起点下的响应差异，未测试其他初始局面。每模型安排 84 局，先后手各 42 局。',
              'Every game starts from the standard initial board; `seed=42` leaves that position unchanged. Repetitions sample response variation from this starting point. Other starting positions were not tested. Each model has 84 scheduled games, 42 in each color.'))
        parts.append(table(T(['项目','设置'],['Item','Setting']),[
            [T('模型','Models'),'<br>'.join('`'+x+'`' for x in d['models'])],
            [T('规则版本','Rules version'),json.loads((root/'plan.json').read_text())['rule']],
            [T('语言','Languages'),T('中文','Chinese') if game=='xiangqi' else T('中文 84 局 / 英文 84 局','84 Chinese / 84 English games')],
            [T('交流与经验','Chat and memory'),T('交流开启；每次决策传入空经验；RSI 关闭','Chat on; empty memory for every decision; RSI off')],
            [T('上下文','Context'),T('最近 80 条可见事件、40 条可见聊天；生产决策提示词与协议','Latest 80 visible events and 40 visible chat messages; production prompts and protocol')],
            [T('采样与输出（请求值）','Sampling/output (requested)'),'temperature=0.6; reasoning_effort=low; max_tokens=8192'],
            [T('超时与重试','Timeout and retries'),T('180 秒；每次决策最多 2 次已记录尝试；暂停取消的请求另计；保留网关 400/422 兼容重试','180 seconds; at most 2 recorded decision attempts, excluding pause cancellations; production 400/422 gateway compatibility retry retained')],
            [T('行动上限','Action limit'),200 if wolf else 160],
            [T('兜底与协议适配','Fallback and adaptation'),T('无启发式兜底、无行动标签修正；无选择的强制行动可自动执行','No heuristic fallback or label-to-ID adaptation; forced no-choice actions may execute automatically')],
            [T('执行批次','Execution cohorts'),T('原始：16 局 / 每模型 8 请求；新增：三游戏共享 96 局 / 每模型 24 请求上限','Initial: 16 games / 8 requests per model; extension: shared pool across three games, 96 games / 24 requests per model')],
        ]))
        parts.append(table(T(['用途','局数','是否计入模型表现'],['Purpose','Games','Included in performance']),[
          [T('正式基线','Formal baseline'),168,T('是；异常单列','Yes; errors reported separately')],
          [T('4,096 Token 试跑','4,096-token pilot'),b['pilot'],T('否','No')],
          [T('原 4,096 Token 功能验证','Original 4,096-token validation'),b['validation4096'],T('否，含中断','No; includes interruptions')],
          [T('8,192 Token 功能验证','8,192-token validation'),b['validation8192'],T('否','No')],
          [T('实际总数 / 上限','Total started / cap'),str(b['totalGames'])+' / 200',''],
        ]))
        parts.append(T('扩展启动时，类型检查发现运行脚本的鉴权错误分支重复使用了一个路径变量名。暂停修复后，从原检查点继续，未重建或替换对局。暂停时取消的 HTTP 请求仍记入用量账本，缺失的 usage 未作估算。修订和旧版脚本快照见 [amendments.json](amendments.json)。',
          'A startup TypeScript check found a shadowed path variable in the authentication-error branch. The run was paused for the fix, then resumed from the same checkpoints without replacing games. Canceled HTTP requests remain in the usage ledger; missing usage was not estimated. See [amendments.json](amendments.json) for the change and earlier runner snapshot.'))
        parts += ['## '+T('结果图表','Results and figures')]
        top=max((r for r in a['models'] if r['estimate'] is not None),key=lambda r:r['estimate'])
        captions=[
          ('win-rate',T('模型阵营胜率' if wolf else '模型积分率','Team win rate' if wolf else 'Model score'),
            T('在已完成的对局中，{} 的点估计最高，为 {}，95% 分组区间为 {}。失败局被排除后，样本可能存在选择偏差；仅凭此图不能确定模型排名的统计显著性。'.format(names[top['model']],pct(top['estimate']),interval(top['ci95'])),
              '{} has the highest estimate among completed games at {}, with a 95% clustered interval of {}. Excluding failed games may bias the sample, and this figure alone does not establish a statistically significant ranking.'.format(names[top['model']],pct(top['estimate']),interval(top['ci95'])))),
          ('role-win-rate' if wolf else 'head-to-head',T('分角色表现' if wolf else '两两交锋','Performance by role' if wolf else 'Head-to-head'),
            T('每格列出该角色的阵营胜率和完成席位数。队友共享阵营胜负，同一模型的两个席位也来自同一局，因此这些记录相互关联。' if wolf else '行模型对列模型，和棋计半分；每对模型计划 28 局，格子标明实际完成局数。',
              'Cells show team win rates and completed seat counts for each role. Teammates share a faction outcome, and both seats of a model come from the same game, so these records are related.' if wolf else 'Row model versus column opponent, with half credit for draws. Each pair has 28 scheduled games; cells show completed counts.')),
          ('game-duration',T('对局长度','Game duration'),T('完成与异常分别展示行动数和累计运行时长。点为对局，粗线为四分位区间，细线为 5%–95% 分位数。','Completed and failed games are shown separately. Dots are games; thick lines are interquartile ranges and thin lines span the 5th–95th percentiles.')),
          ('reliability',T('协议可靠性与结局','Protocol reliability and endings'),T('规则胜负 {}、规则和棋 {}、行动上限平局 {}、异常 {}。异常局没有胜负结果，不计入模型败局。'.format(m['wins'],m['ruleDraws'],m['decisionLimitDraws'],m['errors']),
            'Rule wins: {}; rule draws: {}; action-limit draws: {}; errors: {}. An error is not scored as a model loss.'.format(m['wins'],m['ruleDraws'],m['decisionLimitDraws'],m['errors']))),
          ('token-use',T('Token 消耗','Token use'),T('正式基线记录 {} 次 HTTP 请求；输入 {:,} Token、输出 {:,} Token，{} 次请求缺少 usage。'.format(u['requests'],u['promptTokens'],u['completionTokens'],u['requests']-u['usageReported']),
            'The baseline records {} HTTP requests: {:,} input and {:,} output tokens; {} requests lack usage.'.format(u['requests'],u['promptTokens'],u['completionTokens'],u['requests']-u['usageReported']))),
          ('chat-frequency',T('模型交流频率','Communication frequency'),T('统计完成局中模型决策附带发言的比例，排除强制行动。'+('发言包含公开聊天和狼人队内密谈。' if wolf else '发言取自决策产生的公开聊天事件。'),'The figure shows the share of model decisions with speech in completed games, excluding forced actions. '+('Speech includes public and wolf-team messages.' if wolf else 'Speech is counted from public chat events produced by decisions.'))),
        ]
        for idx,(filename,heading,caption) in enumerate(captions,1):
            parts += ['### {}. {}'.format(idx,heading),
              '[![{}](assets/{}.svg)](assets/{}.svg)'.format(heading,filename,filename),caption]
        parts += ['## '+T('分母、语言与批次','Denominators, languages and cohorts'),
          table(T(['模型','胜 / 和 / 负','完成参与数','点估计','95% 分组区间','缺失结果极端界限'],['Model','W / D / L','Completed n','Estimate','95% clustered interval','Missing-outcome bounds']),
            [[names[r['model']],'{}/{}/{}'.format(r['wins'],r['draws'],r['losses']),r['participations'],pct(r['estimate']),interval(r['ci95']),interval(r['missingOutcomeBounds'])] for r in a['models']])]
        parts.append(T('缺失结果极端界限分别假设所有失败参与得 0 分或 1 分，再除以全部排程参与数，用于显示未完成结果可能造成的范围；它不是置信区间。',
          'Missing-outcome bounds assign every failed participation either zero or one point, then divide by all scheduled participations. They show the possible range left by missing outcomes, not a confidence interval.'))
        parts.append(T('阵营胜率为胜利席位数除以完成席位数，平局计 0 胜。同一模型每局占两席，完成参与数因此是完成局数的两倍。',
          'Team win rate is winning seats divided by completed seats; draws contribute zero wins. Each model occupies two seats per game, so its participation count is twice the completed game count.') if wolf else T(
          '积分率为 `(胜 + 0.5 × 和) / 完成参与数`，只使用该模型完成的对局。胜率则为胜场除以完成参与数。',
          'Score is `(wins + 0.5 × draws) / completed participations`, using only games the model completed. Win rate is wins divided by completed participations.'))
        parts.append(table(T(['语言','排程','完成','异常']+d['names'],['Language','Planned','Completed','Errors']+d['names']),
          [[r['locale'],r['planned'],r['finished'],r['errors']]+['{} (n={})'.format(pct(v['winRate'] if wolf else v['score']),v['participations']) for v in r['models']] for r in d['byLanguage']]))
        parts.append(table(T(['批次','排程','完成','异常']+d['names'],['Cohort','Planned','Completed','Errors']+d['names']),
          [[c['id'],c['games'],c['finished'],c['errors']]+['{} (n={})'.format(pct(v['estimate']),v['n']) for v in next(x for x in a['byCohort'] if x['cohort']==c['id'])['models']] for c in d['cohorts']]))
        parts.append(T('两批实验的规则、提示词和决策参数相同，但运行日期、网关负载和并发不同。'+('本游戏只测试中文；批次表用于描述结果，不能据此推断并发的影响。' if game=='xiangqi' else '语言与批次表用于描述结果，不能据此推断语言或并发的因果影响。'),
          'Both cohorts used the same rules, prompts and decision parameters, but ran on different dates with different gateway load and concurrency. '+('Only Chinese was tested. Cohort results are descriptive and cannot isolate the effect of concurrency.' if game=='xiangqi' else 'Language and cohort results are descriptive and cannot isolate the effects of language or concurrency.')))
        endings = [
            ('认输','Resignation'),('将死','Checkmate'),('双方同意和棋','Draw by agreement'),
            ('逼和','Stalemate'),('子力不足','Insufficient material'),('五次重复局面','Fivefold repetition'),
            ('七十五回合无吃子或兵移动','Seventy-five-move rule'),
            ('三次重复或五十回合申请和棋','Draw claimed by repetition or fifty-move rule'),
            ('困毙','Stalemate loss'),('单方长将判负','Loss by perpetual check'),
            ('三次重复局面','Threefold repetition'),('连续六十回合无吃子','Sixty rounds without capture'),
            ('狼人全部出局，好人获胜','All werewolves eliminated. Village wins.'),
            ('狼人数量达到或超过好人，狼人获胜','Werewolves reach parity. Wolves win.'),
            ('达到配置的决策上限','Decision limit reached')]
        aliases={v:pair[en] for pair in endings for v in pair}
        counts=Counter(aliases.get(g['reason'],g['reason']) for g in d['games'] if g['status']=='finished')
        parts.append(table(T(['完成局结算原因','局数'],['Ending reason','Games']),counts.most_common()))
        parts += ['## '+T('统计方法与解释边界','Statistical methods and limits')]
        unit=T('按 21 个角色种子整组重采样，同种子的四种轮换和两种语言始终在同一组。',
               'Resample the 21 role seeds as clusters, keeping all four rotations and both languages together.') if wolf else T(
               '先按模型配对分层，再在每对模型内部重采样重复组。'+('每对 7 组，同组的执色和语言不拆开。' if game=='chess' else '每对 14 组，同组的两种执色不拆开。'),
               'Stratify by model pair, then resample repetition blocks within each pair. '+('Each pair has 7 blocks, with colors and languages kept together.' if game=='chess' else 'Each pair has 14 blocks, with both colors kept together.'))
        parts += [unit+T('固定随机种子 20260917，进行 20,000 次 bootstrap；每次重新计算完成样本的指标，取 2.5% 与 97.5% 分位数。异常局随整组重采样，但不进入完成分母。',
          ' Use 20,000 bootstrap replicates with seed 20260917. Recompute the metric over completed participations in each replicate and take the 2.5th and 97.5th percentiles. Failed games stay in their resampled clusters but outside the completed denominator.'),
          T('区间仅描述完成样本，未校正选择性失败或多重比较。'+('实验固定为 8 人角色配置，无法据此判断其他人数、角色组合或模型版本的表现。' if wolf else '实验只使用标准初始局面和有限次重复，无法据此判断其他开局或模型版本的表现。')+'达到行动上限记为实验性平局，与规则和棋单独统计。',
            'Intervals describe completed samples and are not corrected for selective failure or multiple comparisons. '+('The study uses one 8-player role configuration; it does not establish performance for other player counts, roles or model versions.' if wolf else 'The study uses the standard starting position with limited repetitions; it does not establish performance for other openings or model versions.')+' Action-limit draws are experimental stopping conditions and are counted separately from rule draws.'),
          T('基线关闭 RSI，每次决策传入空经验，因此没有测量学习收益。交流频率只记录发言多少，不能说明发言质量或交流是否提高胜率。',
            'RSI is off and every baseline decision receives empty memory, so the study does not measure learning benefits. Speech frequency records how often models talk; it does not measure quality or establish whether chat improves outcomes.'),
          T('累计运行时长包含服务等待、请求排队和存档开销，并扣除暂停期间进程未运行的时间。它反映本次运行的耗时，不能直接用于比较模型速度。',
            'Accumulated run time includes provider waits, request queues and checkpoint writes, with downtime between segments removed. It describes this run and cannot directly rank model speed.')]
        parts += ['## '+T('调用失败与功能验证','Model-call failures and functionality checks')]
        parts.append(table(T(['模型','决策尝试','通过','拒绝','Token 截断','非法行动','标签当 ID','终止对局'],['Model','Attempts','Accepted','Rejected','Truncated','Illegal action','Label as ID','Terminal errors']),
          [[names[r['model']],r['attempts'],r['accepted'],r['rejected'],r['truncated'],r['illegalAction'],r['usedLabelAsId'],sum(g['status']=='error' and (g['error'] or '').startswith('Model decision failed: '+r['model']+':') for g in d['games'])] for r in d['reliabilityByModel']]))
        parts.append(T('一局需要连续完成多次决策，任何一步的两次尝试都失败就会终止，所以单次响应通过率高也未必能完成整局。表中“终止对局”归给最后一次决策失败的模型，用于定位协议问题，不计作败局。','A game needs many successful decisions in sequence. If both attempts at any step fail, the game ends in error, so a high response acceptance rate may still produce many unfinished games. Terminal errors are attributed to the model making the final failed decision for diagnosis; they are not losses.'))
        attempts=sum(r['attempts'] for r in d['reliabilityByModel'])
        parts.append(T('“标签当 ID”指模型把合法行动的显示文字填进了 ID 字段。这些响应属于被拒绝的动作，因此各错误列有重叠，不能直接相加。基线中的失败决策不会由本地策略补走。逐次拒绝原因见 `games[].rejections`。',
          '"Label as ID" counts responses that put the exact display label of a legal action in the ID field. These are rejected actions, so error categories overlap and cannot be added together. Failed baseline decisions are not replaced by local play. See `games[].rejections` for individual reasons.'))
        parts.append(T('HTTP 账本比保存的决策尝试多 {} 条，来自协议兼容重试或暂停时取消的请求等。一次决策可能发送多个请求，请求数与对局数分别统计。'.format(u['requests']-attempts),
          'The HTTP ledger has {} more records than saved decision attempts, from compatibility retries, pause cancellations and similar requests. A decision can send more than one request; requests and games are counted separately.'.format(u['requests']-attempts)))
        parts.append(T('另以 8,192 Token 输出额度运行了 {} 局功能验证，其中 {} 局通过全部检查，记录 {} 次兜底行动和 {} 条调用错误，归纳成功 {} / {}。'.format(len(checks),clean,fallbacks,verrors,sum(j['status']=='completed' for j in conso),len(conso))+'验证的行动上限为 {}，用于检查短局流程，不计入上面的模型表现。'.format(32 if wolf else 20),
          'Separate functionality checks used an 8,192-token output limit across {} games; {} passed all checks. Fallback actions: {}; call errors: {}; successful consolidation jobs: {} / {}.'.format(len(checks),clean,fallbacks,verrors,sum(j['status']=='completed' for j in conso),len(conso))+' These short checks used an action cap of {} and are excluded from performance estimates.'.format(32 if wolf else 20)))
        parts.append(table(T(['验证对局','全项通过','即时 RSI','赛后 RSI','归纳成功','兜底','调用错误'],['Validation game','Clean pass','Immediate RSI','Round RSI','Consolidations','Fallbacks','Call errors']),
          [[c['id'],str(bool(c['ok'])),c.get('immediateReflections',0),c.get('roundReflections',0),
           '{}/{}'.format(sum(j['status']=='completed' for j in c.get('consolidations',[])),len(c.get('consolidations',[]))),c.get('fallbacks',0),len(c.get('callErrors',[]))] for c in checks]))
        parts.append(T('审计复核了 {} 份已保存上下文，检查可见信息、提示词语言和经验所属游戏，并验证存档恢复与 HTTP 回放。{} 次决策读取了已有经验，其中 {} 次读取了归纳经验。'.format(sum(c.get('auditedContexts',0) for c in checks),sum(c.get('memoryConsumed',0) for c in checks),sum(c.get('consolidatedMemoryConsumed',0) for c in checks))+('狼人角色和队内聊天也按座位检查可见范围。' if wolf else ''),
          'The audit checked {} saved contexts for visible information, prompt language and memory scope, along with checkpoint recovery and HTTP replay. Existing memory was read in {} decisions, including consolidated memory in {}.'.format(sum(c.get('auditedContexts',0) for c in checks),sum(c.get('memoryConsumed',0) for c in checks),sum(c.get('consolidatedMemoryConsumed',0) for c in checks))+(' Private roles and team chat were also checked against seat visibility.' if wolf else '')))
        parts.append(T('错误调用若未保存输入，就无法核查其上下文。最初 4,096 Token 试跑与验证中的失败和中断仍保存在 `pilot`、`originalValidation` 中。',
          'Error calls without saved inputs could not be audited for context. Failures and interruptions from the original 4,096-token pilot and validation remain under `pilot` and `originalValidation`.'))
        if wolf:
            parts.append(T('英文验证中，DeepSeek 的一次归纳返回了文本数组，原解析器未能接受。修复后，在验证库副本上回放保存的响应，并通过真实 API 复验，新增对局数为 0。原验证的通过数未改写，修复记录另见 `consolidationRecovery`。',
              'During English validation, one DeepSeek consolidation returned a text array that the parser rejected. After the fix, the saved response was replayed and a live API retry was run on a copy of the validation database. This added zero games. Original pass counts were kept unchanged; the recovery is recorded in `consolidationRecovery`.'))
        parts += ['## '+T('用量与数据审计','Usage and data audit')]
        parts.append(table(T(['用途','HTTP 请求','有 usage','输入 Token','输出 Token'],['Phase','HTTP requests','With usage','Input tokens','Output tokens']),
          [[k,v['requests'],v['usageReported'],'{:,}'.format(v['promptTokens']),'{:,}'.format(v['completionTokens'])] for k,v in [('baseline',u)]+list(d['auxiliaryUsage'].items())]))
        parts.append(T('Token 按供应商返回的 usage 统计，输出量可能包含不可见的推理。缺失 usage，以及最初验证中断时尚未写入的在途请求，均未补估。四模型连通性探测和输出额度诊断没有创建对局，作为共享请求记录，不分摊到单个游戏。',
          'Token counts come from provider-reported usage; output may include hidden reasoning. Missing usage was not estimated, including requests still in flight when the original validation was interrupted. Connectivity probes and output-limit diagnostics created no games and are recorded as shared requests without allocation to individual games.'))
        parts.append(T('离线审计从每局初始状态重放了 {} 个行动，检查 {} 份模型输入的可见信息和空经验，并核对最终状态。全部 {} 局通过审计。'.format(d['verification']['actions'],d['verification']['modelInputs'],d['verification']['games']),
          'The offline audit replayed {} actions from the initial states, checked visible information and empty memory in {} model inputs, and compared final states. All {} games passed.'.format(d['verification']['actions'],d['verification']['modelInputs'],d['verification']['games'])))
        parts.append(T('审计和绘图不调用模型。原始输入、响应与检查点保存在本地 `artifacts/`；公开文件提供摘要和完整行动历史，不含 API 密钥。',
          'Auditing and plotting make no model calls. Raw inputs, responses and checkpoints stay in local `artifacts/`; public files contain summaries and complete action histories, without API keys.'))
        parts += ['## '+T('文件与复现','Files and reproduction')]
        parts.append(table(T(['文件','内容'],['File','Contents']),[
          ['[results.json](results.json)',T('逐局摘要、语言与批次结果、调用与 RSI 检查','Per-game summaries, language/cohort counts, calls and RSI checks')],
          ['[analysis.json](analysis.json)',T('分组区间、缺失界限、矩阵和时长统计','Clustered intervals, missing-outcome bounds, matrices and duration statistics')],
          ['[games-history.json.gz](games-history.json.gz)',T('全知研究历史：角色、行动、理由、私聊和最终状态；不是 Agent 输入','Omniscient research history: roles, actions, reasons, private chat and final state; not Agent input')],
          ['[config.example.yaml](../_shared/config.example.yaml)',T('共用配置示例，不含密钥；EXPERIMENT_ENV 指定私有配置路径','Shared credential-free config example; EXPERIMENT_ENV selects a private config file')],
          ['[plan.json](plan.json) · [amendments.json](amendments.json)',T('固定排程、场数预算、协议、源码哈希与修订','Fixed schedule, game budget, protocol, source hashes and amendment')],
          ['[provenance.json](provenance.json) · [source-snapshot.tar.gz](source-snapshot.tar.gz)',T('数据与源码校验；旧运行器也保留在快照中','Data/source verification; the earlier runner is also preserved in the snapshot')],
          ['[provenance/](provenance/)',T('该游戏原始 24 局计划和试跑记录','This game’s initial 24-game plan and pilot records')],
          ['[共享历史源码](../_shared/provenance/)' if not en else '[Shared historical sources](../_shared/provenance/)',T('三款游戏共用的原始源码快照、验证运行时、零对局诊断与校验清单','Identical source snapshots, validation runtime, zero-game diagnostics and checksums shared by the three games')],
          ['[assets/](assets/)',T('六张 SVG 与同尺寸 PNG，及生成来源清单','Six SVGs, matching PNGs, and generation provenance')],
        ]))
        parts.append(T('在仓库根目录，仅用公开 JSON 重算分析和图表：','From the repository root, reproduce analysis and figures using public JSON only:'))
        parts.append('```bash\npython3 -m venv .venv-exp\n. .venv-exp/bin/activate\npip install -r exp/_shared/requirements.txt\npython3 exp/reproduce.py '+game+'\n```')
        parts.append(T('统一入口 [reproduce.py](../reproduce.py) 依次生成分析、图表和报告，也可在游戏名后加 `analyze`、`figures` 或 `report` 只运行一步。实现位于 [../_shared/](../_shared/)，数据和输出仍保存在本游戏目录。图表参考 [三国杀](../sanguosha/README.md) 的卡片版式，提供 2816 × 1276 PNG 和 SVG。',
          'The shared entry point [reproduce.py](../reproduce.py) runs analysis, figures and reports in order. Append `analyze`, `figures` or `report` after the game name to run one step. Code lives in [../_shared/](../_shared/); data and outputs stay in this game directory. Figures follow the [Sanguosha](../sanguosha/README.en.md) card layout, with 2816 × 1276 PNG and SVG versions.'))
        parts.append(T('本地保留完整原始实验目录时，可离线重新导出并审计本游戏：','With the complete original local experiment artifacts available, re-export and audit this game offline:'))
        parts.append('```bash\nnpx tsx scripts/export-game-results.ts --game '+game+'\n```')
        parts.append(T('公开数据、场数、历史、分母与图表哈希的独立检查：','Independently check public data, budgets, histories, denominators and figure hashes:'))
        parts.append('```bash\npython3 scripts/experiments/verify_studies.py\n```')
        parts.append(T('运行实验使用 [run-game-baselines.ts](../../scripts/run-game-baselines.ts)，它从指定 `.env` 读取 `api_key_env_yh` 并调用付费 API。加 `--check` 时只检查排程与本地规则。续跑使用原游戏 ID 和检查点，跳过已结束局，每游戏最多 200 局。',
          'Run experiments with [run-game-baselines.ts](../../scripts/run-game-baselines.ts). It reads `api_key_env_yh` from the specified `.env` and calls the paid API. With `--check`, it only validates the schedule and local rules. Resuming reuses game IDs and checkpoints, skips ended games, and enforces the 200-game cap per game type.'))
        parts.append(T('重新执行实验还需要本地历史账本 `artifacts/multigame-20260916/public-archive/`。查看报告、重算公开统计或绘图都不需要这份账本。',
          'Executing the study also requires the local historical ledger at `artifacts/multigame-20260916/public-archive/`. Reading reports, recomputing public statistics and plotting do not require it.'))
        parts.append(T('读取公开历史示例：','Read the public history:'))
        parts.append(T('`games-history.json.gz` 是 gzip 压缩的 JSON，包含全部 168 局正式基线（包括异常局），每局保存 `players`、`actions`、`events` 和 `finalState`。聊天保存在 `events` 中的 `chat` 事件里，公开发言和队内密谈均保留原可见性标记。试跑与 RSI 验证在 `results.json` 中保留摘要，完整输入和响应留在本地 `artifacts/`。',
          '`games-history.json.gz` is gzip-compressed JSON containing all 168 formal baseline games, including errors. Each game stores `players`, `actions`, `events` and `finalState`. Chat appears as `chat` events, with original visibility markers for public and team messages. Pilot and RSI checks have summaries in `results.json`; full inputs and responses remain in local `artifacts/`.'))
        parts.append('```python\nimport gzip, json\nwith gzip.open("exp/'+game+'/games-history.json.gz", "rt", encoding="utf-8") as f:\n    history = json.load(f)\nprint(len(history["games"]))\ngame = history["games"][0]\nprint(game["job"])\nchat = [event for event in game["events"] if event["type"] == "chat"]\nprint(len(game["actions"]), len(chat))\n```')
        (out/langfile).write_text('\n\n'.join(parts)+'\n')
    print('Wrote bilingual report: '+game)
