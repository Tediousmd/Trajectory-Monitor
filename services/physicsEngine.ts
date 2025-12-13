import { Point, PHYSICS_CONSTANTS } from '../types';

const { G, K, G_K } = PHYSICS_CONSTANTS;

/**
 * Root finding algorithm (Bisection method) to replace scipy.optimize.brentq
 * Finds x where f(x) = 0 within [min, max]
 */
function brentq(f: (val: number) => number, min: number, max: number, tol = 1e-5, maxIter = 100): number | null {
  let a = min;
  let b = max;
  let fa = f(a);
  let fb = f(b);

  if (fa * fb > 0) {
    // Root is not bracketed. 
    return null;
  }

  for (let i = 0; i < maxIter; i++) {
    const c = (a + b) / 2;
    const fc = f(c);

    if (Math.abs(fc) < tol || (b - a) / 2 < tol) {
      return c;
    }

    if (fa * fc < 0) {
      b = c;
      fb = fc;
    } else {
      a = c;
      fa = fc;
    }
  }

  return (a + b) / 2;
}

/**
 * Calculates the trajectory points.
 */
export const calculateTrajectory = (
  start: Point,
  power: number,
  angle: number,
  wind: number,
  dt: number = 0.05
): Point[] => {
  const rad = (angle * Math.PI) / 180;
  const v_wind = wind / K;
  const vx_init = power * Math.cos(rad);
  const vy_init = power * Math.sin(rad);

  const points: Point[] = [];
  let t = 0;
  
  // Limit simulation to 20 seconds or reasonable bounds
  while (t < 20) {
    // x(t) = ((vx - v_wind)/K) * (1 - e^-Kt) + v_wind*t
    const term1_x = (vx_init - v_wind) / K;
    const term2 = 1 - Math.exp(-K * t);
    const term3_x = v_wind * t;
    const x = start.x + (term1_x * term2 + term3_x);

    // y(t) = ((vy + G_K)/K) * (1 - e^-Kt) - G_K*t
    const term1_y = (vy_init + G_K) / K;
    const term3_y = G_K * t;
    const y = start.y + (term1_y * term2 - term3_y);

    points.push({ x, y });

    // Expanded bounds for deep analysis (allows falling way below 0)
    // Using -20 allows visualizing shots into the "negative" 18 zone
    if (y < -20 || x > 100 || x < -20) break; 
    t += dt;
  }

  return points;
};

/**
 * Solves for the required power to hit a target.
 */
export const solvePower = (
  dist: number,
  height: number,
  angle: number,
  wind: number
): number | null => {
  const rad = (angle * Math.PI) / 180;
  const v_wind = wind / K;

  // Internal error function: returns (simulated_height - target_height) for a given velocity v
  const height_error_at_v = (v: number): number => {
    const vx = v * Math.cos(rad);
    const vy = v * Math.sin(rad);

    // Step 1: Find time t where x(t) = dist
    const x_dist_func = (t: number): number => {
      const term1 = (vx - v_wind) / K;
      const term2 = 1 - Math.exp(-K * t);
      const term3 = v_wind * t;
      return term1 * term2 + term3 - dist;
    };

    // Try to find impact time between 0.01s and 20s
    const t_impact = brentq(x_dist_func, 0.01, 20.0);

    if (t_impact === null) {
      const x_at_max = x_dist_func(20.0);
      if (x_at_max < 0) return -99999; // Too weak
      return 99999; 
    }

    // Step 2: Calculate height at that time
    const y_sim = ((vy + G_K) / K) * (1 - Math.exp(-K * t_impact)) - G_K * t_impact;

    return y_sim - height;
  };

  try {
    const final_v = brentq(height_error_at_v, 0.5, 200); 
    return final_v;
  } catch (e) {
    return null;
  }
};