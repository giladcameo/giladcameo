// Position sources for the live position feature. A source is {kind, watch(onPos, onErr) -> stop}.
// onPos receives {lat, lon, accuracy, heading, speed, ts} (heading in degrees or null, speed in m/s or null);
// onErr receives {code: 'denied' | 'unavailable' | 'timeout' | 'unsupported'}.
// Nothing here touches the network or storage.
import { cumulativeKm } from './geo.js';

export const GEO_OPTIONS = { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 };
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Initial bearing in degrees (0 = north, clockwise) from a to b ({lat, lon}). */
export function bearingDeg(a, b) {
  const p1 = toRad(a.lat), p2 = toRad(b.lat), dl = toRad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at km along coords ([[lon, lat], ...]) with the heading of its segment. km is clamped to the route. */
export function pointAtKm(coords, cum, km) {
  const total = cum[cum.length - 1];
  const d = Math.min(total, Math.max(0, km));
  let i = 0;
  while (i < coords.length - 2 && cum[i + 1] < d) i++;
  const span = cum[i + 1] - cum[i];
  const f = span > 0 ? (d - cum[i]) / span : 0;
  const a = coords[i], b = coords[i + 1];
  return {
    lat: a[1] + (b[1] - a[1]) * f,
    lon: a[0] + (b[0] - a[0]) * f,
    heading: bearingDeg({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] }),
    distKm: d
  };
}

/** The direction arrow is only drawn when the heading is known and the rider is actually moving. */
export function showsArrow(pos) {
  return !!pos && Number.isFinite(pos.heading) && Number.isFinite(pos.speed) && pos.speed > 1;
}

/** Whether the accuracy circle should be drawn (hidden when the fix is too coarse to mean anything). */
export function showsAccuracy(pos, maxM = 500) {
  return !!pos && Number.isFinite(pos.accuracy) && pos.accuracy > 0 && pos.accuracy <= maxM;
}

const ERR_CODES = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

/** Real geolocation (navigator.geolocation or a stand-in with the same watchPosition/clearWatch shape). */
export function createGeolocationSource(geo) {
  return {
    kind: 'geolocation',
    watch(onPos, onErr) {
      if (!geo || typeof geo.watchPosition !== 'function') {
        onErr({ code: 'unsupported' });
        return () => {};
      }
      const id = geo.watchPosition(
        (p) => {
          const c = p.coords || {};
          onPos({
            lat: c.latitude, lon: c.longitude, accuracy: c.accuracy,
            heading: Number.isFinite(c.heading) ? c.heading : null,
            speed: Number.isFinite(c.speed) ? c.speed : null,
            ts: p.timestamp || Date.now()
          });
        },
        (e) => onErr({ code: ERR_CODES[e && e.code] || 'unavailable' }),
        GEO_OPTIONS
      );
      return () => geo.clearWatch(id);
    }
  };
}

/**
 * Simulated rider for demo mode and tests: moves kmPerTick along the route every intervalMs, reports 25 m/s
 * (90 km/h) with the segment heading, and stays at the end of the route. Progress survives stop/watch cycles
 * (pause while hidden) and restarts when the route changes.
 */
export function createSimulatedSource({ getCoords, kmPerTick = 1, intervalMs = 1000, speedMs = 25, accuracyM = 12, setIntervalFn, clearIntervalFn, now } = {}) {
  const setI = setIntervalFn || ((f, ms) => setInterval(f, ms));
  const clearI = clearIntervalFn || ((id) => clearInterval(id));
  const clock = now || (() => Date.now());
  let coords = null, cum = null, km = 0;
  return {
    kind: 'simulated',
    watch(onPos, onErr) {
      const c = getCoords();
      if (!Array.isArray(c) || c.length < 2) { onErr({ code: 'unavailable' }); return () => {}; }
      if (c !== coords) { coords = c; cum = cumulativeKm(c); km = 0; }
      const emit = () => {
        const p = pointAtKm(coords, cum, km);
        onPos({ lat: p.lat, lon: p.lon, accuracy: accuracyM, heading: p.heading, speed: p.distKm >= cum[cum.length - 1] ? 0 : speedMs, ts: clock() });
      };
      emit();
      const id = setI(() => { km += kmPerTick; emit(); }, intervalMs);
      return () => clearI(id);
    },
    get progressKm() { return km; }
  };
}

export function createPositionSource({ demo, geolocation, getCoords, ...simOpts }) {
  return demo ? createSimulatedSource({ getCoords, ...simOpts }) : createGeolocationSource(geolocation);
}
