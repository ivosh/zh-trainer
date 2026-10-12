"""Build a Crazyhouse opening course from recent games and engine analysis."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import chess
import chess.engine
import chess.pgn
import chess.variant

HERE = Path(__file__).resolve().parent
TRAINER = HERE.parent
ANALYSIS = TRAINER.parent / "zh-analysis"
ENGINE = ANALYSIS / "fsf/src/stockfish"
NET = ANALYSIS / "crazyhouse-8ebf84784ad2.nnue"
DEFAULT_PGN = ANALYSIS / "games.pgn"
DEFAULT_OUTPUT = TRAINER / "src/data/opening_course.json"
MIN_PLY = 24
MAX_PLY = 28

LESSONS = [
    ("white-scotch", "Scotch as White", "white", "e4 e5 Nf3 Nc6 d4"),
    ("white-scotch-bc5", "Scotch: ...Bc5", "white", "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5"),
    ("black-italian", "Italian and Two Knights as Black", "black", "e4 e5 Nf3 Nc6 Bc4"),
    ("black-italian-ng5", "Two Knights: 4.Ng5", "black", "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5"),
    ("black-italian-bxf7", "Two Knights: 4.Bxf7+", "black", "e4 e5 Nf3 Nc6 Bc4 Nf6 Bxf7+"),
    ("white-french", "Against the French", "white", "e4 e6"),
    ("white-scandinavian", "Against the Scandinavian", "white", "e4 d5"),
    ("white-scandinavian-e6", "Scandinavian: ...e6", "white", "e4 d5 exd5 e6"),
    ("black-tayler", "Against 3.Be2", "black", "e4 e5 Nf3 Nc6 Be2"),
    ("black-queens-pawn", "Against 1.d4", "black", "d4 d5"),
    ("white-alekhine", "Against the Alekhine", "white", "e4 Nf6"),
    ("black-ruy", "Ruy Lopez as Black", "black", "e4 e5 Nf3 Nc6 Bb5"),
    ("black-reti", "Against 1.Nf3", "black", "Nf3"),
]

SCENARIOS = {"black-italian-ng5", "black-italian-bxf7"}
HUMAN_RATING_FLOOR = 1700
OPPONENT_ROOT_PLIES = 4
OPPONENT_REPLY_PLIES = {"white": 6, "black": 5}


def norm_san(san: str) -> str:
    return "P" + san if san.startswith("@") else san


def read_games(path: Path):
    games = []
    with path.open(encoding="utf-8", errors="replace") as handle:
        while (game := chess.pgn.read_game(handle)) is not None:
            h = game.headers
            if h.get("Variant", "").lower() != "crazyhouse":
                continue
            game_date = h.get("UTCDate", "")
            if not game_date:
                continue
            if h.get("White", "").lower() == "donnotgiveup":
                color = "white"
                opponent = h.get("Black", "")
                rating = h.get("BlackElo", "")
            elif h.get("Black", "").lower() == "donnotgiveup":
                color = "black"
                opponent = h.get("White", "")
                rating = h.get("WhiteElo", "")
            else:
                continue
            if opponent.lower() == "lichess ai level 5":
                source = "ai5"
            elif (not opponent.lower().startswith("lichess ai")
                  and rating.isdigit() and int(rating) >= HUMAN_RATING_FLOOR):
                source = "human1700"
            else:
                source = "other"
            moves = [move.uci() for _, move in zip(range(MAX_PLY + 2), game.mainline_moves())]
            games.append({
                "id": h.get("Site", "").rstrip("/").split("/")[-1],
                "date": game_date,
                "color": color,
                "opponent": opponent.lower(),
                "source": source,
                "moves": moves,
            })
    return games


def recent_start(games):
    latest = max(date.fromisoformat(g["date"].replace(".", "-")) for g in games)
    month = latest.month - 3
    year = latest.year
    if month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def matching(games, color, prefix):
    size = len(prefix)
    return [g for g in games if g["color"] == color and g["moves"][:size] == prefix]


def counts(games):
    return {
        "human1700": sum(g["source"] == "human1700" for g in games),
        "humanOpponents": len({g["opponent"] for g in games if g["source"] == "human1700"}),
        "ai5": sum(g["source"] == "ai5" for g in games),
        "other": sum(g["source"] == "other" for g in games),
    }


def move_support(games, prefix):
    result = defaultdict(list)
    for game in games:
        if game["moves"][:len(prefix)] == prefix and len(game["moves"]) > len(prefix):
            result[game["moves"][len(prefix)]].append(game)
    return result


def support_weight(games):
    humans = len({g["opponent"] for g in games if g["source"] == "human1700"})
    ai = sum(g["source"] == "ai5" for g in games)
    other = sum(g["source"] == "other" for g in games)
    return 3 * humans + min(ai, 12) + min(other, 20) * 0.1


def opponent_counts(games):
    return dict(sorted(Counter(g["opponent"] for g in games
                               if g["source"] == "human1700").items()))


def opponent_lessons(games):
    roots = {(g["color"], tuple(g["moves"][:OPPONENT_ROOT_PLIES]))
             for g in games if g["source"] == "human1700" and g["moves"]}
    roots.update((g["color"], tuple(g["moves"][:OPPONENT_REPLY_PLIES[g["color"]]]))
                 for g in games if g["source"] == "human1700" and g["moves"])
    lessons = []
    for color, root in sorted(roots):
        board = chess.variant.CrazyhouseBoard()
        labels = []
        for ply, uci in enumerate(root):
            move = board.parse_uci(uci)
            san = norm_san(board.san(move))
            labels.append(f"{ply // 2 + 1}.{san}" if ply % 2 == 0 else san)
            board.push(move)
        if board.is_game_over():
            continue
        key = hashlib.sha1((color + " " + " ".join(root)).encode()).hexdigest()[:10]
        lessons.append((f"opponent-{color}-{key}", " ".join(labels), color, list(root)))
    return lessons


def eval_record(score, color):
    pov = score.pov(chess.WHITE if color == "white" else chess.BLACK)
    return {"cp": pov.score(mate_score=100000), "mate": pov.mate()}


def pv_record(board, pv):
    copy = board.copy()
    ucis, sans = [], []
    for move in pv[:6]:
        if not copy.is_legal(move):
            break
        ucis.append(move.uci())
        sans.append(norm_san(copy.san(move)))
        copy.push(move)
    return ucis, sans


def tactic(board, move):
    if not board.is_legal(move):
        return ""
    san = norm_san(board.san(move))
    if san.endswith("#"):
        return f"{san} is checkmate"
    if board.gives_check(move):
        return f"{san} gives check"
    if move.drop:
        return f"{san} places a pocket piece"
    if board.is_capture(move):
        return f"{san} captures and adds a piece to the pocket"
    return f"{san} is the engine's main reply"


def idea(board, move):
    san = norm_san(board.san(move))
    if board.gives_check(move):
        return "This move gives check and forces a response."
    if move.drop:
        return "This drop uses a piece from your pocket."
    if board.is_capture(move):
        return "This capture adds a piece to your pocket."
    if board.is_castling(move):
        return "Castling moves the king and brings the rook into play."
    piece = board.piece_at(move.from_square)
    if piece and piece.piece_type in (chess.KNIGHT, chess.BISHOP) and chess.square_rank(move.from_square) in (0, 7):
        return "This develops a minor piece."
    if piece and piece.piece_type == chess.PAWN and chess.square_file(move.to_square) in (3, 4):
        return "This pawn move contests the center."
    return "The engine favors a quieter improving move here."


def threat_if_waiting(engine, board):
    if board.is_check():
        return "Your king is in check."
    waiting = board.copy()
    waiting.push(chess.Move.null())
    waiting.clear_stack()
    info = engine.analyse(waiting, chess.engine.Limit(depth=12, nodes=120000))
    if not info.get("pv"):
        return ""
    move = info["pv"][0]
    if waiting.gives_check(move) or waiting.is_capture(move) or move.drop:
        return f"If you could pass, {tactic(waiting, move)}."
    return ""


def analyze(engine, board, color, depth=14, nodes=250000, multipv=3):
    info = engine.analyse(board, chess.engine.Limit(depth=depth, nodes=nodes), multipv=multipv)
    out = []
    for item in info:
        if not item.get("pv"):
            continue
        pv_uci, pv_san = pv_record(board, item["pv"])
        if not pv_uci:
            continue
        score = eval_record(item["score"], color)
        out.append({
            "uci": pv_uci[0],
            "san": pv_san[0],
            "cp": score["cp"],
            "mate": score["mate"],
            "pvUci": pv_uci,
            "pvSan": pv_san,
            "depth": item.get("depth", 0),
        })
    return out


def choose_mine(candidates, forced=None):
    return forced or candidates[0]["uci"]


def choose_theirs(candidates, support, forced=None):
    if forced:
        return forced
    if support:
        return max(support, key=lambda u: support_weight(support[u]))
    return candidates[0]["uci"]


def build_lesson(engine, games, lesson, analysis_cache, threat_cache, forced_cache):
    lesson_id, name, color, root_san = lesson
    root_board = chess.variant.CrazyhouseBoard()
    root_uci = []
    if isinstance(root_san, str):
        for san in root_san.split():
            move = root_board.parse_san(san)
            root_uci.append(move.uci())
            root_board.push(move)
    else:
        root_uci = root_san
    source_games = matching(games, color, root_uci)
    opponent_games = source_games
    if lesson_id.startswith("opponent-") and len(root_uci) < OPPONENT_ROOT_PLIES:
        opponent_games = [g for g in source_games if len(g["moves"]) == len(root_uci)]
    board = chess.variant.CrazyhouseBoard()
    prefix = []
    steps = []
    for ply in range(MAX_PLY):
        if board.is_game_over():
            break
        if ply >= MIN_PLY and len(matching(source_games, color, prefix)) < 4:
            break
        mine = (board.turn == chess.WHITE) == (color == "white")
        local = matching(source_games, color, prefix)
        support = move_support(local, prefix)
        key = (board.fen(), color, mine)
        if key not in analysis_cache:
            analysis_cache[key] = analyze(engine, board, color, depth=16 if mine else 14,
                                          nodes=500000 if mine else 250000,
                                          multipv=3 if mine else 2)
        candidates = list(analysis_cache[key])
        if not candidates:
            break
        forced = root_uci[ply] if ply < len(root_uci) else None
        selected_uci = choose_mine(candidates, forced) if mine else choose_theirs(candidates, support, forced)
        try:
            selected = board.parse_uci(selected_uci)
        except ValueError:
            break
        if not board.is_legal(selected):
            break
        selected_san = norm_san(board.san(selected))
        if selected_uci not in {c["uci"] for c in candidates}:
            forced_key = (board.fen(), color, selected_uci)
            if forced_key not in forced_cache:
                extra = engine.analyse(board, chess.engine.Limit(depth=14, nodes=250000), root_moves=[selected])
                pv_uci, pv_san = pv_record(board, extra.get("pv", [selected]))
                score = eval_record(extra["score"], color)
                forced_cache[forced_key] = {
                    "uci": selected_uci, "san": selected_san, "cp": score["cp"],
                    "mate": score["mate"], "pvUci": pv_uci, "pvSan": pv_san,
                    "depth": extra.get("depth", 0),
                }
            candidates.append(forced_cache[forced_key])
        selected_candidate = next((c for c in candidates if c["uci"] == selected_uci), None)
        follow_up = ""
        if selected_candidate and len(selected_candidate["pvUci"]) > 1:
            after = board.copy()
            after.push(selected)
            reply = after.parse_uci(selected_candidate["pvUci"][1])
            follow_up = tactic(after, reply)
        if mine and board.fen() not in threat_cache:
            threat_cache[board.fen()] = threat_if_waiting(engine, board)
        step = {
            "ply": ply + 1,
            "fen": board.fen(),
            "mine": mine,
            "selected": selected_uci,
            "selectedSan": selected_san,
            "candidates": candidates,
            "support": counts(support.get(selected_uci, [])),
            "idea": idea(board, selected) if mine else "",
            "threat": threat_cache[board.fen()] if mine else "",
            "watch": follow_up,
            "eval": {"cp": selected_candidate["cp"], "mate": selected_candidate["mate"]} if selected_candidate else None,
        }
        steps.append(step)
        board.push(selected)
        prefix.append(selected_uci)
    return {
        "id": lesson_id,
        "name": name,
        "color": color,
        "root": root_uci,
        "startPly": len(root_uci) if lesson_id in SCENARIOS or lesson_id.startswith("opponent-") else 0,
        "sources": counts(source_games),
        "opponents": opponent_counts(opponent_games),
        "steps": steps,
    }


def validate(course):
    for lesson in course["lessons"]:
        assert 0 <= lesson["startPly"] < len(lesson["steps"])
        board = chess.variant.CrazyhouseBoard()
        for step in lesson["steps"]:
            assert board.fen() == step["fen"], (lesson["id"], step["ply"])
            move = board.parse_uci(step["selected"])
            assert board.is_legal(move), (lesson["id"], step["ply"])
            assert ((board.turn == chess.WHITE) == (lesson["color"] == "white")) == step["mine"]
            if step["mine"] and step["ply"] > len(lesson["root"]):
                assert step["selected"] == step["candidates"][0]["uci"], (lesson["id"], step["ply"])
            for candidate in step["candidates"]:
                copy = board.copy()
                for uci in candidate["pvUci"]:
                    reply = copy.parse_uci(uci)
                    assert copy.is_legal(reply), (lesson["id"], step["ply"], uci)
                    copy.push(reply)
            board.push(move)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pgn", type=Path, nargs="?", default=DEFAULT_PGN)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    all_games = read_games(args.pgn)
    since = recent_start(all_games)
    games = [g for g in all_games if g["date"] >= since.strftime("%Y.%m.%d") and g["moves"]]
    print(f"Loaded {len(games)} games since {since}", flush=True)
    engine = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
    try:
        engine.configure({"EvalFile": str(NET), "Use NNUE": True, "Threads": 1, "Hash": 128})
        lessons = []
        analysis_cache, threat_cache, forced_cache = {}, {}, {}
        for lesson in LESSONS + opponent_lessons(games):
            item = build_lesson(engine, games, lesson, analysis_cache, threat_cache, forced_cache)
            lessons.append(item)
            print(f"{item['name']}: {len(item['steps'])} plies, {item['sources']}", flush=True)
    finally:
        engine.quit()
    course = {"generated": date.today().isoformat(), "since": since.isoformat(),
              "lessonDepth": {"minimumPly": min(len(item["steps"]) for item in lessons),
                              "maximumPly": max(len(item["steps"]) for item in lessons)},
              "sources": counts(games), "opponents": opponent_counts(g for g in games if g["moves"]),
              "lessons": lessons}
    validate(course)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(course, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {args.output} ({args.output.stat().st_size:,} bytes)", flush=True)


if __name__ == "__main__":
    main()
