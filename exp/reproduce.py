"""Reproduce a Werewolf, Chess or Xiangqi study offline from its public data.

Examples:
    python3 exp/reproduce.py chess
    python3 exp/reproduce.py werewolf report
    python3 exp/reproduce.py xiangqi figures --output /tmp/xiangqi-figures
"""
import argparse
import importlib
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent
STEPS = {
    'analyze': ('analyze', 'analyze'),
    'figures': ('render_figures', 'render'),
    'report': ('write_report', 'write'),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('game', choices=['werewolf', 'chess', 'xiangqi'])
    parser.add_argument('step', nargs='?', default='all', choices=['all', *STEPS],
                        help='Default: analyze, then figures, then report.')
    parser.add_argument('--input', type=Path,
                        help='Results JSON for a single step; figures/report also need sibling analysis.json.')
    parser.add_argument('--output', type=Path,
                        help='Single step only: analysis JSON file, figure directory, or report directory.')
    args = parser.parse_args()
    if args.step == 'all' and (args.input or args.output):
        parser.error('--input/--output require a single step: analyze, figures, or report')
    root = ROOT / args.game
    source = args.input or root / 'results.json'
    if json.loads(source.read_text())['gameType'] != args.game:
        parser.error('input gameType does not match the selected game')

    sys.dont_write_bytecode = True
    sys.path.insert(0, str(ROOT / '_shared'))
    for step in STEPS if args.step == 'all' else [args.step]:
        module, function = STEPS[step]
        getattr(importlib.import_module(module), function)(root, args.input, args.output)


if __name__ == '__main__':
    main()
