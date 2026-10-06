// Geometry helpers. Dependency-free ES module (browser and Node 18+).

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km between a and b ({lat, lon}). */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Sample a GeoJSON LineString coordinate list ([[lon, lat], ...]) every stepKm.
 * Returns {points: [{lat, lon, distKm, offsetSec}], totalKm}. First and last
 * vertex are always included; the last gap may be shorter than stepKm.
 * offsetSec = durationSec * distKm / totalKm.
 */
export function sampleRoute(coords, durationSec, stepKm = 15) {
  if (!Array.isArray(coords) || coords.length === 0) return { points: [], totalKm: 0 };
  if (!(stepKm > 0)) stepKm = 15;

  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][1], lon: coords[i - 1][0] };
    const b = { lat: coords[i][1], lon: coords[i][0] };
    cum.push(cum[i - 1] + haversineKm(a, b));
  }
  const totalKm = cum[cum.length - 1];
  const dur = Number.isFinite(durationSec) ? durationSec : 0;
  const make = (lat, lon, distKm) => ({
    lat,
    lon,
    distKm,
    offsetSec: totalKm > 0 ? (dur * distKm) / totalKm : 0,
  });

  const first = coords[0];
  if (coords.length === 1 || totalKm === 0) {
    return { points: [make(first[1], first[0], 0)], totalKm: 0 };
  }

  const points = [make(first[1], first[0], 0)];
  const EPS = 1e-6;
  let seg = 0;
  for (let k = 1; k * stepKm < totalKm - EPS; k++) {
    const d = k * stepKm;
    while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
    const span = cum[seg + 1] - cum[seg];
    const t = span > 0 ? (d - cum[seg]) / span : 0;
    const p0 = coords[seg];
    const p1 = coords[seg + 1];
    points.push(make(p0[1] + (p1[1] - p0[1]) * t, p0[0] + (p1[0] - p0[0]) * t, d));
  }
  const last = coords[coords.length - 1];
  points.push(make(last[1], last[0], totalKm));
  return { points, totalKm };
}
