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
    if (y < -30 || x > 200 || x < -50) break; 
    t += dt;
  }

  return points;
};

/**
 * Solves for the required power to hit a target.
 * Uses an analytical approach by solving for Time of Flight (t).
 * 
 * Derivation:
 * 1. Express v0 in terms of t from the X-equation:
 *    x(t) = target_x
 *    => v0_x = (K * (target_x - v_wind * t)) / (1 - exp(-Kt)) + v_wind
 * 
 * 2. Substitute v0_x into the Y-equation (since v0_y = v0_x * tan(theta)):
 *    y(t) = target_y
 *    This yields a function F(t) = 0 where t is the only variable.
 * 
 * 3. Solve F(t) = 0 for t, then compute v0.
 */
export const solvePower = (
  dist: number,
  height: number,
  angle: number,
  wind: number
): number | null => {
  // Edge case: Target extremely close
  if (Math.abs(dist) < 0.1) return 1.0;

  const rad = (angle * Math.PI) / 180;
  
  // Edge case: 90 degrees (Vertical shot) - Cannot control X via power normally
  if (Math.abs(Math.cos(rad)) < 1e-9) {
      return null; 
  }

  const v_wind = wind / K;
  const v_term = G_K; // Terminal velocity parameter for gravity (G/K)
  const tanTheta = Math.tan(rad);

  // Constant C combines wind and gravity effects scaled by angle
  const C = v_wind * tanTheta + v_term;

  /**
   * The Function F(t) representing the vertical error at time t,
   * assuming velocity is set perfectly to match horizontal distance at time t.
   * 
   * F(t) = x * tan(theta) + C * ( (1 - e^-Kt)/K - t ) - y
   */
  const error_func = (t: number): number => {
      const E = 1 - Math.exp(-K * t);
      // derived term: x * tanTheta + C * (E/K - t) - height
      return (dist * tanTheta) + C * ((E / K) - t) - height;
  };

  // Search for a root in time t [0.01s, 20s]
  // F(t) is generally monotonic (derivative is C(e^-Kt - 1)), so bisection is safe and fast.
  const time_solution = brentq(error_func, 0.01, 20.0);

  if (time_solution === null) {
      // No solution exists (e.g., aiming below target, or target physically out of reach due to drag limits)
      return null;
  }

  // Calculate required initial velocity X based on time t
  // v_x0 = (K * (x - v_wind * t)) / (1 - e^-Kt) + v_wind
  const E_final = 1 - Math.exp(-K * time_solution);
  const v_x0 = (K * (dist - v_wind * time_solution)) / E_final + v_wind;

  // Calculate total power: v0 = v_x0 / cos(theta)
  const power = v_x0 / Math.cos(rad);

  // Filter out invalid physical results (e.g., negative power implies shooting backwards)
  if (power < 0) return null;

  return power;
};
