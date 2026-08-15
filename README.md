# Crazyhouse Trainer

A personal crazyhouse training app, built from an analysis of ~5,600 of my own
Lichess crazyhouse games. It runs entirely in the browser and works offline once
installed to the home screen.

## What is in it

- **Puzzles** — 2,217 positions taken from my own games, each verified by
  Fairy-Stockfish at depth 16 so that exactly one move is clearly best. They are
  the moves I actually got wrong, plus the opponent mistakes I failed to punish.
  Untimed, with spaced repetition so positions come back days later.
- **Openings** — 18 drill lines built from my real repertoire. The app plays the
  replies my opponents actually played, and asks for the engine's move.
- **Patterns** — the four mating nets that account for most of my losses,
  illustrated with real positions from those losses.
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
builds the opening drills, and regenerates the report.
