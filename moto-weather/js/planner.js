// Departure time suggestions. Dependency-free ES module (browser and Node 18+).
import { fetchWeather } from './weather.js';
import { summarizeRoute } from './risk.js';

/**
 * Evaluate candidate departures around baseDate and return them best first.
 * Candidate: {date, offsetMin, summary, rank} with rank starting at 1.
 * Order: fewest danger km, then caution km, then total precip, then closest to baseDate.
 * Candidates whose weather fetch fails with OUT_OF_RANGE are skipped; any other
 * error is rethrown. If every candidate is out of range, OUT_OF_RANGE is thrown.
 */
export async function suggestDeparture(points, baseDate, opts = {}) {
  const { offsetsMin = [-60, 0, 60, 120, 180], weatherFn = fetchWeather } = opts || {};
  const baseMs = baseDate instanceof Date ? baseDate.getTime() : Number(baseDate);
  const settled = await Promise.all(
    offsetsMin.map(async (offsetMin) => {
      const date = new Date(baseMs + offsetMin * 60000);
      try {
        const samples = await weatherFn(points, date);
        return { ok: true, date, offsetMin, summary: summarizeRoute(points, samples) };
      } catch (error) {
        return { ok: false, error };
      }
    })
  );
  const good = settled.filter((r) => r.ok);
  if (good.length === 0) {
    const firstErr = settled.find((r) => !r.ok);
    if (firstErr) throw firstErr.error;
    return [];
  }
  const fatal = settled.find((r) => !r.ok && !(r.error && r.error.code === 'OUT_OF_RANGE'));
  if (fatal) throw fatal.error;

  good.sort(
    (a, b) =>
      a.summary.dangerKm - b.summary.dangerKm ||
      a.summary.cautionKm - b.summary.cautionKm ||
      a.summary.totalPrecipMm - b.summary.totalPrecipMm ||
      Math.abs(a.offsetMin) - Math.abs(b.offsetMin) ||
      a.offsetMin - b.offsetMin
  );
  return good.map(({ date, offsetMin, summary }, i) => ({ date, offsetMin, summary, rank: i + 1 }));
}
