"""Reproduce this game's analysis/figures offline from its public data."""
import argparse
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / '_shared'))
from write_report import write
if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path)
    p.add_argument('--output',type=Path)
    args=p.parse_args()
    write(ROOT,args.input,args.output)
