/** Static training content, bundled so the app works fully offline. */

import puzzleData from './data/puzzles.json';
import defenceData from './data/defence.json';
import explorerData from './data/explorer.json';
import reportData from './data/report.json';

export interface Puzzle {
  id: string;
  fen: string;
  solution: string;
  solution_san: string;
  pv: string[];
  cp: number;
  mate: number | null;
  turn: 'w' | 'b';
  kind: 'blunder' | 'punish' | 'defence';
  game_id: string;
  ply: number;
  played?: string;
  tags: string[];
  /** defence puzzles only: how the game actually ended */
  explain?: string;
  mate_square?: string;
  plies_to_mate?: number;
  cp_after?: number;
}

export interface OpeningStep {
  uci: string;
  san: string;
  mine: boolean;
  fen: string;
  cp?: number;
  your_move?: string | null;
  your_move_count?: number;
  freq?: number;
}

export interface OpeningLine {
  name: string;
  color: 'white' | 'black';
  root: string[];
  games: number;
  win_pct: number;
  steps: OpeningStep[];
}

export interface Candidate {
  uci: string;
  san: string;
  cp: number | null;
  mate?: number | null;
  verdict: string;
  line: string[];
  line_uci: string[];
  yours?: number;
  count?: number;
}

export interface ExplorerReply {
  uci: string;
  san: string;
  count: number;
  pct: number;
}

export interface ExplorerNode {
  ply: number;
  fen: string;
  turn: 'mine' | 'theirs';
  candidates?: Candidate[];
  your_move?: Candidate | null;
  replies?: ExplorerReply[];
}

export interface ExplorerLine {
  name: string;
  color: 'white' | 'black';
  root: string[];
  games: number;
  win_pct: number;
  nodes: ExplorerNode[];
}

export interface ReportSection {
  title: string;
  body: string;
  stat?: string;
}

export interface Report {
  generated: string;
  headline: string;
  sections: ReportSection[];
  plan: { title: string; body: string }[];
}

export const puzzles: Puzzle[] = (puzzleData as unknown as Omit<Puzzle, 'id'>[]).map((p, i) => ({
  ...p,
  id: `${p.game_id}-${p.ply}-${i}`,
}));

export const defencePuzzles: Puzzle[] =
  (defenceData as unknown as Omit<Puzzle, 'id'>[]).map((p, i) => ({
    ...p,
    id: `d-${p.game_id}-${p.ply}-${i}`,
  }));

export const explorer: ExplorerLine[] = explorerData as unknown as ExplorerLine[];
export const report: Report = reportData as unknown as Report;
