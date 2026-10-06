// Motorcycle weather risk scoring. Dependency-free ES module (browser and Node 18+).
import { riderFeelsLikeC } from './comfort.js';

const RANK = { ok: 0, caution: 1, danger: 2 };
const LEVELS = ['ok', 'caution', 'danger'];
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/** Piecewise-linear interpolation, clamped at both ends. pts = [[x, y], ...] ascending in x. */
function interp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (c, lo, hi) => c >= lo && c <= hi;

const REASON_ORDER = [
  'thunder', 'snow', 'freezing_rain', 'ice_risk', 'rain_heavy', 'rain_light',
  'strong_gusts', 'gusts', 'low_visibility', 'fog', 'cold', 'wind_chill', 'heat', 'dark',
];

// Component scores (0-100) before level banding.
const GUST_CURVE = [[20, 0], [45, 40], [65, 70], [100, 100]];
const PRECIP_CURVE = [[0, 0], [0.3, 40], [2, 70], [8, 100]];
const COLD_CURVE = [[-10, 100], [3, 70], [8, 39], [14, 0]];
const HEAT_CURVE = [[28, 0], [35, 40], [42, 65]];
const CHILL_CURVE = [[-25, 100], [-10, 70], [3, 40], [10, 0]];
const VIS_CURVE = [[0, 100], [1000, 70], [3000, 40], [10000, 0]];

/**
 * Score one weather sample for motorcycle riding.
 * Returns {level: 'ok'|'caution'|'danger', score: 0-100, reasons: string[]}.
 * opts.ridingSpeedKmh (default 90) feeds the rider wind chill (reason 'wind_chill').
 */
export function scoreRisk(w, opts) {
  w = w || {};
  const ridingSpeedKmh = opts && isNum(opts.ridingSpeedKmh) ? opts.ridingSpeedKmh : 90;
  const levels = {}; // reason -> level
  const comps = []; // component scores
  const add = (reason, level, comp) => {
    levels[reason] = levels[reason] ? worse(levels[reason], level) : level;
    comps.push(comp);
  };

  // Gusts
  if (isNum(w.gustKmh)) {
    const c = interp(w.gustKmh, GUST_CURVE);
    if (w.gustKmh >= 65) add('strong_gusts', 'danger', c);
    else if (w.gustKmh >= 45) add('gusts', 'caution', c);
    else comps.push(c);
  }

  // Rain intensity from measured precipitation, probability and weather code
  let rainLevel = 'ok';
  let rainComp = 0;
  if (isNum(w.precipMm)) {
    rainComp = interp(w.precipMm, PRECIP_CURVE);
    if (w.precipMm >= 2.0) rainLevel = 'danger';
    else if (w.precipMm >= 0.3) rainLevel = 'caution';
    if (isNum(w.precipProb) && w.precipProb >= 60 && w.precipMm > 0) {
      if (rainLevel === 'ok') {
        rainLevel = 'caution';
        rainComp = Math.max(rainComp, 40);
      } else if (rainLevel === 'caution') {
        rainLevel = 'danger';
        rainComp = Math.max(rainComp, 70);
      }
      rainComp = Math.min(100, rainComp + (w.precipProb / 100) * 5);
    }
  }
  const code = isNum(w.code) ? w.code : null;
  if (code !== null) {
    if (code === 65 || code === 82) {
      if (rainLevel !== 'danger') rainComp = Math.max(rainComp, 75);
      rainLevel = 'danger';
    } else if ([51, 53, 55, 61, 63, 80, 81].includes(code)) {
      if (rainLevel === 'ok') {
        rainLevel = 'caution';
        rainComp = Math.max(rainComp, 40);
      }
    }
  }
  if (rainLevel === 'danger') add('rain_heavy', 'danger', rainComp);
  else if (rainLevel === 'caution') add('rain_light', 'caution', rainComp);
  else comps.push(rainComp);

  // Weather code hazards
  if (code !== null) {
    if (inRange(code, 95, 99)) add('thunder', 'danger', 85);
    if (inRange(code, 71, 77) || inRange(code, 85, 86)) add('snow', 'danger', 80);
    if ([56, 57, 66, 67].includes(code)) add('freezing_rain', 'danger', 90);
    if (code === 45 || code === 48) add('fog', 'caution', 45);
  }

  // Temperature
  if (isNum(w.tempC)) {
    if (w.tempC <= 3) add('ice_risk', 'danger', interp(w.tempC, COLD_CURVE));
    else if (w.tempC < 8) add('cold', 'caution', interp(w.tempC, COLD_CURVE));
    else if (w.tempC >= 35) add('heat', 'caution', interp(w.tempC, HEAT_CURVE));
    else comps.push(interp(w.tempC, COLD_CURVE), interp(w.tempC, HEAT_CURVE));
  }

  // Wind chill for the rider (feels-like at riding speed)
  const feels = riderFeelsLikeC(w, ridingSpeedKmh);
  if (isNum(feels)) {
    if (feels <= -10) add('wind_chill', 'danger', interp(feels, CHILL_CURVE));
    else if (feels <= 3) add('wind_chill', 'caution', interp(feels, CHILL_CURVE));
  }

  // Visibility
  if (isNum(w.visibilityM)) {
    const c = interp(w.visibilityM, VIS_CURVE);
    if (w.visibilityM < 1000) add('low_visibility', 'danger', c);
    else if (w.visibilityM < 3000) add('low_visibility', 'caution', c);
    else comps.push(c);
  }

  // Darkness only matters on top of another concern
  const dark = w.isDay === false || w.isDay === 0;
  if (dark && Object.keys(levels).length > 0) levels.dark = 'caution';

  let level = 'ok';
  for (const r of Object.keys(levels)) level = worse(level, levels[r]);
  const reasons = REASON_ORDER.filter((r) => levels[r]);

  // Blend: strongest factor plus a fraction of the others, small bump for darkness.
  comps.sort((a, b) => b - a);
  let raw = comps.length ? comps[0] : 0;
  for (let i = 1; i < comps.length; i++) raw += 0.3 * comps[i];
  if (levels.dark) raw += 5;
  raw = Math.min(100, raw);
  // Keep score consistent with level bands: ok <= 39, caution 40-69, danger >= 70.
  if (level === 'ok') raw = Math.min(raw, 39);
  else if (level === 'caution') raw = Math.min(69, Math.max(raw, 40));
  else raw = Math.max(raw, 70);
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  return { level, score, reasons };
}

/**
 * Summarize a route. points come from sampleRoute, samples from fetchWeather
 * (aligned). Each segment between consecutive points takes the worse level of
 * its two ends; adjacent segments with the same level are merged.
 * Extra field `levels` (per-sample level) is provided for UI convenience.
 * opts.ridingSpeedKmh is passed to scoreRisk (default 90).
 */
export function summarizeRoute(points, samples, opts) {
  const n = Math.min((points || []).length, (samples || []).length);
  const risks = [];
  for (let i = 0; i < n; i++) risks.push(scoreRisk(samples[i], opts));
  const levels = risks.map((r) => r.level);

  let worst = 'ok';
  for (const l of levels) worst = worse(worst, l);

  let dangerKm = 0;
  let cautionKm = 0;
  const segments = [];
  if (n === 1) segments.push({ fromIdx: 0, toIdx: 0, level: levels[0] });
  for (let i = 0; i + 1 < n; i++) {
    const level = worse(levels[i], levels[i + 1]);
    const km = Math.max(0, points[i + 1].distKm - points[i].distKm);
    if (level === 'danger') dangerKm += km;
    else if (level === 'caution') cautionKm += km;
    const prev = segments[segments.length - 1];
    if (prev && prev.level === level) prev.toIdx = i + 1;
    else segments.push({ fromIdx: i, toIdx: i + 1, level });
  }

  let peakGust = null;
  let minTemp = null;
  let totalPrecipMm = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    if (isNum(s.gustKmh) && (peakGust === null || s.gustKmh > peakGust)) peakGust = s.gustKmh;
    if (isNum(s.tempC) && (minTemp === null || s.tempC < minTemp)) minTemp = s.tempC;
    if (isNum(s.precipMm)) totalPrecipMm += s.precipMm;
  }
  return { worst, dangerKm, cautionKm, segments, peakGust, minTemp, totalPrecipMm, levels };
}

export { LEVELS };
