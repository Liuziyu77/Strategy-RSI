"""Independently verify public per-game study counts, histories, statistics and figure hashes.

Run from the repository root after publishing: python3 scripts/experiments/verify_studies.py
No model calls or private credentials are required.
"""
from collections import Counter
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import struct
import tarfile

ROOT=Path(__file__).resolve().parents[2]
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
summary={}
all_unique=[]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--game',choices=['chess','xiangqi','werewolf'],help='Verify one completed study independently.')
args=parser.parse_args()
shared=ROOT/'exp/_shared/provenance'
shared_manifest=read(shared/'manifest.json')
for file,digest in shared_manifest['files'].items():
    assert sha(shared/file)==digest, 'Shared historical file changed: '+file

def verify_snapshot(path, expected):
    with tarfile.open(path, 'r:gz') as archive:
        for file,digest in expected.items():
            with archive.extractfile(file) as source:
                assert hashlib.sha256(source.read()).hexdigest()==digest, str(path)+': '+file

with tarfile.open(shared/'initial-validation-runtime-snapshot.tar.gz', 'r:gz') as archive:
    runtime_manifest=json.load(archive.extractfile('manifest.json'))
verify_snapshot(shared/'initial-validation-runtime-snapshot.tar.gz',runtime_manifest['files'])
expected_totals={'chess':180,'xiangqi':175,'werewolf':176}
selected=[args.game] if args.game else list(expected_totals)
old_raw=ROOT/'artifacts/multigame-20260916/baseline'
new_raw=ROOT/'artifacts/game-baselines-20260917'
private_available=(old_raw/'requests.json').exists() and (new_raw/'requests.json').exists()
private_requests=(read(old_raw/'requests.json')+read(new_raw/'requests.json')) if private_available else []
for game in selected:
    expected_total=expected_totals[game]
    root=ROOT/'exp'/game
    verify_snapshot(shared/'initial-source-snapshot.tar.gz',read(root/'provenance/initial-plan.json')['sourceHashes'])
    verify_snapshot(shared/'pilot-source-snapshot.tar.gz',read(root/'provenance/pilot.json')['sourceHashes'])
    d=read(root/'results.json');plan=read(root/'plan.json');a=read(root/'analysis.json')
    assert d['complete'] and d['verification']['allPassed']
    assert d['recordedBaseline']==d['plannedBaseline']==len(d['games'])==168
    assert plan['budget']==d['budget']
    assert d['totalRecordedGames']==plan['budget']['totalGames']==expected_total<=200
    assert len(plan['jobs'])==168 and len({j['id'] for j in plan['jobs']})==168
    assert {j['id'] for j in plan['jobs']}=={g['id'] for g in d['games']}
    assert len(d['pilot']['games'])+len(d['validation']['checks'])+len(d['originalValidation']['checks'])+168==expected_total
    assert {g['gameType'] for g in d['games']}=={game}
    all_unique.extend(g['id'] for g in d['games'])
    expected_locales={'zh':168} if game=='xiangqi' else {'zh':84,'en':84}
    assert Counter(j['locale'] for j in plan['jobs'])==expected_locales
    assert Counter(g['cohort'] for g in d['games'])=={'initial-20260916':24,'extension-20260917':144}
    assert d['verification']['games']==168
    assert d['verification']['actions']==sum(g['decisions'] for g in d['games'])
    assert d['verification']['modelInputs']==sum(g['modelAttempts'] for g in d['games'])
    for audit in d['verification']['details']:
        assert all(audit[k] for k in ['legalReplay','visibleContext','emptyMemory','finalState'])
    for metric in [d['aggregate']]+d['byLanguage']:
        games=[g for g in d['games'] if metric['locale']=='all' or g['locale']==metric['locale']]
        finished=[g for g in games if g['status']=='finished']
        assert metric['recorded']==metric['planned']==len(games)
        assert metric['finished']==len(finished)
        assert metric['finished']+metric['errors']==len(games)
        assert metric['wins']==sum(not g['draw'] for g in finished)
        assert metric['ruleDraws']==sum(g['draw'] and not g['decisionLimit'] for g in finished)
        assert metric['decisionLimitDraws']==sum(g['draw'] and g['decisionLimit'] for g in finished)
        assert metric['wins']+metric['ruleDraws']+metric['decisionLimitDraws']==len(finished)
        for r in metric['models']:
            seats=[(g,p) for g in finished for p in g['players'] if p['model']==r['model']]
            wins=sum(p['won'] for g,p in seats);draws=sum(g['draw'] for g,p in seats)
            assert r['participations']==len(seats)==r['wins']+r['draws']+r['losses']
            assert r['wins']==wins and r['draws']==draws
            assert r['score']==((wins+.5*draws)/len(seats) if seats else None)
            assert r['winRate']==(wins/len(seats) if seats else None)
            assert sum(v['n'] for v in r['roles'].values())==len(seats)
            own=[b for g in finished for b in g['behaviour'] if b['model']==r['model']]
            assert r['modelDecisions']==sum(b['decisions'] for b in own)
            assert r['speakingDecisions']==sum(b['speaking'] for b in own)
    h=json.loads(gzip.decompress((root/'games-history.json.gz').read_bytes()))
    assert h['gameType']==game and len(h['games'])==168
    by_id={g['id']:g for g in d['games']}
    role_counts=[Counter() for _ in d['models']]
    for record in h['games']:
        g=by_id[record['job']['id']]
        assert g['status']==record['status']
        assert g['decisions']==len(record['actions'])==g['modelDecisions']+g['forcedActions']
        assert len(record['players'])==(8 if game=='werewolf' else 2)
        assert [{k:p[k] for k in ['seat','model','role','alive','won']} for p in record['players']]==g['players']
        if game=='werewolf':
            for p in record['players']:role_counts[d['models'].index(p['model'])][p['role']]+=1
        else:
            assert len({p['model'] for p in record['players']})==2
        for r in record['actions']:assert r['source'] in ['llm','forced']
        if g['status']=='finished':
            assert record['finalState']['status']=='finished'
            outcome=record['finalState']['outcome']
            assert bool(outcome.get('draw'))==g['draw']
            assert {p['agentId'] for p in record['players'] if p['won']}==set(outcome['winners'])
            winners=[p for p in record['players'] if p['won']]
            if g['draw']:assert not winners
            elif game=='werewolf':
                assert len(winners) in [2,6]
                assert all((p['role']=='wolf')==(len(winners)==2) for p in winners)
            else:assert len(winners)==1
    if game=='werewolf':
        assert all(r=={'wolf':84,'seer':42,'witch':42,'hunter':42,'villager':126} for r in role_counts)
        assert len(a['method']['strata'])==1 and list(a['method']['strata'].values())==[21]
    else:
        for i in range(4):
            for seat in range(2):assert sum(j['models'][seat]==i for j in plan['jobs'])==42
        assert len(a['method']['strata'])==6
        assert set(a['method']['strata'].values())=={7 if game=='chess' else 14}
        pairs=Counter(tuple(sorted(j['models'])) for j in plan['jobs'])
        assert len(pairs)==6 and set(pairs.values())=={28}
    for r in a['models']:
        scheduled=336 if game=='werewolf' else 84
        assert r['plannedParticipations']==scheduled
        assert r['missingParticipations']==scheduled-r['participations']
        points=r['wins']+(0 if game=='werewolf' else .5*r['draws'])
        assert r['estimate']==(r['winRate'] if game=='werewolf' else r['score'])
        assert r['missingOutcomeBounds']==[points/scheduled,(points+r['missingParticipations'])/scheduled]
        assert len(r['ci95'])==2 and 0<=r['ci95'][0]<=r['ci95'][1]<=1
        assert 0<r['finiteBootstrapReplicates']<=20000
    for i,cells in enumerate(a['matrix']['cells']):
        for j,cell in enumerate(cells):
            gs=[g for g in d['games'] if g['status']=='finished' and
                (game=='werewolf' or (i!=j and {p['model'] for p in g['players']}=={d['models'][i],d['models'][j]}))]
            seats=[(g,p) for g in gs for p in g['players'] if p['model']==d['models'][i] and
                  (game!='werewolf' or p['role']==a['matrix']['columns'][j])]
            assert cell['n']==len(seats) and cell['wins']==sum(p['won'] for g,p in seats)
            assert cell['draws']==sum(g['draw'] for g,p in seats)
            assert cell['score']==((cell['wins']+(0 if game=='werewolf' else .5*cell['draws']))/len(seats) if seats else None)
    for k in ['requests','httpErrors','usageReported','promptTokens','completionTokens','lengthLimited']:
        assert d['baselineUsage'][k]==sum(r[k] for r in d['usageByModel'])
        assert d['baselineUsage'][k]>=0
    assert sum(r['attempts'] for r in d['reliabilityByModel'])==sum(g['modelAttempts'] for g in d['games'])
    assert all(r['attempts']==r['accepted']+r['rejected'] for r in d['reliabilityByModel'])
    assert sum(r['rejected'] for r in d['reliabilityByModel'])==sum(g['rejectedAttempts'] for g in d['games'])
    for file,digest in plan['sourceHashes'].items():assert sha(ROOT/file)==digest
    provenance=read(root/'provenance.json')
    for r in provenance['publishedFiles']:assert sha(root/r['file'])==r['sha256']
    assert provenance['planSha256']==sha(root/'plan.json')
    assert provenance['sourceSnapshotSha256']==sha(root/'source-snapshot.tar.gz')
    assert provenance['amendmentsSha256']==sha(root/'amendments.json')
    assert provenance['exportScriptSha256']==sha(ROOT/'scripts/export-game-results.ts')
    assert a['inputSha256']==sha(root/'results.json') and a['scriptSha256']==sha(ROOT/'exp/_shared/analyze.py')
    figs=read(root/'assets/provenance.json')
    assert figs['inputSha256']==sha(root/'results.json') and figs['analysisSha256']==sha(root/'analysis.json')
    assert figs['rendererSha256']==sha(ROOT/'exp/_shared/render_figures.py')
    assert len(list((root/'assets').glob('*.svg')))==len(list((root/'assets').glob('*.png')))==6
    for file,digest in figs['outputs'].items():
        p=root/'assets'/file;assert sha(p)==digest
        if p.suffix=='.png':assert struct.unpack('>II',p.read_bytes()[16:24])==(2816,1276)
    if private_available:
        ids={g['id'] for g in d['games']}
        requests=[r for r in private_requests if r['job'] in ids]
        usage={'requests':len(requests), 'httpErrors':sum(r['status']!=200 for r in requests),
               'usageReported':sum(r.get('usage') is not None for r in requests),
               'promptTokens':sum(int((r.get('usage') or {}).get('prompt_tokens',0)) for r in requests),
               'completionTokens':sum(int((r.get('usage') or {}).get('completion_tokens',0)) for r in requests),
               'lengthLimited':sum(r.get('finishReason')=='length' for r in requests)}
        assert usage==d['baselineUsage'], 'Published usage must match the fully flushed private ledger.'
        for entry in provenance['rawFiles']:
            raw=old_raw if entry['cohort']=='initial-20260916' else new_raw
            assert sha(raw/'games'/(entry['id']+'.json.gz'))==entry['sha256']
        expected_new={j['id'] for j in plan['jobs'] if j['cohort']=='extension-20260917'}
        started={f.name[:-8] for f in (new_raw/'checkpoints').glob(game+'-*.json.gz')}
        finished={f.name[:-8] for f in (new_raw/'games').glob(game+'-*.json.gz')}
        assert started==finished==expected_new and len(started)==144
    summary[game]={'baseline':168,'totalGames':expected_total,'completed':d['aggregate']['finished'],
                   'errors':d['aggregate']['errors'],'auditedActions':d['verification']['actions'],
                   'auditedInputs':d['verification']['modelInputs']}
assert len(all_unique)==len(set(all_unique))==168*len(selected)
assert sum(r['totalGames'] for r in summary.values())==sum(expected_totals[g] for g in selected)
print(json.dumps({'checks':'passed','privateLedgersChecked':private_available,'games':summary},ensure_ascii=False,indent=2))
