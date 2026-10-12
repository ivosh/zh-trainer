# Crazyhouse Trainer

A personal crazyhouse training app, built from an analysis of my own Lichess
crazyhouse games. It runs entirely in the browser and works offline once
installed to the home screen.

## What is in it

- **Puzzles** — positions taken from my own games, each verified by
  Fairy-Stockfish at depth 16 with a MultiPV search so exactly one move is
  clearly best. They are the moves I actually got wrong, plus the opponent
  mistakes I failed to punish. Nothing from the opening: every position is from
  move 8 onwards. Untimed, with spaced repetition so positions come back days
  later.
- **Openings** — guided lessons built from recent games against strong human and
  AI opponents. Choose a player to start from openings seen in their games. The
  board asks for each course move, offers hints and explains the engine line
  and the reply to watch. An explorer lets me compare the prepared engine
  alternatives from each position.
- **Collapses** — the hard one. A mate you allowed one move earlier teaches
  nothing, so for each game lost by checkmate this finds the earliest moment
  where the position was still holdable and my move made it lost, and asks for
  the move that would have held. Those moments sit 3 to 12 moves before the
  mate.
- **Plan** — the analysis and the training plan it produced.

## Install on iPhone

Open the site in Safari, tap the Share button, then **Add to Home Screen**.
It then launches full screen and works without a network connection.

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
```

## Regenerating the training data

The data files in `src/data/` are produced by the scripts in the sibling
`zh-analysis/` directory from a Lichess PGN export:

```bash
cd ../zh-analysis
./refresh.sh ~/Downloads/lichess_<user>_<date>.pgn
cd ../zh-trainer && npm run build
```

That pipeline parses the PGN into SQLite, scans the games with Fairy-Stockfish
to find recurring mistakes, verifies candidate puzzles with a MultiPV search,
builds the opening explorer, and regenerates the report.

The opening course can be refreshed independently from the latest PGN:

```bash
cd ../zh-trainer
../zh-analysis/.venv/bin/python scripts/make_opening_course.py <PGN>
npm run build
```
