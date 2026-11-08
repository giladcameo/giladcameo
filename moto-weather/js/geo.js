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

/** Cumulative haversine distance (km) at each vertex of coords ([[lon, lat], ...]). */
export function cumulativeKm(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineKm({ lat: coords[i - 1][1], lon: coords[i - 1][0] }, { lat: coords[i][1], lon: coords[i][0] }));
  }
  return cum;
}

/**
 * Snap a position to a route polyline in one pass over the segments (O(n)).
 * coords = [[lon, lat], ...], pos = {lat, lon}. Each segment is projected in a local equirectangular
 * plane centred on the segment (good over short segments); distances are haversine.
 * Returns {distAlongKm, offRouteKm, segmentIndex}, or null for an empty route / invalid position.
 * A position before the start or past the end clamps to the first / last vertex.
 * cum is an optional precomputed cumulativeKm(coords), worth passing when snapping repeatedly.
 */
export function snapToRoute(coords, pos, cum) {
  if (!Array.isArray(coords) || coords.length === 0 || !pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
  if (coords.length === 1) {
    return { distAlongKm: 0, offRouteKm: haversineKm(pos, { lat: coords[0][1], lon: coords[0][0] }), segmentIndex: 0 };
  }
  const c = cum && cum.length === coords.length ? cum : cumulativeKm(coords);
  const kyDeg = (Math.PI / 180) * EARTH_RADIUS_KM; // km per degree of latitude
  let best = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const kx = Math.cos(toRad((y0 + y1) / 2)) * kyDeg; // km per degree of longitude at this segment
    const dx = (x1 - x0) * kx, dy = (y1 - y0) * kyDeg;
    const px = (pos.lon - x0) * kx, py = (pos.lat - y0) * kyDeg;
    const len2 = dx * dx + dy * dy;
    const tt = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / len2)) : 0;
    const ex = px - tt * dx, ey = py - tt * dy;
    const d2 = ex * ex + ey * ey; // planar distance picks the segment; haversine is computed once, for the winner
    if (!best || d2 < best.d2) best = { d2, i, tt };
  }
  const { i, tt } = best;
  const a = coords[i], b = coords[i + 1];
  const snapped = { lat: a[1] + (b[1] - a[1]) * tt, lon: a[0] + (b[0] - a[0]) * tt };
  return { distAlongKm: c[i] + (c[i + 1] - c[i]) * tt, offRouteKm: haversineKm(pos, snapped), segmentIndex: i };
}
