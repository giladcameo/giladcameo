// Open-Meteo client. Dependency-free ES module (browser and Node 18+).

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const HOURLY = [
  'temperature_2m',
  'precipitation',
  'precipitation_probability',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'weather_code',
  'visibility',
  'is_day',
];
// Order matters: weather code and is_day come from the first model that has a value.
export const MODELS = ['icon_seamless', 'ecmwf_ifs025', 'gfs_seamless'];
// 50 points keep the URL near 1.1 KB (about 16 chars per point plus a ~300 char fixed part): the model
// list adds only ~40 chars because Open-Meteo suffixes the response keys, not the request.
export const MAX_POINTS_PER_REQUEST = 50;
const HOUR_MS = 3600 * 1000;
const HORIZON_MS = 7 * 24 * HOUR_MS;
// Largest allowed distance between the wanted instant and the nearest hourly slot.
const MAX_SLOT_GAP_MS = 90 * 60 * 1000;

function err(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function buildUrl(batch) {
  const lat = batch.map((p) => Number(p.lat).toFixed(4)).join(',');
  const lon = batch.map((p) => Number(p.lon).toFixed(4)).join(',');
  return (
    `${ENDPOINT}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY.join(',')}&models=${MODELS.join(',')}` +
    `&wind_speed_unit=kmh&timeformat=unixtime&timezone=auto&forecast_days=7&past_hours=1`
  );
}

async function fetchBatch(batch, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(buildUrl(batch));
  } catch (e) {
    throw err(`Network error: ${e && e.message ? e.message : e}`, 'NETWORK');
  }
  if (!res || !res.ok) {
    throw err(`Open-Meteo HTTP ${res ? res.status : 'error'}`, 'NETWORK');
  }
  let body;
  try {
    body = await res.json();
  } catch (e) {
    throw err('Open-Meteo returned invalid JSON', 'NETWORK');
  }
  const list = Array.isArray(body) ? body : [body];
  if (list.length !== batch.length) {
    throw err('Open-Meteo returned an unexpected number of locations', 'NETWORK');
  }
  for (const item of list) {
    if (!item || item.error || !item.hourly || !Array.isArray(item.hourly.time)) {
      throw err((item && item.reason) || 'Open-Meteo returned an error', 'NETWORK');
    }
  }
  return list;
}

function median(values) {
  const v = values.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Wind direction is an angle: take the median relative to the first value so 350, 10, 20 does not give 20.
function medianAngle(values) {
  const v = values.filter((x) => x !== null && x !== undefined);
  if (!v.length) return null;
  const ref = v[0];
  const rel = v.map((a) => ((((a - ref) % 360) + 540) % 360) - 180);
  return (((ref + median(rel)) % 360) + 360) % 360;
}

const round2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

// Per-model hourly series for one variable. With several models Open-Meteo suffixes keys with _<model>;
// with a single model they are unsuffixed. Accept both. Returns series in MODELS order.
function seriesFor(hourly, key) {
  const out = [];
  for (const m of MODELS) {
    const s = hourly[`${key}_${m}`];
    if (Array.isArray(s)) out.push(s);
  }
  if (!out.length && Array.isArray(hourly[key])) out.push(hourly[key]);
  return out;
}

function pickSample(item, targetMs) {
  const hourly = item.hourly;
  const times = hourly.time;
  let best = -1;
  let bestGap = Infinity;
  for (let i = 0; i < times.length; i++) {
    const gap = Math.abs(times[i] * 1000 - targetMs);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  if (best < 0 || bestGap > MAX_SLOT_GAP_MS) {
    throw err('Requested time is outside the forecast range', 'OUT_OF_RANGE');
  }
  const vals = (key) => seriesFor(hourly, key).map((s) => num(s[best]));
  const med = (key) => round2(median(vals(key)));
  const first = (key) => {
    for (const v of vals(key)) if (v !== null) return v;
    return null;
  };
  const temps = vals('temperature_2m').filter((x) => x !== null);
  // Models that contributed at least one value at this slot (single-model responses count as 1).
  let modelCount = MODELS.filter((m) =>
    HOURLY.some((k) => Array.isArray(hourly[`${k}_${m}`]) && num(hourly[`${k}_${m}`][best]) !== null)
  ).length;
  if (!modelCount && HOURLY.some((k) => Array.isArray(hourly[k]) && num(hourly[k][best]) !== null)) modelCount = 1;
  const dayVal = first('is_day');
  return {
    time: times[best] * 1000,
    tempC: med('temperature_2m'),
    tempMinC: temps.length ? Math.min(...temps) : null,
    tempMaxC: temps.length ? Math.max(...temps) : null,
    modelCount,
    precipMm: med('precipitation'),
    precipProb: med('precipitation_probability'),
    windKmh: med('wind_speed_10m'),
    gustKmh: med('wind_gusts_10m'),
    windDirDeg: round2(medianAngle(vals('wind_direction_10m'))),
    code: first('weather_code'),
    visibilityM: med('visibility'),
    isDay: dayVal === null ? true : Boolean(dayVal),
    // IANA zone of the point (timeformat=unixtime stays absolute, this is for display only).
    tz: typeof item.timezone === 'string' ? item.timezone : null,
  };
}

/**
 * Fetch weather for each route point at the time the rider will be there
 * (departDate + offsetSec). Returns an array aligned with points.
 * Errors: .code 'OUT_OF_RANGE' (time outside forecast) or 'NETWORK'.
 * Options: fetchImpl (default global fetch), now (ms, default Date.now(), used for the horizon check).
 */
export async function fetchWeather(points, departDate, opts = {}) {
  const { fetchImpl = globalThis.fetch, now = Date.now() } = opts || {};
  if (!Array.isArray(points) || points.length === 0) return [];
  const departMs = departDate instanceof Date ? departDate.getTime() : Number(departDate);
  if (!Number.isFinite(departMs)) throw new TypeError('departDate must be a valid Date');

  const targets = points.map((p) => departMs + (p.offsetSec || 0) * 1000);
  if (Math.max(...targets) > now + HORIZON_MS) {
    throw err('Departure is beyond the 7 day forecast horizon', 'OUT_OF_RANGE');
  }
  if (typeof fetchImpl !== 'function') throw err('fetch is not available', 'NETWORK');

  const batches = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
    batches.push(points.slice(i, i + MAX_POINTS_PER_REQUEST));
  }
  const results = await Promise.all(batches.map((b) => fetchBatch(b, fetchImpl)));
  const flat = results.flat();
  return flat.map((item, i) => pickSample(item, targets[i]));
}
