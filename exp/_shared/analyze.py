"""Offline per-game estimates and clustered bootstrap intervals, from public JSON only."""
import hashlib
import json
from pathlib import Path
import numpy as np


def analyze(root, input_path=None, output_path=None):
    root = Path(root)
    source = Path(input_path) if input_path else root / 'results.json'
    target = Path(output_path) if output_path else source.with_name('analysis.json')
    data = json.loads(source.read_text())
    models, games = data['models'], data['games']
    plan = json.loads((root / 'plan.json').read_text())
    wolf = data['gameType'] == 'werewolf'
    strata = {}
    for g in games:
        stratum = 'roles' if wolf else '-'.join(sorted(p['model'] for p in g['players']))
        block = g['block']
        acc = strata.setdefault(stratum, {}).setdefault(block, np.zeros((4, 2)))
        if g['status'] != 'finished':
            continue
        for p in g['players']:
            i = models.index(p['model'])
            acc[i, 0] += int(p['won']) if wolf else (.5 if g['draw'] else int(p['won']))
            acc[i, 1] += 1
    rng = np.random.default_rng(20260917)
    nboot = 20000
    samples = np.zeros((nboot, 4, 2))
    for blocks in strata.values():
        array = np.array(list(blocks.values()))
        chosen = rng.integers(0, len(array), size=(nboot, len(array)))
        samples += array[chosen].sum(axis=1)
    ratios = np.divide(samples[:, :, 0], samples[:, :, 1],
                       out=np.full((nboot, 4), np.nan), where=samples[:, :, 1] > 0)
    estimates = []
    for i, row in enumerate(data['aggregate']['models']):
        planned = sum(j['models'].count(i) for j in plan['jobs'])
        points = row['wins'] + (0 if wolf else .5 * row['draws'])
        missing = planned - row['participations']
        valid = ratios[:, i][np.isfinite(ratios[:, i])]
        estimates.append({**row, 'estimate': row['winRate'] if wolf else row['score'], 'plannedParticipations': planned,
                          'missingParticipations': missing,
                          'ci95': np.quantile(valid, [.025, .975]).tolist() if len(valid) else None,
                          'finiteBootstrapReplicates': len(valid),
                          'missingOutcomeBounds': [points / planned, (points + missing) / planned]})
    matrix = []
    columns = ['wolf', 'seer', 'witch', 'hunter', 'villager'] if wolf else models
    for model in models:
        cells = []
        for column in columns:
            relevant = [g for g in games if g['status'] == 'finished' and
                        (wolf or (model != column and {p['model'] for p in g['players']} == {model, column}))]
            seats = [(g, p) for g in relevant for p in g['players']
                     if p['model'] == model and (not wolf or p['role'] == column)]
            wins = sum(p['won'] for g, p in seats)
            draws = sum(g['draw'] for g, p in seats)
            cells.append({'n': len(seats), 'wins': wins, 'draws': draws,
                          'score': (wins + (0 if wolf else .5 * draws)) / len(seats) if seats else None})
        matrix.append(cells)
    cohort_models = []
    for cohort in data['cohorts']:
        rows = []
        for model in models:
            all_games = [g for g in games if g['cohort'] == cohort['id']]
            seats = [(g, p) for g in all_games if g['status'] == 'finished'
                     for p in g['players'] if p['model'] == model]
            w, d = sum(p['won'] for g, p in seats), sum(g['draw'] for g, p in seats)
            rows.append({'model':model, 'n':len(seats), 'wins':w, 'draws':d,
                         'losses':len(seats)-w-d, 'score':(w+.5*d)/len(seats) if seats else None,
                         'estimate':(w+(0 if wolf else .5*d))/len(seats) if seats else None})
        cohort_models.append({'cohort':cohort['id'], 'models':rows})
    durations = {}
    for status in ['finished', 'error']:
        gs = [g for g in games if g['status'] == status]
        durations[status] = {'games':len(gs)}
        for field in ['decisions', 'durationMs']:
            vals = [g[field] for g in gs]
            durations[status][field] = dict(zip(['p05','q1','median','q3','p95'],
                 np.quantile(vals,[.05,.25,.5,.75,.95]).tolist())) if vals else None
    result = {'gameType':data['gameType'], 'complete':data['complete'],
              'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'method':{'replicates':nboot,'seed':20260917,
                        'unit':'role-shuffle seed, including all rotations and languages' if wolf else
                               'repetition block within opponent pair, including colors and languages',
                        'strata':{s:len(v) for s,v in strata.items()},
                        'interpretation':'Conditional on completed games; descriptive 95% percentile intervals, not corrected for selective failures or multiple comparisons.'},
              'models':estimates,'matrix':{'columns':columns,'cells':matrix},
              'byCohort':cohort_models,'duration':durations}
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print('Analyzed {}: {} games, {} clusters'.format(data['gameType'],len(games),sum(len(v) for v in strata.values())))
    return result
