
export interface Point {
  x: number;
  y: number;
}

export type ThemeMode = 'day' | 'night';

export enum GameMode {
  AUTO_AIM = 'AUTO_AIM', // "Free/Calculation Mode": Auto calculates power for target
  MANUAL = 'MANUAL'      // "Manual Mode": User controls power
}

export interface SimulationResult {
  power: number | null;
  trajectory: Point[];
  impactPoint: Point | null;
  error: string | null;
}

export interface SavedTrajectory {
  id: string;
  power: number;
  angle: number;
  wind: number;
  target: Point;
  visible: boolean;
  color: string;
  timestamp: number;
}

export interface AnalysisItem {
    id: string;
    powerDiff: number;
    target: Point; // Midpoint for display
    parentIds: [string, string]; // [FirstSelected, SecondSelected]
    visible: boolean;
    color: string;
}

export const PHYSICS_CONSTANTS = {
  G: 157.96290,
  K: 1.12800,
  // Derived constants
  G_K: 157.96290 / 1.12800,
  // Viewport bounds (Physics Units)
  // Tank is at (0,0). 
  // We want 18 units up, 18 units down.
  MIN_Y: -18,
  MAX_Y: 18,
  // We want the tank on the left side. 
  // Give a bit of negative X padding (-4) and plenty of positive X (36)
  MIN_X: -4,
  MAX_X: 36,
};
