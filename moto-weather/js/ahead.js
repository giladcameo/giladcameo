// "What is ahead of the rider" on a planned route. Pure functions, dependency-free (browser and Node 18+).

export const AHEAD_HORIZON_KM = 60;
const RANK = { ok: 0, caution: 1, danger: 2 };

/**
 * points = sampleRoute points ({distKm}), scores = scoreRisk results (same length), distAlongKm = rider position
 * along the route. Returns null when there is nothing to evaluate, otherwise
 * {cardIdx, currentIdx, currentLevel, next}:
 *  - cardIdx: first sample at or ahead of the rider (the last sample once the rider is past it);
 *  - currentIdx / currentLevel: the sample nearest the rider and its risk level;
 *  - next: the first sample ahead whose level is worse than the current one (any distance), or else the first
 *    caution or danger sample within horizonKm; {idx, inKm, level, worse}. null when nothing qualifies.
 */
export function aheadInfo(points, scores, distAlongKm, horizonKm = AHEAD_HORIZON_KM) {
  if (!Array.isArray(points) || !points.length || !Array.isArray(scores) || scores.length < points.length || !Number.isFinite(distAlongKm)) return null;
  const n = points.length;
  let currentIdx = 0;
  let cardIdx = n - 1;
  for (let i = 0; i < n; i++) {
    if (Math.abs(points[i].distKm - distAlongKm) < Math.abs(points[currentIdx].distKm - distAlongKm)) currentIdx = i;
    if (cardIdx === n - 1 && points[i].distKm >= distAlongKm - 1e-9) cardIdx = i;
  }
  if (points[n - 1].distKm < distAlongKm) cardIdx = n - 1;
  const currentLevel = scores[currentIdx].level;
  const curRank = RANK[currentLevel] ?? 0;
  // Prefer the first point that is worse than where the rider is now; otherwise the first caution or danger in range.
  let worse = null, near = null;
  for (let i = 0; i < n && !worse; i++) {
    if (i === currentIdx || points[i].distKm <= distAlongKm) continue;
    const inKm = points[i].distKm - distAlongKm;
    const rank = RANK[scores[i].level] ?? 0;
    if (rank > curRank) worse = { idx: i, inKm, level: scores[i].level, worse: true };
    else if (!near && rank >= 1 && inKm <= horizonKm) near = { idx: i, inKm, level: scores[i].level, worse: false };
  }
  const next = worse || near;
  return { cardIdx, currentIdx, currentLevel, next };
}
