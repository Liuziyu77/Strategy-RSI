"""Publish each finished study after the request ledger is flushed. Offline; never calls models.

Watches the fixed 2026-09-17 local artifacts. Run from the repository root while the
baseline runner is active. Exits after all per-game reports have been generated.
The project README/index refresh and historical-directory migration remain explicit steps.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[2]
RAW=ROOT/'artifacts/game-baselines-20260917'
GAMES=['chess','xiangqi','werewolf']

def run(args):
    subprocess.run(args,cwd=str(ROOT),check=True)

def main():
    published=set()
    env=os.environ.copy()
    env['PATH']=str(ROOT/'.runtime/node_modules/node/bin')+os.pathsep+env.get('PATH','')
    os.environ.update(env)
    while len(published)<len(GAMES):
        for game in GAMES:
            if game in published:continue
            finals=list((RAW/'games').glob(game+'-*.json.gz'))
            if len(finals)!=144:continue
            ledger=RAW/'requests.json'
            # progress.json is written before requests.json; do not publish its pending usage snapshot.
            if not ledger.exists() or ledger.stat().st_mtime < max(p.stat().st_mtime for p in finals):continue
            print(json.dumps({'publishing':game,'extensionGames':len(finals)}),flush=True)
            run([str(ROOT/'node_modules/.bin/tsx'),'scripts/export-game-results.ts','--game',game])
            for script in ['analyze.py','render_figures.py','write_report.py']:
                run([sys.executable,'exp/'+game+'/'+script])
            published.add(game)
            (RAW/'published.json').write_text(json.dumps({'games':sorted(published)},indent=2)+'\n')
            print(json.dumps({'published':game}),flush=True)
        if len(published)<len(GAMES):time.sleep(30)
    print(json.dumps({'allGameReportsPublished':True}),flush=True)

if __name__=='__main__':main()
