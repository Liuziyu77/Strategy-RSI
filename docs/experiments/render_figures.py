"""Render the README figures from the accompanying public results.json.

Usage, from the repository root: python docs/experiments/render_figures.py
Requires the versions listed in requirements.txt. No API calls are made.
"""
import json
import os
import tempfile
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "strategy-rsi-matplotlib"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, to_rgb
from matplotlib.patches import FancyBboxPatch
from matplotlib.ticker import PercentFormatter
import numpy as np

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "results.json").read_text())
OUT = ROOT.parent / "assets/experiments"
MODELS = DATA["models"]
NAMES = DATA["names"]
SHORT = ["DeepSeek V4 Flash", "GLM-5.2", "Kimi K3", "Qwen3.8 Max"]
COLORS = ["#22857E", "#BC8A3A", "#6479B8", "#AF667E"]
BG, INK, MUTED, GRID = "#F5F8F6", "#153D35", "#637770", "#E4EBE7"
CMAP = LinearSegmentedColormap.from_list("win", ["#E9C9C5", "#F2F4EF", "#2B8C7C"])
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 12.5,
    "text.color": INK, "axes.labelcolor": MUTED, "xtick.color": MUTED,
    "ytick.color": INK, "axes.edgecolor": GRID, "axes.linewidth": .8,
    "svg.fonttype": "path", "svg.hashsalt": "strategy-rsi-baseline-20260914",
    "savefig.facecolor": BG, "figure.facecolor": BG,
    "axes.facecolor": "white", "axes.titleweight": "bold",
})


def tint(color, white=.7):
    return tuple((1 - white) * c + white for c in to_rgb(color))


def text(fig, x, y, s, size=12.5, color=INK, weight="normal", **kw):
    return fig.text(x, y, s, fontsize=size, color=color, fontweight=weight, **kw)


def frame(number, title, subtitle, note, height=5.8):
    fig = plt.figure(figsize=(12.8, height), dpi=160)
    text(fig, .038, .953, "STRATEGY–RSI   /   BASELINE STUDY", 10, MUTED, "bold")
    text(fig, .962, .953, f"{number:02d} / 06", 10, MUTED, ha="right")
    text(fig, .038, .882, title, 23, weight="bold")
    text(fig, .038, .825, subtitle, 12.3, MUTED)
    fig.add_artist(FancyBboxPatch(
        (.025, .138), .95, .637, boxstyle="round,pad=0.008,rounding_size=0.018",
        transform=fig.transFigure, facecolor="white", edgecolor=GRID, linewidth=.9,
        zorder=-10,
    ))
    text(fig, .038, .087, note, 10.4, MUTED)
    text(fig, .038, .035, "Guan Yu · RSI off · Empty memory · Public chat on", 10, MUTED)
    text(fig, .962, .035, "FINAL DATA  /  14 SEP 2026", 9.5, MUTED, ha="right")
    return fig


def axes(fig, rect, xmax=100, percent=True):
    ax = fig.add_axes(rect)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_xlim(0, xmax)
    ax.set_axisbelow(True)
    ax.xaxis.grid(True, color=GRID, linewidth=.8)
    ax.tick_params(axis="both", length=0, pad=9)
    ax.set_yticks([])
    if percent:
        ax.xaxis.set_major_formatter(PercentFormatter(100, decimals=0))
        ax.set_xticks([0, 25, 50, 75, 100])
    return ax


def labels(fig, ax, positions):
    for i, y in enumerate(positions):
        fy = fig.transFigure.inverted().transform(ax.transData.transform((0, y)))[1]
        text(fig, .046, fy, SHORT[i], 13.1, COLORS[i], "bold", va="center")


def save(fig, name):
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / f"{name}.svg", metadata={"Date": None, "Creator": "Strategy-RSI"})
    fig.savefig(OUT / f"{name}.png", dpi=220, metadata={"Software": "Strategy-RSI"})
    plt.close(fig)


def win_rate():
    fig = frame(1, "Win rates across two game formats",
                "Same four models, different strategic demands. Error bars show 95% seed-block intervals.",
                "Normal games only. Identity wins follow team victory rules; model win rates need not sum to 100%.")
    left = None
    for suite, pos, heading in [
        ("duel", [.253, .221, .30, .44], "DUEL  /  233 GAMES"),
        ("identity", [.637, .221, .30, .44], "4-PLAYER IDENTITY  /  256 GAMES"),
    ]:
        text(fig, pos[0], .72, heading, 11.6, MUTED, "bold")
        ax = axes(fig, pos)
        ax.set_ylim(3.55, -.65)
        if left is None:
            left = ax
        for i, model in enumerate(MODELS):
            row = next(r for r in DATA["scores"] if r["suite"] == suite and r["model"] == model)
            p, (lo, hi) = row["winRate"] * 100, np.array(row["ci"]) * 100
            ax.barh(i, p, height=.35, color=tint(COLORS[i], .82), zorder=2)
            ax.errorbar(p, i, xerr=[[p - lo], [hi - p]], fmt="o", markersize=8,
                        color=COLORS[i], elinewidth=2.2, capsize=4, zorder=3)
            ax.text(p, i - .29, f"{p:.1f}%", ha="center", color=COLORS[i], weight="bold", fontsize=13.5)
            ax.text(100, i, f"{row['wins']}/{row['games']}", ha="right", va="center", fontsize=11, color=MUTED)
    labels(fig, left, range(4))
    save(fig, "win-rate")


def heatmap(fig, values, counts, columns, note_label):
    ax = fig.add_axes([.255, .243, .69, .432])
    ax.set(xlim=(0, 4), ylim=(4, 0))
    ax.axis("off")
    for i in range(4):
        for j in range(4):
            v = values[i, j]
            empty = np.isnan(v)
            ax.add_patch(FancyBboxPatch(
                (j + .028, i + .047), .944, .906,
                boxstyle="round,pad=0,rounding_size=0.085",
                facecolor="#F3F6F4" if empty else CMAP(v / 100), linewidth=0,
            ))
            color = "white" if not empty and v >= 92 else INK
            ax.text(j + .5, i + .41, "—" if empty else f"{v:.1f}%",
                    ha="center", va="center", fontsize=19, weight="bold", color=MUTED if empty else color)
            ax.text(j + .5, i + .75, "same model" if empty else counts[i][j],
                    ha="center", va="center", fontsize=10.4, color=MUTED if empty else color)
    labels(fig, ax, np.arange(4) + .5)
    for j, column in enumerate(columns):
        text(fig, .255 + .69 * (j + .5) / 4, .716, column, 11.8, MUTED, "bold", ha="center")
    cax = fig.add_axes([.255, .191, .37, .012])
    bar = fig.colorbar(matplotlib.cm.ScalarMappable(norm=plt.Normalize(0, 100), cmap=CMAP), cax=cax, orientation="horizontal")
    bar.set_ticks([0, 50, 100], labels=["0%", "50%", "100%"])
    bar.outline.set_visible(False)
    cax.tick_params(length=0, labelsize=9.3, pad=3)
    text(fig, .945, .176, note_label, 10.4, MUTED, ha="right")


def head_to_head():
    fig = frame(2, "Head-to-head: the opponent matters",
                "Duel outcomes · Read each cell as the row player's win rate against the column opponent.",
                "Each pair: 20 card-seed blocks × 2 mirrored games planned. Cells use 36–40 normal games per pair.")
    values = np.full((4, 4), np.nan)
    counts = [[""] * 4 for _ in range(4)]
    for r in DATA["pairs"]:
        i, j = MODELS.index(r["a"]), MODELS.index(r["b"])
        values[i, j] = r["aWins"] / r["games"] * 100
        values[j, i] = r["bWins"] / r["games"] * 100
        counts[i][j] = f"{r['aWins']} / {r['games']} wins"
        counts[j][i] = f"{r['bWins']} / {r['games']} wins"
    heatmap(fig, values, counts, ["DeepSeek", "GLM-5.2", "Kimi K3", "Qwen3.8"], "Cell detail: wins / normal games")
    save(fig, "head-to-head")


def role_win_rate():
    fig = frame(3, "Win rates by hidden role",
                "Four-player identity games · One Lord, one Loyalist, one Rebel and one Renegade per game.",
                "Roles have different victory conditions. Lord and Loyalist share team wins, including when already eliminated.")
    values = np.zeros((4, 4))
    counts = [[""] * 4 for _ in range(4)]
    for i, model in enumerate(MODELS):
        for j, role in enumerate(["主公", "忠臣", "反贼", "内奸"]):
            r = next(r for r in DATA["roles"] if r["model"] == model and r["role"] == role)
            values[i, j] = r["winRate"] * 100
            counts[i][j] = f"{r['wins']} / {r['games']} wins"
    heatmap(fig, values, counts, ["Lord", "Loyalist", "Rebel", "Renegade"], "Cell detail: wins / normal games")
    save(fig, "role-win-rate")


def game_duration():
    fig = frame(4, "Game duration under concurrent load",
                "Observed duration under concurrent load · Each dot represents one normally completed game.",
                "Time includes API queues and retries; explicit account-wait pauses are removed. Not an isolated-game benchmark.")
    ax = axes(fig, [.255, .239, .68, .438], xmax=90, percent=False)
    ax.set_xticks(range(0, 91, 15))
    ax.set_ylim(1.6, -.62)
    rng = np.random.default_rng(20260914)
    for i, (suite, name, color) in enumerate([
        ("duel", "Duel", COLORS[0]), ("identity", "4-player identity", COLORS[2]),
    ]):
        rows = np.array([g["durationMs"] / 60000 for g in DATA["games"] if g["suite"] == suite and g["status"] == "finished"])
        p5, q1, med, q3, p95 = np.percentile(rows, [5, 25, 50, 75, 95])
        ax.scatter(rows, i + rng.uniform(.23, .43, len(rows)), s=9, color=color, alpha=.23, edgecolors="none")
        ax.plot([p5, p95], [i, i], color=color, linewidth=2, zorder=3)
        ax.plot([q1, q3], [i, i], color=color, linewidth=12, solid_capstyle="round", alpha=.32, zorder=4)
        ax.plot([p5, p95], [i, i], "|", color=color, markersize=10, markeredgewidth=1.8)
        ax.plot(med, i, "o", color=color, markeredgecolor="white", markeredgewidth=2, markersize=11, zorder=5)
        ax.text(med, i - .24, f"{med:.1f} min", ha="center", fontsize=17, weight="bold", color=color)
        fy = fig.transFigure.inverted().transform(ax.transData.transform((0, i)))[1]
        text(fig, .046, fy + .017, name, 14, color, "bold", va="center")
        text(fig, .046, fy - .030, f"{len(rows)} normal games", 11.4, MUTED, va="center")
    text(fig, .255, .717, "DOT = MEDIAN   ·   THICK LINE = MIDDLE 50%   ·   WHISKERS = P5–P95", 10.5, MUTED, "bold")
    text(fig, .595, .155, "Game duration / minutes", 11.5, MUTED, ha="center")
    save(fig, "game-duration")


def token_use():
    total = sum(r["totalTokens"] for r in DATA["tokens"])
    inputs = sum(r["promptTokens"] for r in DATA["tokens"])
    fig = frame(5, "Reported API token usage",
                f"{total / 1e6:.1f}M reported tokens across 30,342 formal requests · Input accounts for {inputs / total:.1%}.",
                "Includes reported retry usage. Provider token accounting varies; unreported usage is unknown. This is not a cost ranking.")
    ax = axes(fig, [.253, .225, .685, .449], xmax=145, percent=False)
    ax.set_xticks([0, 30, 60, 90, 120], labels=["0", "30M", "60M", "90M", "120M"])
    ax.set_ylim(3.62, -.62)
    for i, r in enumerate(DATA["tokens"]):
        p, c = r["promptTokens"] / 1e6, r["completionTokens"] / 1e6
        ax.barh(i, p, height=.38, color=tint(COLORS[i], .56))
        ax.barh(i, c, left=p, height=.38, color=COLORS[i])
        ax.text(p + c + 2, i, f"{p + c:.1f}M", va="center", fontsize=14, color=COLORS[i], weight="bold")
        ax.text(0, i + .37, f"input {p:.2f}M  +  output {c:.2f}M", fontsize=10.6, color=MUTED, va="center")
    labels(fig, ax, range(4))
    text(fig, .253, .717, "LIGHT = INPUT   /   SOLID = OUTPUT", 11, MUTED, "bold")
    text(fig, .938, .717, "REPORTED TOKENS, ALL FOUR PLAYERS", 10.5, MUTED, ha="right")
    save(fig, "token-use")


def chat_frequency():
    fig = frame(6, "Public chat frequency",
                "Public messages as a share of model decisions · Talking more does not establish a strategic advantage.",
                "Normal games only. Denominator excludes automatic forced actions; speech is optional within each model decision.")
    ax = axes(fig, [.253, .222, .627, .454])
    ax.set_ylim(3.57, -.57)
    for i, model in enumerate(MODELS):
        for suite, offset, white in [("duel", -.145, .65), ("identity", .145, 0)]:
            row = next(r for r in DATA["behaviour"] if r["model"] == model and r["suite"] == suite)
            p = row["speechRate"] * 100
            ax.barh(i + offset, p, height=.235, color=tint(COLORS[i], white))
            ax.text(p + 1.2, i + offset, f"{p:.1f}%", fontsize=11.8, va="center", color=COLORS[i], weight="bold")
    labels(fig, ax, range(4))
    text(fig, .253, .717, "LIGHT = DUEL   /   SOLID = 4-PLAYER IDENTITY", 11, MUTED, "bold")
    save(fig, "chat-frequency")


if __name__ == "__main__":
    assert DATA["complete"] and DATA["verification"]["passed"]
    for render in [win_rate, head_to_head, role_win_rate, game_duration, token_use, chat_frequency]:
        render()
    print(f"Rendered six SVG and six PNG figures in {OUT}")
