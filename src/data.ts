/** Static training content, bundled so the app works fully offline. */

import puzzleData from './data/puzzles.json';
import openingData from './data/openings.json';
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
  kind: 'blunder' | 'punish';
  game_id: string;
  ply: number;
  played?: string;
  tags: string[];
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

export const openings: OpeningLine[] = openingData as unknown as OpeningLine[];
export const report: Report = reportData as unknown as Report;
