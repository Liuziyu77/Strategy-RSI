"""Refresh study links and summary counts after all three per-game reports are published."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
GAMES=['werewolf','chess','xiangqi']
NAMES={'werewolf':('狼人杀','Werewolf'),'chess':('国际象棋','Chess'),'xiangqi':('中国象棋','Xiangqi')}
DATA={g:json.loads((ROOT/'exp'/g/'results.json').read_text()) for g in GAMES}
assert all(d['complete'] and d['verification']['allPassed'] for d in DATA.values())

def table(head,rows):
    return '\n'.join(['| '+' | '.join(head)+' |','| '+' | '.join(['---']*len(head))+' |']+
       ['| '+' | '.join(map(str,r))+' |' for r in rows])

def percent(p):return 'N/A' if p is None else '{:.1%}'.format(p)

for en in [False,True]:
    T=lambda zh,eng:eng if en else zh
    path=ROOT/('README.en.md' if en else 'README.md')
    report='README.en.md' if en else 'README.md'
    s=path.read_text()
    heading='## Experiments and research progress' if en else '## 实验与研究进展'
    start=s.index('\n\n',s.index(heading))+2
    end=s.index('<details>\n<summary><strong>'+('Explore the Sanguosha' if en else '展开三国杀'),start)
    rows=[]
    for g in GAMES:
        d=DATA[g];m=d['aggregate']
        rows.append(['[{}](exp/{}/{})'.format(NAMES[g][en],g,report),168,m['finished'],m['errors'],str(d['budget']['totalGames'])+' / 200'])
    parts=[T('四款游戏的报告按游戏分别保存。狼人杀、国际象棋和中国象棋各安排了 **168 局基线**，计入试跑和功能验证后，每款仍在 **200 局以内**。三国杀沿用此前的 **528 局实验**。基线均关闭 RSI，每次决策传入空经验；另有交流与 RSI 功能检查，但尚未测量 RSI 的学习收益。',
             'Reports are organized by game. Werewolf, Chess and Xiangqi each have **168 scheduled baseline games**, staying within **200 games per game type** after pilots and functionality checks. Sanguosha keeps its earlier **528-game study**. All baselines use empty memory with RSI off. Separate checks cover communication and RSI functionality; they do not measure learning benefits.'),
       table(T(['游戏','正式排程','完成','异常','含试跑与验证 / 上限'],['Game','Baseline','Completed','Errors','Including pilots/checks / cap']),rows)]
    for g in GAMES:
        d=DATA[g];m=d['aggregate'];name=NAMES[g][en]
        secondary='role-win-rate' if g=='werewolf' else 'head-to-head'
        parts+=['<details>\n<summary><strong>'+T('展开'+name+'：168 局结果与六张图表',name+': 168 games and six figures')+'</strong></summary>',
          T('原始 24 局加上新增 144 局，结果为：规则胜负 {}、规则和棋 {}、上限平局 {}、异常 {}。'.format(m['wins'],m['ruleDraws'],m['decisionLimitDraws'],m['errors']),
            'The 24 initial and 144 additional games ended as follows: rule wins {}, rule draws {}, action-limit draws {}, errors {}.'.format(m['wins'],m['ruleDraws'],m['decisionLimitDraws'],m['errors'])),
          table(T(['模型','胜 / 和 / 负','完成参与数','阵营胜率' if g=='werewolf' else '积分率'],['Model','W / D / L','Completed participations','Team win rate' if g=='werewolf' else 'Score']),
             [[d['names'][i],'{}/{}/{}'.format(r['wins'],r['draws'],r['losses']),r['participations'],percent(r['winRate'] if g=='werewolf' else r['score'])] for i,r in enumerate(m['models'])]),
          '<table>\n  <tr>\n'+''.join('    <td width="50%" valign="top">\n      <a href="exp/{}/assets/{}.svg"><img src="exp/{}/assets/{}.svg" alt="{}" width="100%" /></a>\n    </td>\n'.format(g,f,g,f,alt) for f,alt in [('win-rate',T(name+'模型表现及分组区间',name+' performance and clustered intervals')),(secondary,T(name+('角色表现' if g=='werewolf' else '两两交锋'),name+(' role performance' if g=='werewolf' else ' head-to-head')))])+'  </tr>\n</table>',
          T('使用 21 个角色种子，每个种子运行四种模型轮换和中英文两个版本。每模型同局占两席，统计时按角色种子分组，避免把相关席位视为独立样本。' if g=='werewolf' else
            '积分率为 `(胜 + 0.5 × 和) / 完成参与数`。对局均从标准初始位置开始，交换执色后重复。结果仅反映这些开局下成功完成的对局，失败样本可能使比较产生偏差。',
            'Each of the 21 role seeds is used with four model rotations and both languages. Every model has two seats per game. Analysis groups results by role seed to account for related seats.' if g=='werewolf' else
            'Score is `(wins + 0.5 × draws) / completed participations`. Games repeat the standard starting position with colors exchanged. Results describe completed games from these starts; failed games may bias the comparison.'),
          '[{}](exp/{}/{}) · [results.json](exp/{}/results.json) · [plan.json](exp/{}/plan.json)'.format(T('完整报告、RSI 检查与六组图表','Full report, RSI checks and six figures'),g,report,g,g),
          '</details>']
    path.write_text(s[:start]+'\n\n'.join(parts)+'\n\n'+s[end:])
    s=path.read_text()
    marker='- **2026.09.16**'
    if '- **2026.09.17**' not in s:
        idx=s.index(marker)
        s=s[:idx]+T('- **2026.09.17** — 三款新游戏分别扩展至 168 局基线，按游戏独立保存报告、分组统计、历史数据与六组统一尺寸图表。\n',
          '- **2026.09.17** — Expanded each new game to 168 baseline games, with independent reports, clustered analyses, histories and six matching figures per game.\n')+s[idx:]
    path.write_text(s)

p=ROOT/'exp/README.md';s=p.read_text();tail=s[s.index('## 设计 RSI 对照'):];tail=tail[:tail.index('## 后续报告的组织')]
rows=[['三国杀 / Sanguosha','528','489','39','历史实验 / historical study','[中文](sanguosha/README.md) · [English](sanguosha/README.en.md) · [Data](sanguosha/results.json)']]
for g in GAMES:
 d=DATA[g];m=d['aggregate']
 rows.append([' / '.join(NAMES[g]),168,m['finished'],m['errors'],str(d['budget']['totalGames'])+' / 200','[中文]('+g+'/README.md) · [English]('+g+'/README.en.md) · [Data]('+g+'/results.json)'])
intro='''# 实验目录 / Experiments

[项目首页](../README.md#基线实验) · [English README](../README.en.md#experiments) · [文档导航](../docs/README.md)

各游戏的报告、计划、数据与图表放在独立目录中。狼人杀、国际象棋和中国象棋各有 168 局基线，由原始 24 局和新增 144 局组成；计入试跑和功能检查后，每款仍在 200 局以内。三国杀保留原有 528 局实验，没有重跑，结果也未与其他游戏合并。

Reports, plans, data and figures are stored separately for each game. Werewolf, Chess and Xiangqi each have 168 baseline games: 24 initial plus 144 additional games. Including pilots and functionality checks, each remains below 200. The earlier 528-game Sanguosha study keeps its original settings and scope; it was not rerun or pooled with other games.

## 已有报告 / Available reports

'''+table(['游戏 / Game','正式排程 / Baseline','完成 / Completed','异常 / Errors','含试跑验证 / Total & cap','报告与数据 / Reports & data'],rows)+'''

“完成”包括规则胜负、规则和棋及行动上限平局，报告会分别列出。调用失败的对局计入场数和可靠性分析，不记为败局。基线关闭 RSI，每次决策使用空经验；另行保存的 RSI 功能验证只检查流程，尚未测量学习收益。

Completed games include rule wins, rule draws and action-limit draws, listed separately in the reports. Games that fail on model calls count toward budgets and reliability analysis, but are not losses. Baselines use empty memory with RSI off. Separate RSI checks test the workflow without measuring learning benefits.

## 目录与复现 / Layout and reproduction

```text
exp/
  sanguosha/       原始三国杀报告、历史、六组图表
  werewolf/        狼人杀报告、计划、数据、统计、历史、六组图表
  chess/           国际象棋报告、计划、数据、统计、历史、六组图表
  xiangqi/         中国象棋报告、计划、数据、统计、历史、六组图表
  _shared/         仅复用统计与排版代码；不保存跨游戏结果
```

每款新游戏都有 `analyze.py`、`render_figures.py`、`write_report.py` 和 `requirements.txt`，用公开 JSON 即可重算分析、生成图表和报告。六张 PNG 均为 2816 × 1276，另提供 SVG。

原始决策输入、响应和检查点保存在本地 `artifacts/` 中，该目录不提交到仓库。公开历史含全知角色和私聊信息，供研究者复盘，不能直接作为 Agent 输入。

Each new game includes analysis, plotting and report scripts with pinned requirements. Public JSON is enough to regenerate the analyses and reports. All six PNGs are 2816 × 1276, with SVG versions available.

Raw model inputs, responses and checkpoints stay in the local, ignored `artifacts/` directory. Published histories include private roles and chat for research review; they must not be passed directly to Agents.

'''
p.write_text(intro+tail+'''## 后续报告的组织 / Organizing future reports

新增游戏使用 `exp/<game>/`。同一游戏有多批独立实验时，在该目录内按日期或实验编号分组；公共脚本放在 `_shared/`。每份报告保留批次设置、源码哈希、场数预算、异常和停止原因，并链接到对应数据与复现脚本。

Use `exp/<game>/` for each game, with subfolders by date or study ID when adding independent studies. Shared scripts go in `_shared/`. Each report should record cohort settings, source hashes, game budgets, errors and stopping reasons, and link to its data and reproduction scripts.
''')

p=ROOT/'docs/games/README.md';s=p.read_text();start=s.index('[三国杀基线]');end=s.index('\n',s.index('The original [Sanguosha study]',start))
s=s[:start]+'''[三国杀基线](../../exp/sanguosha/README.md)保留原实验设置和范围。[狼人杀](../../exp/werewolf/README.md)、[国际象棋](../../exp/chess/README.md)、[中国象棋](../../exp/xiangqi/README.md)各安排了 168 局真实模型基线，另有 RSI 功能验证，连同试跑均在每款 200 局以内。各报告分别列出胜负、规则和棋、上限平局及异常；功能验证尚未测量 RSI 收益。

The original [Sanguosha study](../../exp/sanguosha/README.en.md) keeps its settings and scope. [Werewolf](../../exp/werewolf/README.en.md), [Chess](../../exp/chess/README.en.md) and [Xiangqi](../../exp/xiangqi/README.en.md) each have 168 scheduled real-model baseline games plus separate RSI checks. Each stays within 200 games including pilots and validation. Reports list rule endings, action limits and failures separately; the checks have not measured RSI benefits.'''+s[end:];p.write_text(s)
p=ROOT/'docs/QUALITY_REVIEW.md';s=p.read_text().replace('[独立实验报告](../exp/multigame/README.md)','[分游戏实验报告](../exp/README.md)');s=s.split('\n\n### 2026-09-17：分游戏扩展实验')[0];s+='''

### 2026-09-17：分游戏扩展实验

三款新游戏各扩展至 168 局基线，报告和图表分别存入 `exp/werewolf/`、`exp/chess/`、`exp/xiangqi/`。上文的 99 局属于此前检查；新报告区分原始 24 局与扩展 144 局，并把所有对局尝试计入每游戏 200 局预算。

统计按配对重复组或角色种子进行 bootstrap，另列失败数及缺失结果界限。运行期间修复了实验脚本鉴权停止分支的变量遮蔽，游戏规则和模型决策协议未改动。
''';p.write_text(s)
print('Updated bilingual project READMEs, experiment index and game/quality documentation.')
