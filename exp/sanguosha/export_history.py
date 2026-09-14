"""Export formal game histories and public chat into one ordinary JSON file.

Run from the Strategy-RSI repository root:
    python exp/sanguosha/export_history.py --source /path/to/sanguosha/exp

Only the Python standard library is required. No model API calls are made.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import tempfile


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def export(source, output):
    summary_bytes = (source / "data/summary.json").read_bytes()
    summary = json.loads(summary_bytes)
    plan_bytes = (source / "plan.json").read_bytes()
    plan = json.loads(plan_bytes)
    if not summary["complete"] or not summary["verification"]["passed"]:
        raise ValueError("A completed, replay-verified experiment is required.")
    jobs = {g["id"]: g for g in plan["jobs"]}
    expected = {g["id"]: g for g in summary["games"]}
    assert len(jobs) == len(expected) == summary["planned"] == summary["recorded"]
    assert jobs.keys() == expected.keys()
    archived = {p.name.removesuffix(".json.gz") for p in (source / "games").glob("*.json.gz")}
    assert archived == expected.keys(), "Final archive IDs differ from the declared experiment."

    header = {
        "schemaVersion": "strategy-rsi.game-history.v1",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "experiment": {
            "name": "Four-model Guan Yu baseline",
            "resultsGeneratedAt": summary["generatedAt"],
            "models": [{"id": model, "name": name} for model, name in zip(summary["models"], summary["names"])],
            "settings": summary["settings"],
        },
        "source": {
            "summarySha256": sha256(summary_bytes),
            "planSha256": sha256(plan_bytes),
            "archivePattern": "games/{gameId}.json.gz",
            "originalReplayVerification": summary["verification"],
        },
        "scope": {
            "games": "All final formal games, including errors; excludes pilots and intermediate checkpoints.",
            "actions": "Executed decisions exactly as archived, including reasons, chosen cards and optional speech.",
            "events": "All engine events in original sequence order, including public chat and private card events.",
            "chat": "Public chat events projected into speaker, model, role, time, round, turn, phase and message fields.",
            "finalState": "Full archived state at termination; an errored game's engine state may still be running.",
            "visibility": "Omniscient analysis archive. Preserve privateTo/publicText when filtering for a player's view.",
            "apiTraces": "Request headers, endpoints, keys, prompts and raw API responses are not exported.",
            "duration": "durationMs excludes documented pauses; wallDurationMs includes pauses.",
        },
    }
    totals = Counter()
    by_suite = {}
    events_by_type = Counter()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, prefix=output.name + ".", suffix=".tmp", delete=False) as out:
            temporary = Path(out.name)
            out.write(json.dumps(header, ensure_ascii=False, indent=2)[:-2] + ',\n  "games": [\n')
            for index, game_id in enumerate(sorted(expected)):
                archived_bytes = (source / "games" / f"{game_id}.json.gz").read_bytes()
                raw = json.loads(gzip.decompress(archived_bytes))
                job, reference = raw["job"], expected[game_id]
                assert job == jobs[game_id]
                timing = {
                    "durationMs": raw["durationMs"],
                    "wallDurationMs": raw.get("wallDurationMs", raw["durationMs"]),
                    "pausedDurationMs": raw.get("pausedDurationMs", 0),
                }
                for field in ["status", "winner", "round", "turn", "startedAt", "endedAt"]:
                    assert raw.get(field) == reference.get(field), (game_id, field)
                for field, value in timing.items():
                    assert value == reference[field], (game_id, field)
                assert raw["decisions"] == len(raw["actions"])
                assert [e["seq"] for e in raw["events"]] == list(range(1, len(raw["events"]) + 1))
                assert sum(a["source"] == "forced" for a in raw["actions"]) == raw["forcedDecisions"]
                assert sum(a["source"] == "llm" for a in raw["actions"]) == raw["modelDecisions"]
                players = {p["seat"]: p for p in raw["players"]}
                for seat, model_index in enumerate(job["models"]):
                    assert players[seat]["model"] == summary["models"][model_index]
                    assert players[seat]["role"] == job["roles"][seat]
                chat = []
                for event in raw["events"]:
                    if event["type"] != "chat":
                        continue
                    p = players[event["actor"]]
                    data = event["data"]
                    assert "privateTo" not in event
                    chat.append({
                        "eventSeq": event["seq"], "time": event["time"],
                        "seat": p["seat"], "agentId": data["agentId"], "name": data["name"],
                        "model": p["model"], "hero": p["hero"], "role": p["role"],
                        "round": data["round"], "turn": data["turn"], "phase": data["phase"],
                        "message": data["message"],
                    })
                counts = {
                    "actions": len(raw["actions"]), "forcedActions": raw["forcedDecisions"],
                    "modelActions": raw["modelDecisions"], "events": len(raw["events"]),
                    "chatMessages": len(chat), "apiRequests": len(raw["calls"]),
                    "failedApiRequests": sum(not c["ok"] for c in raw["calls"]),
                }
                assert counts["chatMessages"] == reference["chatMessages"]
                assert counts["apiRequests"] == reference["calls"]
                assert counts["failedApiRequests"] == reference["callErrors"]
                game = {
                    **{key: job[key] for key in ["id", "suite", "seed", "block", "permutation"]},
                    **{key: raw.get(key) for key in ["status", "winner", "round", "turn", "startedAt", "endedAt"]},
                    **timing,
                    "failure": {"model": raw.get("failedModel"), "message": raw.get("error")} if raw["status"] == "error" else None,
                    "players": raw["players"], "counts": counts,
                    "actions": raw["actions"], "events": raw["events"], "chat": chat,
                    "finalState": raw["state"], "archiveSha256": sha256(archived_bytes),
                }
                if index:
                    out.write(',\n')
                out.write('    ' + json.dumps(game, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
                totals.update(counts)
                totals["games"] += 1
                totals[raw["status"]] += 1
                by_suite.setdefault(job["suite"], Counter()).update({"games": 1, raw["status"]: 1, **counts})
                events_by_type.update(e["type"] for e in raw["events"])
                if (index + 1) % 100 == 0:
                    print(f"Exported {index + 1}/{len(expected)} games", flush=True)
            assert totals["finished"] == summary["finished"] and totals["error"] == summary["errors"]
            assert totals["actions"] == summary["verification"]["checkedActions"]
            assert totals["apiRequests"] == summary["verification"]["indexedCalls"]
            out.write('\n  ],\n  "counts": ' + json.dumps(totals, indent=2))
            out.write(',\n  "countsBySuite": ' + json.dumps(by_suite, indent=2))
            out.write(',\n  "eventTypeCounts": ' + json.dumps(events_by_type, indent=2) + '\n}\n')
        temporary.replace(output)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    print(json.dumps({"output": str(output), "bytes": output.stat().st_size, "counts": totals}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Original experiment directory with plan.json, data/summary.json, and games/*.json.gz")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "games-history.json")
    args = parser.parse_args()
    export(args.source.resolve(), args.output.resolve())
