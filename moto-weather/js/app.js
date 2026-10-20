import { haversineKm, sampleRoute } from './geo.js';
import { fetchWeather } from './weather.js';
import { scoreRisk, summarizeRoute } from './risk.js';
import { riderFeelsLikeC } from './comfort.js';
import { suggestDeparture } from './planner.js';
import { t, setLang, getLang, applyI18n, fmtTime, fmtDuration, fmtNum, deviceTz } from './i18n.js';

const DEMO = new URLSearchParams(location.search).has('demo');
const STORE_KEY = 'mwr.v1';
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abortError = () => new DOMException('Aborted', 'AbortError');
const isAbort = (e) => !!e && e.name === 'AbortError';
const LEVEL_RANK = { ok: 0, caution: 1, danger: 2 };
const SPEEDS = [50, 70, 90, 110, 130];
const DEFAULT_SPEED = 90;
const SPREAD_MIN_C = 3; // show the model range when models differ by at least this much

/* ---------------- storage ---------------- */
function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
function saveStore(patch) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadStore(), ...patch })); } catch (e) { /* storage unavailable */ }
}

/* ---------------- state ---------------- */
const state = {
  from: null, to: null,        // {lat, lon, label, my?} chosen in the form (null while the text is being edited)
  result: null,                // {from, to} snapshot the current results were computed for
  depart: null,                // Date used for the current results
  routes: [], sel: 0,
  activeIdx: -1,
  sug: { status: 'idle', items: [] },
  busy: false,
  speed: DEFAULT_SPEED,        // riding speed (km/h) used for feels-like and risk
  hasResults: false
};
let planId = 0;
let sugToken = 0;
let planCtrl = null, sugCtrl = null;
let zoomCtl = null, attrCtl = null;
let map, routeLayer, markerLayer, markers = [];

class AppError extends Error {
  constructor(code, params) { super(code); this.code = code; this.params = params; }
}

/* ---------------- demo data (?demo=1) ---------------- */
const DEMO_PLACES = [
  { lat: 32.0853, lon: 34.7818, label: 'תל אביב-יפו' },
  { lat: 32.7940, lon: 34.9896, label: 'חיפה' },
  { lat: 31.7683, lon: 35.2137, label: 'ירושלים' },
  { lat: 32.3215, lon: 34.8532, label: 'נתניה' }
];
function densify(wps, stepKm = 1.1) {
  const out = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = { lon: wps[i][0], lat: wps[i][1] }, b = { lon: wps[i + 1][0], lat: wps[i + 1][1] };
    const n = Math.max(1, Math.round(haversineKm(a, b) / stepKm));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      out.push([a.lon + (b.lon - a.lon) * f + Math.sin((i * n + k) / 5) * 0.0012, a.lat + (b.lat - a.lat) * f]);
    }
  }
  out.push(wps[wps.length - 1]);
  return out;
}
function demoRoutes() {
  const mk = (wps, speed) => {
    const coords = densify(wps);
    let km = 0;
    for (let i = 1; i < coords.length; i++) km += haversineKm({ lon: coords[i - 1][0], lat: coords[i - 1][1] }, { lon: coords[i][0], lat: coords[i][1] });
    return { coords, distance: km * 1000, duration: (km / speed) * 3600 };
  };
  return [
    mk([[34.7818, 32.0853], [34.8200, 32.2000], [34.8532, 32.3215], [34.8760, 32.4340], [34.9500, 32.6100], [34.9896, 32.7940]], 82),
    mk([[34.7818, 32.0853], [34.9300, 32.2400], [35.0100, 32.4300], [35.0300, 32.6300], [34.9896, 32.7940]], 74)
  ];
}
function demoWeather(points, depart) {
  return points.map((p) => {
    const when = depart.getTime() + p.offsetSec * 1000;
    const h = (when - Date.now()) / 3.6e6;
    const center = 32.2 + 0.2 * h;
    let rain = Math.max(0, 1 - Math.abs(p.lat - center) / 0.14) * 3.4;
    if (p.lon > 34.93) rain *= 0.45;
    const hour = new Date(when).getHours();
    const isDay = hour >= 6 && hour < 18 ? 1 : 0;
    const gust = 24 + rain * 9 + 6 * Math.sin(p.lat * 40);
    let code = p.lat > 32.65 && rain < 0.05 ? 0 : 2;
    if (rain > 3) code = 95; else if (rain > 2) code = 65; else if (rain > 0.3) code = 61; else if (rain > 0.05) code = 51;
    // Cooler towards the north so the feels-like line shows cold values; models disagree more in the rain zone.
    const tempC = Math.round((19 - Math.max(0, p.lat - 32.08) * 14 - rain * 2 - (isDay ? 0 : 5)) * 10) / 10;
    const spread = 1 + rain * 1.6;
    return {
      tempMinC: Math.round((tempC - spread * 0.4) * 10) / 10, tempMaxC: Math.round((tempC + spread * 0.6) * 10) / 10, modelCount: 3,
      time: when, tempC, precipMm: Math.round(rain * 10) / 10,
      precipProb: rain > 0.05 ? 85 : 15, windKmh: Math.round(gust * 0.62), gustKmh: Math.round(gust),
      windDirDeg: (250 + p.lat * 10) % 360, code, visibilityM: rain > 1 ? 4200 - rain * 500 : 20000, isDay
    };
  });
}
const getWeather = DEMO
  ? async (pts, d) => { await sleep(300); return demoWeather(pts, d); }
  : (pts, d, signal) => fetchWeather(pts, d, signal ? { fetchImpl: (u) => fetch(u, { signal }) } : {});

/* ---------------- helpers: weather presentation ---------------- */
function wxInfo(code, isDay) {
  const night = isDay === 0 || isDay === false;
  if (code === 0 || code === 1) return night ? { icon: 'wx-moon', key: 'wx.clear_night' } : { icon: 'wx-sun', key: 'wx.clear' };
  if (code === 2) return { icon: night ? 'wx-partly-night' : 'wx-partly', key: 'wx.partly' };
  if (code === 3) return { icon: 'wx-cloud', key: 'wx.cloud' };
  if (code === 45 || code === 48) return { icon: 'wx-fog', key: 'wx.fog' };
  if (code >= 51 && code <= 55) return { icon: 'wx-drizzle', key: 'wx.drizzle' };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { icon: 'wx-freezing', key: 'wx.freezing' };
  if (code === 61 || code === 63 || code === 80 || code === 81) return { icon: 'wx-rain', key: 'wx.rain' };
  if (code === 65 || code === 82) return { icon: 'wx-heavy', key: 'wx.heavy' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'wx-snow', key: 'wx.snow' };
  if (code >= 95 && code <= 99) return { icon: 'wx-thunder', key: 'wx.thunder' };
  return { icon: 'wx-cloud', key: 'wx.cloud' };
}
const lvIcon = (level, cls = '') => `<svg class="lv lv-${level} ${cls}" aria-hidden="true"><use href="#lv-${level}"/></svg>`;
const wxIcon = (name, cls = 'wx') => `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
const kmText = (km) => fmtNum(km, km < 10 && km > 0 ? 1 : 0);
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const cur = () => state.routes[state.sel];

/* ---------------- geocoding (Nominatim) ----------------
   Usage policy: max 1 request/second, no client-side autocomplete, identify the app (the browser sends
   Referer), cache results. So: a search only runs when the user presses Enter in a field or plans a route,
   requests are serialized with a 1.1 s gap, and repeated queries are served from memory. */
let lastNominatim = 0;
const geoCache = new Map();
async function geocode(q, signal) {
  if (DEMO) {
    await sleep(120);
    const n = q.trim().toLowerCase();
    const hit = DEMO_PLACES.filter((p) => p.label.toLowerCase().includes(n) || n.length < 2);
    return hit.length ? hit : DEMO_PLACES.slice(0, 2);
  }
  const lang = getLang() === 'he' ? 'he,en;q=0.7' : 'en';
  const key = lang + '|' + q.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = Math.max(0, lastNominatim + 1100 - Date.now());
  lastNominatim = Date.now() + wait;
  if (wait) await sleep(wait);
  if (signal && signal.aborted) throw abortError();
  lastNominatim = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=0&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
  let res;
  try { res = await fetch(url, { signal }); }
  catch (e) { if (isAbort(e)) throw e; throw new AppError('network'); }
  if (res.status === 429) throw new AppError('rate');
  if (!res.ok) throw new AppError('network');
  let data;
  try { data = await res.json(); } catch (e) { throw new AppError('network'); }
  const out = (Array.isArray(data) ? data : [])
    .map((r) => ({
      lat: parseFloat(r.lat), lon: parseFloat(r.lon),
      label: String(r.display_name || '').split(',').slice(0, 3).map((x) => x.trim()).join(', ')
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.label);
  geoCache.set(key, out);
  return out;
}

/* ---------------- routing (OSRM demo server, car profile, CORS enabled) ---------------- */
async function getRoutes(from, to, signal) {
  if (DEMO) { await sleep(250); return demoRoutes(); }
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&alternatives=true&steps=false`;
  let res;
  try { res = await fetch(url, { signal }); } catch (e) { if (isAbort(e)) throw e; throw new AppError('network'); }
  if (res.status === 429) throw new AppError('rate');
  if (!res.ok && res.status >= 500) throw new AppError('network');
  let data;
  try { data = await res.json(); } catch (e) { throw new AppError('route'); }
  if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) throw new AppError('route');
  return data.routes.slice(0, 3)
    .filter((r) => r && r.geometry && Array.isArray(r.geometry.coordinates) && r.geometry.coordinates.length > 1)
    .map((r) => ({ coords: r.geometry.coordinates, duration: r.duration, distance: r.distance }));
}

function cumulative(coords) {
  const c = [0];
  for (let i = 1; i < coords.length; i++) {
    c.push(c[i - 1] + haversineKm({ lat: coords[i - 1][1], lon: coords[i - 1][0] }, { lat: coords[i][1], lon: coords[i][0] }));
  }
  return c;
}

// Returns a new route object, never mutates its input, so an aborted run cannot leave half-updated state.
const riskOpts = () => ({ ridingSpeedKmh: state.speed });

// Re-score the already fetched weather for the current riding speed (no network).
function rescore() {
  state.routes = state.routes.map((r) => ({
    ...r,
    scores: r.samples.map((w) => scoreRisk(w, riskOpts())),
    summary: summarizeRoute(r.points, r.samples, riskOpts())
  }));
}

function setSpeed(v) {
  if (!SPEEDS.includes(v) || v === state.speed) return;
  state.speed = v;
  saveStore({ speed: v });
  if (!state.hasResults) { renderSpeed(); return; }
  rescore();
  renderResults();
  drawMap({ fit: false });
  loadSuggestions();
}

function renderSpeed() {
  const el = $('#speed');
  el.innerHTML = `<h3 class="sec-title">${esc(t('speed.title'))}<small>${esc(t('unit.kmh'))}</small></h3>
    <div class="speed-row" role="radiogroup" aria-label="${esc(t('speed.title') + ', ' + t('unit.kmh'))}">${
      SPEEDS.map((v) => `<button type="button" class="speed-btn" role="radio" data-v="${v}" aria-checked="${v === state.speed}">${v}</button>`).join('')
    }</div>`;
  el.querySelectorAll('.speed-btn').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.v))));
}

async function analyze(route, depart, signal) {
  const { points, totalKm } = sampleRoute(route.coords, route.duration);
  const samples = await getWeather(points, depart, signal);
  return {
    ...route, points, totalKm, samples,
    scores: samples.map((w) => scoreRisk(w, riskOpts())),
    summary: summarizeRoute(points, samples, riskOpts()),
    cum: route.cum || cumulative(route.coords)
  };
}

/* ---------------- sheet (bottom sheet with 3 snaps) ---------------- */
const sheet = $('#sheet');
const SNAPS = ['peek', 'mid', 'full'];
let snap = 'mid';
const isWide = () => window.matchMedia('(min-width: 900px)').matches;
function snapPx() {
  const vh = window.innerHeight;
  return { peek: 108, mid: Math.round(vh * 0.52), full: Math.round(vh - 64) };
}
function applySnap(name) {
  snap = name;
  sheet.dataset.snap = name;
  sheet.style.setProperty('--sheet-h', snapPx()[name] + 'px');
  $('#grip').setAttribute('aria-expanded', String(name !== 'peek'));
}
function cycleSnap() { applySnap(SNAPS[(SNAPS.indexOf(snap) + 1) % 3]); }
const sheetPx = () => sheet.getBoundingClientRect().height;

function initSheet() {
  const head = $('#sheetHead');
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    drag = { y: e.clientY, h: sheetPx(), moved: false, last: e.clientY, t: performance.now(), v: 0 };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 6) { drag.moved = true; sheet.classList.add('dragging'); }
    if (!drag.moved) return;
    const now = performance.now();
    drag.v = (drag.last - e.clientY) / Math.max(1, now - drag.t);
    drag.last = e.clientY; drag.t = now;
    const px = snapPx();
    sheet.style.setProperty('--sheet-h', clamp(drag.h + dy, px.peek, px.full) + 'px');
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    sheet.classList.remove('dragging');
    if (!d.moved) { cycleSnap(); return; }
    const px = snapPx();
    const h = sheetPx() + d.v * 180;
    let best = 'mid', bd = Infinity;
    SNAPS.forEach((s) => { const dd = Math.abs(px[s] - h); if (dd < bd) { bd = dd; best = s; } });
    applySnap(best);
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  // Keyboard activation (click with detail 0). Pointer taps are handled above.
  head.addEventListener('click', (e) => { if (e.detail === 0) cycleSnap(); });
  $('#grip').addEventListener('keydown', (e) => {
    const i = SNAPS.indexOf(snap);
    if (e.key === 'ArrowUp' && i < 2) { e.preventDefault(); applySnap(SNAPS[i + 1]); }
    if (e.key === 'ArrowDown' && i > 0) { e.preventDefault(); applySnap(SNAPS[i - 1]); }
  });
  window.addEventListener('resize', () => { applySnap(snap); if (map) { map.invalidateSize(); placeControls(); } });
}

/* ---------------- map ---------------- */
function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: false, keyboard: false, tap: true }).setView([32.0, 34.9], 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: false }).addTo(map);
  placeControls();
  routeLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

// Zoom (pointer devices only) and the OSM attribution sit on the side away from the wide-screen side panel.
// The map itself is forced LTR in CSS, so these corners are physical and never mirrored by the page direction.
function placeControls() {
  if (!map) return;
  if (zoomCtl) { zoomCtl.remove(); zoomCtl = null; }
  if (attrCtl) { attrCtl.remove(); attrCtl = null; }
  const rtl = getLang() === 'he';
  const free = isWide() ? (rtl ? 'topleft' : 'topright') : 'topright';
  if (window.matchMedia('(pointer: fine)').matches) zoomCtl = L.control.zoom({ position: isWide() ? free : 'topleft' }).addTo(map);
  attrCtl = L.control.attribution({ prefix: false, position: free })
    .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>')
    .addTo(map);
}

function slice(route, i, j) {
  const a = route.points[i], b = route.points[j];
  const scale = route.cum[route.cum.length - 1] / (route.totalKm || 1);
  const from = a.distKm * scale, to = b.distKm * scale;
  const out = [[a.lat, a.lon]];
  for (let k = 0; k < route.coords.length; k++) {
    if (route.cum[k] > from && route.cum[k] < to) out.push([route.coords[k][1], route.coords[k][0]]);
  }
  out.push([b.lat, b.lon]);
  return out;
}

function segmentsOf(route) {
  const s = route.summary && route.summary.segments;
  if (Array.isArray(s) && s.length) return s;
  const segs = [];
  for (let i = 0; i < route.points.length - 1; i++) {
    const l = LEVEL_RANK[route.scores[i].level] >= LEVEL_RANK[route.scores[i + 1].level] ? route.scores[i].level : route.scores[i + 1].level;
    segs.push({ fromIdx: i, toIdx: i + 1, level: l });
  }
  return segs;
}

function drawMap({ fit = true } = {}) {
  routeLayer.clearLayers(); markerLayer.clearLayers(); markers = [];
  if (!state.routes.length) return;
  const colors = { ok: cssVar('--map-ok'), caution: cssVar('--map-caution'), danger: cssVar('--map-danger') };
  const casing = cssVar('--map-casing'), alt = cssVar('--map-alt');

  state.routes.forEach((r, idx) => {
    if (idx === state.sel) return;
    const ll = r.coords.map((c) => [c[1], c[0]]);
    L.polyline(ll, { color: casing, weight: 9, opacity: 0.7, interactive: false }).addTo(routeLayer);
    L.polyline(ll, { color: alt, weight: 5, opacity: 0.95, dashArray: '2 9', lineCap: 'round' })
      .on('click', () => selectRoute(idx)).addTo(routeLayer);
  });

  const r = cur();
  const full = r.coords.map((c) => [c[1], c[0]]);
  L.polyline(full, { color: casing, weight: 14, opacity: 0.92, lineJoin: 'round', interactive: false }).addTo(routeLayer);
  segmentsOf(r).forEach((s) => {
    if (s.toIdx <= s.fromIdx) return;
    const ll = slice(r, s.fromIdx, s.toIdx);
    if (s.level === 'caution') {
      L.polyline(ll, { color: colors.caution, weight: 8, dashArray: '16 9', lineCap: 'butt', lineJoin: 'round', interactive: false }).addTo(routeLayer);
    } else if (s.level === 'danger') {
      L.polyline(ll, { color: colors.danger, weight: 9, lineCap: 'butt', lineJoin: 'round', interactive: false }).addTo(routeLayer);
      L.polyline(ll, { color: '#ffffff', weight: 2.5, dashArray: '3 11', lineCap: 'round', interactive: false }).addTo(routeLayer);
    } else {
      L.polyline(ll, { color: colors.ok, weight: 7, lineCap: 'butt', lineJoin: 'round', interactive: false }).addTo(routeLayer);
    }
  });

  const stride = Math.max(1, Math.ceil(r.points.length / 9));
  r.points.forEach((p, i) => {
    const sc = r.scores[i], w = r.samples[i];
    const major = i % stride === 0 || i === r.points.length - 1;
    const info = wxInfo(w.code, w.isDay);
    const html = major
      ? `<div class="mk lv-${sc.level}">${wxIcon(info.icon)}<span dir="ltr">${fmtNum(w.tempC)}°</span>${lvIcon(sc.level, 'mk-lv')}</div>`
      : `<div class="mk mk-min lv-${sc.level}">${lvIcon(sc.level, 'mk-lv')}</div>`;
    const size = major ? [56, 52] : [44, 44];
    const m = L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: 'mk-wrap', html, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] }),
      keyboard: false, riseOnHover: true
    }).on('click', () => selectPoint(i, { scroll: true, expand: true })).addTo(markerLayer);
    markers.push(m);
  });
  if (fit) fitRoute();
  markActive();
}

function fitRoute() {
  const r = cur();
  if (!r) return;
  const b = L.latLngBounds(r.coords.map((c) => [c[1], c[0]]));
  const rtl = getLang() === 'he';
  if (isWide()) {
    map.fitBounds(b, { paddingTopLeft: [rtl ? 60 : 500, 80], paddingBottomRight: [rtl ? 500 : 60, 60], animate: !REDUCED });
  } else {
    map.fitBounds(b, { paddingTopLeft: [40, 84], paddingBottomRight: [40, sheetPx() + 40], animate: !REDUCED });
  }
}

function markActive() {
  markers.forEach((m, i) => {
    const el = m.getElement && m.getElement();
    const inner = el && el.firstElementChild;
    if (inner) inner.classList.toggle('active', i === state.activeIdx);
    if (m.setZIndexOffset) m.setZIndexOffset(i === state.activeIdx ? 1000 : 0);
  });
  document.querySelectorAll('.tl-card').forEach((c) => c.setAttribute('aria-current', String(Number(c.dataset.i) === state.activeIdx)));
}

function selectPoint(i, { scroll = false, expand = false } = {}) {
  const r = cur();
  if (!r || !r.points[i]) return;
  state.activeIdx = i;
  const p = r.points[i];
  const z = Math.max(map.getZoom(), 11);
  if (!isWide()) {
    const pt = map.project([p.lat, p.lon], z);
    pt.y += (sheetPx() - 72) / 2;
    map.setView(map.unproject(pt, z), z, { animate: !REDUCED });
  } else {
    map.setView([p.lat, p.lon], z, { animate: !REDUCED });
  }
  if (expand && snap === 'peek') applySnap('mid');
  markActive();
  if (scroll) {
    const card = document.querySelector(`.tl-card[data-i="${i}"]`);
    if (card) card.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }
}

/* ---------------- rendering ---------------- */
function led(value, { min, max, zone, needle = false }) {
  const N = 12;
  const has = Number.isFinite(value);
  const lit = has ? Math.round(clamp((value - min) / (max - min), 0, 1) * (N - 1)) : -1;
  let h = '';
  for (let i = 0; i < N; i++) {
    const z = zone(min + ((i + 0.5) / N) * (max - min));
    const on = needle ? i === lit : (has && value > min && i <= lit);
    h += `<i class="z${z}${on ? ' on' : ''}"></i>`;
  }
  return `<div class="led" aria-hidden="true">${h}</div>`;
}

function renderBanner() {
  const r = cur(), s = r.summary;
  const lvl = s.worst;
  const km = lvl === 'danger' ? s.dangerKm : s.cautionKm;
  const sub = lvl === 'ok' ? t('verdict.sub.ok') : t(`verdict.sub.${lvl}`, { km: kmText(km) });
  $('#banner').innerHTML = `
    <div class="sign lv-${lvl}" role="group" aria-label="${esc(t('verdict.' + lvl))}">
      <svg class="sign-glyph" aria-hidden="true"><use href="#lv-${lvl}"/></svg>
      <div><div class="sign-word">${esc(t('verdict.' + lvl))}</div><p class="sign-sub">${esc(sub)}</p></div>
    </div>`;
}

function renderCluster() {
  const r = cur(), s = r.summary;
  const gust = s.peakGust, temp = s.minTemp, rain = s.totalPrecipMm; // null when the forecast has no value
  const cell = (label, val, unit, bar) => `<div class="gauge"><div class="gauge-label">${esc(label)}</div><div class="gauge-val">${val}<small>${esc(unit)}</small></div>${bar}</div>`;
  $('#cluster').innerHTML = `<div class="cluster">
    ${cell(t('stat.gust'), fmtNum(gust), t('unit.kmh'), led(gust, { min: 0, max: 84, zone: (v) => (v >= 65 ? 2 : v >= 45 ? 1 : 0) }))}
    ${cell(t('stat.temp'), fmtNum(temp), t('unit.c'), led(temp, { min: -5, max: 40, needle: true, zone: (v) => (v <= 3 ? 2 : v < 8 || v >= 35 ? 1 : 0) }))}
    ${cell(t('stat.rain'), fmtNum(rain, 1), t('unit.mm'), led(rain, { min: 0, max: 12, zone: (v) => (v >= 6 ? 2 : v >= 1.5 ? 1 : 0) }))}
  </div>`;
}

function renderReasons() {
  const r = cur();
  const seen = new Map();
  r.scores.forEach((sc) => (sc.reasons || []).forEach((k) => {
    const prev = seen.get(k);
    if (!prev || LEVEL_RANK[sc.level] > LEVEL_RANK[prev]) seen.set(k, sc.level);
  }));
  if (!seen.size) return '';
  const items = [...seen.entries()].sort((a, b) => LEVEL_RANK[b[1]] - LEVEL_RANK[a[1]])
    .map(([k, l]) => `<li>${lvIcon(l)}<span>${esc(t('reason.' + k))}</span></li>`).join('');
  return `<h3 class="sec-title">${esc(t('reasons.title'))}</h3><ul class="reasons">${items}</ul>`;
}

function routeName(i) { return i === 0 ? t('route.fastest') : t('route.n', { n: i + 1 }); }

function renderRoutes() {
  const el = $('#routes');
  if (state.routes.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = `<h3 class="sec-title">${esc(t('route.title'))}</h3><div class="chips" role="radiogroup" aria-label="${esc(t('route.title'))}">${
    state.routes.map((r, i) => {
      const dur = fmtDuration(r.duration), dist = `${fmtNum(r.totalKm)} ${t('unit.km')}`;
      const lv = r.summary.worst;
      return `<button type="button" class="chip" role="radio" data-r="${i}" aria-checked="${i === state.sel}"
        aria-label="${esc(t('route.pick', { name: routeName(i), dur, dist, level: t('level.' + lv) }))}">
        ${lvIcon(lv)}<span><span class="chip-main">${esc(dur)}</span><br><span class="chip-sub">${esc(routeName(i))} · ${esc(dist)}</span></span></button>`;
    }).join('')}</div>`;
  el.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => selectRoute(Number(b.dataset.r))));
}

function renderTimeline() {
  const r = cur();
  const base = state.depart.getTime();
  const last = r.points.length - 1;
  const cards = r.points.map((p, i) => {
    const w = r.samples[i], sc = r.scores[i], info = wxInfo(w.code, w.isDay);
    const eta = fmtTime(new Date(base + p.offsetSec * 1000), w.tz);
    const km = fmtNum(p.distKm);
    const reasons = (sc.reasons || []).slice(0, 2).map((k) => t('reason.' + k)).join(', ') || t('tl.noalerts');
    let aria = t('tl.point', { km, time: eta, wx: t(info.key), temp: fmtNum(w.tempC), wind: fmtNum(w.windKmh), gust: fmtNum(w.gustKmh), level: t('level.' + sc.level) });
    const feels = riderFeelsLikeC(w, state.speed);
    const hasFeels = Number.isFinite(feels);
    const spreadOn = Number.isFinite(w.tempMinC) && Number.isFinite(w.tempMaxC) && w.tempMaxC - w.tempMinC >= SPREAD_MIN_C;
    const feelCls = hasFeels && feels <= -10 ? ' cold2' : hasFeels && feels <= 3 ? ' cold' : '';
    const feelRow = hasFeels
      ? `<span class="tl-feel${feelCls}" title="${esc(t('tl.feels.title', { v: fmtNum(feels), speed: state.speed }))}"><small>${esc(t('tl.feels'))}</small><b>${fmtNum(feels)}°</b></span>` : '';
    const rangeText = spreadOn ? `${fmtNum(w.tempMinC)}–${fmtNum(w.tempMaxC)}°` : '';
    const rangeRow = spreadOn
      ? `<span class="tl-range" title="${esc(t('tl.range.title', { min: fmtNum(w.tempMinC), max: fmtNum(w.tempMaxC) }))}"><small>${esc(t('tl.range'))}</small><b>${rangeText}</b></span>` : '';
    if (hasFeels) aria += ', ' + t('tl.feels.aria', { v: fmtNum(feels) });
    if (spreadOn) aria += ', ' + t('tl.range.title', { min: fmtNum(w.tempMinC), max: fmtNum(w.tempMaxC) });
    const edge = i === 0 ? t('tl.start') : i === last ? t('tl.end') : t('unit.km');
    return `<button type="button" class="tl-card lv-${sc.level}" data-i="${i}" aria-current="false" aria-label="${esc(aria)}">
      <span class="tl-top"><span class="kmpost">${km}<small>${esc(edge)}</small></span>${lvIcon(sc.level)}</span>
      <span class="tl-eta">${eta}</span>
      <span class="tl-wx">${wxIcon(info.icon)}<span class="tl-temp">${fmtNum(w.tempC)}°</span></span>
      ${feelRow}${rangeRow}
      <span class="tl-rows">
        <span class="tl-row">${wxIcon('i-wind', '')}<b>${fmtNum(w.windKmh)}</b>/<b>${fmtNum(w.gustKmh)}</b>
          ${Number.isFinite(w.windDirDeg) ? `<svg aria-hidden="true" style="transform:rotate(${Math.round(w.windDirDeg + 180)}deg)"><use href="#i-arrow"/></svg>` : ''}</span>
        <span class="tl-row">${wxIcon('i-drop', '')}<b>${fmtNum(w.precipMm, 1)}</b>${esc(t('unit.mm'))} · ${fmtNum(w.precipProb)}%</span>
      </span>
      <span class="tl-reasons">${esc(reasons)}</span>
    </button>`;
  }).join('');
  renderTzNote();
  $('#timeline').innerHTML = `${renderReasons()}<h3 class="sec-title" style="margin-top:18px">${esc(t('tl.title'))}</h3><p class="hint tl-note" dir="auto">${esc(t('tl.tempnote'))}</p><div class="timeline-scroll">${cards}</div>`;
  $('#timeline').querySelectorAll('.tl-card').forEach((c) => c.addEventListener('click', () => selectPoint(Number(c.dataset.i))));
  markActive();
}

// Times on each card are local to that point; the departure input uses the device clock. Say so.
function renderTzNote() {
  const r = cur(), dev = deviceTz();
  const zones = [...new Set([r.samples[0], r.samples[r.samples.length - 1]].map((w) => w && w.tz).filter(Boolean))];
  let text;
  if (!zones.length) text = t('tz.unknown', { dev });
  else if (zones.length === 1 && zones[0] === dev) text = t('tz.same', { tz: dev });
  else text = t('tz.diff', { tz: zones.join(' / '), dev });
  const el = $('#tzNote');
  el.textContent = text;
  el.dir = 'auto';
}

function shiftLabel(min) {
  if (!min) return t('suggest.same');
  return '‎' + (min > 0 ? '+' : '-') + fmtDuration(Math.abs(min) * 60);
}

function renderSuggestions() {
  const el = $('#suggestions');
  const s = state.sug;
  let body = '';
  if (s.status === 'loading') body = `<div class="sug-wait"><span class="spin"></span><span>${esc(t('suggest.loading'))}</span></div>`;
  else if (s.status === 'error' || (s.status === 'ok' && !s.items.length)) body = `<p class="sug-note">${esc(t('suggest.error'))}</p>`;
  else if (s.status === 'ok') {
    const bestRank = Math.min(...s.items.map((x) => x.rank));
    const items = [...s.items].filter((x) => x.date.getTime() > Date.now() - 10 * 60000).sort((a, b) => a.date - b.date);
    body = `<div class="chips">${items.map((it) => {
      const sm = it.summary, lv = sm.worst;
      const sub = sm.dangerKm > 0 ? t('suggest.danger', { km: kmText(sm.dangerKm) }) : sm.cautionKm > 0 ? t('suggest.caution', { km: kmText(sm.cautionKm) }) : t('suggest.clean');
      const isBest = it.rank === bestRank, isCur = it.offsetMin === 0;
      const time = fmtTime(it.date); // device clock, same as the departure input
      return `<button type="button" class="chip${isBest ? ' best' : ''}" data-d="${it.date.getTime()}" ${isCur ? 'aria-current="true"' : ''}
        aria-label="${esc(t('suggest.apply', { time, shift: shiftLabel(it.offsetMin) }) + ', ' + sub)}">
        ${lvIcon(lv)}<span><span class="chip-main">${time}${isBest ? `<span class="tag">${esc(t('suggest.best'))}</span>` : ''}</span><br>
        <span class="chip-sub">${esc(shiftLabel(it.offsetMin))} · ${esc(sub)}</span></span></button>`;
    }).join('')}</div>`;
  }
  el.innerHTML = body ? `<h3 class="sec-title">${esc(t('suggest.title'))}</h3>${body}` : '';
  el.querySelectorAll('.chip[data-d]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(Number(b.dataset.d));
    if (b.getAttribute('aria-current') === 'true') return;
    $('#departInput').value = toLocalInput(d);
    plan({ reuse: true });
  }));
}

function renderPeek() {
  const r = cur(), lv = r.summary.worst;
  const b = $('#peek');
  b.hidden = false;
  b.innerHTML = `${lvIcon(lv)}<span class="peek-word">${esc(t('verdict.' + lv))}</span><span class="peek-meta">${esc(fmtDuration(r.duration))} · ${fmtNum(r.totalKm)} ${esc(t('unit.km'))}</span>`;
}

function renderFormSummary() {
  const b = $('#formSummary');
  if (!state.hasResults || !state.result) { b.hidden = true; return; }
  const when = new Intl.DateTimeFormat(getLang() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(state.depart);
  b.innerHTML = `<span class="fs-text"><bdi>${esc(state.result.from.label)}</bdi> &rsaquo; <bdi>${esc(state.result.to.label)}</bdi><span class="fs-sub"><bdi>${esc(when)}</bdi></span></span>
    <svg aria-hidden="true"><use href="#i-edit"/></svg>`;
  b.setAttribute('aria-label', t('form.edit'));
  b.hidden = false;
}

function renderResults() {
  if (!state.hasResults) return;
  $('#results').hidden = false;
  renderBanner(); renderCluster(); renderRoutes(); renderSpeed(); renderTimeline(); renderSuggestions(); renderPeek(); renderFormSummary();
}

function selectRoute(i) {
  if (i === state.sel || !state.routes[i]) return;
  state.sel = i; state.activeIdx = -1;
  renderResults(); drawMap();
  loadSuggestions();
}

/* ---------------- status + errors ---------------- */
function setStatus(key) {
  $('#status').innerHTML = `<div class="loading"><span class="spin"></span><span>${esc(t(key))}</span></div>`;
}
function clearStatus() { $('#status').innerHTML = ''; }

function showError(e) {
  let key = 'err.generic', params;
  const code = e && e.code;
  if (code === 'OUT_OF_RANGE') key = 'err.out_of_range';
  else if (code === 'NETWORK' || code === 'network') key = navigator.onLine === false ? 'err.offline' : 'err.network';
  else if (e instanceof AppError) { key = 'err.' + code; params = e.params; }
  else if (navigator.onLine === false) key = 'err.offline';
  if (t(key, params) === key) key = 'err.generic';
  $('#status').innerHTML = `<div class="error" role="alert">${lvIcon('danger')}<div><p>${esc(t(key, params))}</p>
    <button type="button" class="retry" id="retryBtn"><svg aria-hidden="true"><use href="#i-retry"/></svg>${esc(t('err.retry'))}</button></div></div>`;
  $('#retryBtn').addEventListener('click', () => plan());
  if (snap === 'peek') applySnap('mid');
  if (!state.hasResults) $('#form').hidden = false;
  if (e && !(e instanceof AppError) && code !== 'OUT_OF_RANGE' && code !== 'NETWORK') console.error(e);
}

/* ---------------- suggestions ---------------- */
// Changing the riding speed re-scores; the forecast for each candidate departure is fetched only once per route.
const sugWeather = new WeakMap(); // points array -> Map(departure ms -> Promise<samples>)
// The request is not tied to an abort signal: a newer run may share it, stale results are dropped by token.
function cachedWeather(points, date) {
  let m = sugWeather.get(points);
  if (!m) sugWeather.set(points, (m = new Map()));
  const key = date.getTime();
  if (!m.has(key)) {
    const pr = getWeather(points, date);
    m.set(key, pr);
    pr.catch(() => m.delete(key));
  }
  return m.get(key);
}

async function loadSuggestions() {
  const r = cur();
  if (!r) return;
  if (sugCtrl) sugCtrl.abort();
  const ctrl = sugCtrl = new AbortController();
  const token = ++sugToken;
  state.sug = { status: 'loading', items: [] };
  renderSuggestions();
  // Only candidates that are not in the past and fit the forecast window; the planned time is always checked.
  const base = state.depart.getTime(), now = Date.now(), max = maxDepartMs();
  const offsetsMin = [-60, 0, 60, 120, 180].filter((o) => o === 0 || (base + o * 60000 >= now - 10 * 60000 && base + o * 60000 <= max));
  try {
    const items = await suggestDeparture(r.points, state.depart, { offsetsMin, ridingSpeedKmh: state.speed, weatherFn: (p, d) => cachedWeather(p, d) });
    if (token !== sugToken) return;
    state.sug = { status: 'ok', items: Array.isArray(items) ? items : [] };
  } catch (e) {
    if (token !== sugToken) return;
    state.sug = { status: 'error', items: [] };
  }
  renderSuggestions();
}

/* ---------------- planning flow ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const Q15 = 15 * 60000;
const roundUp15 = (d) => new Date(Math.ceil(d.getTime() / Q15) * Q15);
const PAST_GRACE_MS = 50 * 60000;
// Open-Meteo serves 7 forecast days. The last day depends on the point's zone, so the picker allows up to the end of
// local day +6 and the weather layer reports OUT_OF_RANGE (clear message) if a long route arrives beyond the data.
function maxDepartMs() {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  d.setHours(23, 45, 0, 0);
  return d.getTime();
}
let departDirty = false;
function refreshDepartBounds() {
  const inp = $('#departInput');
  const now = new Date();
  inp.min = toLocalInput(new Date(Math.floor(now.getTime() / Q15) * Q15));
  inp.max = toLocalInput(new Date(maxDepartMs()));
  // An untouched default must not go stale while the app sits in the background.
  if (!departDirty && (!inp.value || new Date(inp.value).getTime() < now.getTime() - 5 * 60000)) inp.value = toLocalInput(roundUp15(now));
}

function readDepart() {
  const v = $('#departInput').value;
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new AppError('bad_time');
  if (d.getTime() < Date.now() - PAST_GRACE_MS) throw new AppError('past');
  if (d.getTime() > maxDepartMs()) throw new AppError('too_far');
  return d;
}

// pre = place already chosen from the list (or "my location"); q = the text snapshot taken when planning started.
async function resolvePlace(pre, q, signal) {
  if (pre) return pre;
  if (!q) throw new AppError('missing');
  const res = await geocode(q, signal);
  if (!res.length) throw new AppError('no_result', { q });
  return res[0];
}

function setBusy(b) {
  state.busy = b;
  const btn = $('#planBtn');
  btn.disabled = b;
  btn.setAttribute('aria-busy', String(b));
}

// Every call aborts the previous one (network included) and only the newest call may touch state or the DOM.
async function plan({ reuse = false } = {}) {
  if (planCtrl) planCtrl.abort();
  if (sugCtrl) sugCtrl.abort();
  sugToken++;
  const ctrl = planCtrl = new AbortController();
  const { signal } = ctrl;
  const id = ++planId;
  setBusy(true);
  clearStatus();
  try {
    if (navigator.onLine === false && !DEMO) throw new AppError('offline');
    const depart = readDepart();
    let routes, from, to;
    if (reuse && state.routes.length && state.result) {
      ({ from, to } = state.result);
      routes = state.routes;
    } else {
      reuse = false;
      const pre = { from: state.from, to: state.to };
      const qs = { from: $('#fromInput').value.trim(), to: $('#toInput').value.trim() };
      setStatus('status.geocode');
      from = await resolvePlace(pre.from, qs.from, signal);
      to = await resolvePlace(pre.to, qs.to, signal);
      if (id !== planId) return;
      if (haversineKm(from, to) < 0.05) throw new AppError('same');
      setStatus('status.route');
      routes = await getRoutes(from, to, signal);
      if (id !== planId) return;
      // Commit the resolved places only if the user did not edit the fields meanwhile.
      for (const [k, v] of [['from', from], ['to', to]]) {
        const inp = $('#' + k + 'Input');
        if (!state[k] && inp.value.trim() === qs[k]) { state[k] = v; inp.value = v.label; }
      }
    }
    setStatus('status.weather');
    const settled = await Promise.allSettled(routes.map((r) => analyze(r, depart, signal)));
    if (id !== planId) return;
    if (settled[0].status === 'rejected') throw settled[0].reason;
    const ok = settled.filter((x) => x.status === 'fulfilled').map((x) => x.value);
    state.sel = reuse ? clamp(state.sel, 0, ok.length - 1) : 0;
    state.routes = ok;
    state.result = { from, to };
    state.depart = depart;
    state.activeIdx = -1;
    state.hasResults = true;
    clearStatus();
    $('#form').hidden = true;
    $('#sheetBody').scrollTop = 0;
    renderResults();
    applySnap(snap === 'full' ? 'full' : 'mid');
    drawMap();
    saveStore({ from: from.my ? null : from, to: to.my ? null : to });
    loadSuggestions();
  } catch (e) {
    if (id !== planId || isAbort(e)) return;
    showError(e);
  } finally {
    if (id === planId) setBusy(false);
  }
}

/* ---------------- address fields ----------------
   No search-as-you-type (Nominatim forbids client-side autocomplete). Enter runs one search and shows the
   candidates; planning without choosing one uses the best match. */
function setupField(key) {
  const input = $('#' + key + 'Input'), list = $('#' + key + 'List');
  let ctrl = null, items = [], idx = -1, token = 0;
  const hide = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); idx = -1; input.removeAttribute('aria-activedescendant'); };
  const paint = () => {
    list.replaceChildren(...items.map((it, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `${key}Opt${i}`;
      li.dataset.i = String(i);
      li.setAttribute('aria-selected', String(i === idx));
      const b = document.createElement('bdi');
      b.textContent = it.label; // textContent: place names come from a third party
      li.appendChild(b);
      return li;
    }));
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(items.length > 0));
    if (idx >= 0) input.setAttribute('aria-activedescendant', `${key}Opt${idx}`); else input.removeAttribute('aria-activedescendant');
  };
  const choose = (i) => {
    const it = items[i];
    if (!it) return;
    state[key] = it; input.value = it.label; hide();
  };
  const search = async () => {
    const q = input.value.trim();
    if (q.length < 2) return;
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const my = ++token;
    try {
      const found = await geocode(q, ctrl.signal);
      if (my !== token) return;
      items = found; idx = -1; paint();
      if (!found.length) showError(new AppError('no_result', { q }));
    } catch (e) {
      if (isAbort(e) || my !== token) return;
      items = []; hide(); showError(e);
    }
  };
  input.addEventListener('input', () => {
    state[key] = null;
    token++; if (ctrl) ctrl.abort();
    items = []; hide();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); idx = (idx + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter' && !list.hidden && items.length) { e.preventDefault(); choose(idx >= 0 ? idx : 0); }
    else if (e.key === 'Enter' && !state[key] && input.value.trim().length >= 2) { e.preventDefault(); search(); }
    else if (e.key === 'Escape') hide();
  });
  input.addEventListener('blur', () => setTimeout(hide, 150));
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); choose(Number(li.dataset.i)); }
  });
}

function useMyLocation() {
  if (DEMO) { state.from = { ...DEMO_PLACES[0], label: t('form.myLocation'), my: true }; $('#fromInput').value = state.from.label; return; }
  if (!navigator.geolocation) return showError(new AppError('geo_unsupported'));
  const btn = $('#locBtn');
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      state.from = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: t('form.myLocation'), my: true };
      $('#fromInput').value = state.from.label;
      clearStatus();
    },
    (err) => { btn.disabled = false; showError(new AppError(err && err.code === 1 ? 'geo_denied' : 'geo_failed')); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function swapPlaces() {
  const a = $('#fromInput'), b = $('#toInput');
  [state.from, state.to] = [state.to, state.from];
  [a.value, b.value] = [b.value, a.value];
}

/* ---------------- theme + language ---------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = theme === 'light' ? '#e6e9eb' : '#14181b';
}
let UPDATE_READY = null; // waiting service worker, when a new version was downloaded
let updateRequested = false;
function showUpdateToast() {
  $('#toastText').textContent = t('update.available');
  $('#toastBtn').textContent = t('update.reload');
  $('#toast').hidden = false;
}
function refreshLanguage() {
  applyI18n();
  [['from', '#fromInput'], ['to', '#toInput']].forEach(([k, sel]) => {
    if (state[k] && state[k].my) { state[k].label = t('form.myLocation'); $(sel).value = state[k].label; }
  });
  $('#departHint').textContent = t('form.deviceTz', { tz: deviceTz() });
  renderResults();
  placeControls();
  if (UPDATE_READY) showUpdateToast();
  if (state.hasResults && map) drawMap({ fit: false });
}

/* ---------------- init ---------------- */
function init() {
  const store = loadStore();
  setLang(store.lang === 'en' ? 'en' : 'he');
  applyTheme(store.theme === 'light' ? 'light' : 'dark');
  if (SPEEDS.includes(store.speed)) state.speed = store.speed;
  applyI18n();
  if (DEMO) $('#demoBadge').hidden = false;

  initMap();
  initSheet();
  applySnap('mid');
  setupField('from'); setupField('to');

  refreshDepartBounds();
  $('#departHint').textContent = t('form.deviceTz', { tz: deviceTz() });
  $('#departInput').addEventListener('input', () => { departDirty = true; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDepartBounds(); });
  if (DEMO) {
    state.from = { ...DEMO_PLACES[0] }; state.to = { ...DEMO_PLACES[1] };
  } else {
    const okPlace = (p) => p && !p.my && Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.label === 'string';
    if (okPlace(store.from)) state.from = { lat: store.from.lat, lon: store.from.lon, label: store.from.label };
    if (okPlace(store.to)) state.to = { lat: store.to.lat, lon: store.to.lon, label: store.to.label };
  }
  if (state.from) $('#fromInput').value = state.from.my ? t('form.myLocation') : state.from.label;
  if (state.to) $('#toInput').value = state.to.label;

  $('#form').addEventListener('submit', (e) => { e.preventDefault(); plan(); });
  $('#locBtn').addEventListener('click', useMyLocation);
  $('#swapBtn').addEventListener('click', swapPlaces);
  $('#formSummary').addEventListener('click', () => {
    $('#form').hidden = false; $('#formSummary').hidden = true;
    if (snap === 'peek') applySnap('mid');
    $('#fromInput').focus();
  });
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next); saveStore({ theme: next });
    if (state.hasResults) drawMap({ fit: false });
  });
  $('#langBtn').addEventListener('click', () => {
    const next = getLang() === 'he' ? 'en' : 'he';
    setLang(next); saveStore({ lang: next });
    refreshLanguage();
  });
  window.addEventListener('online', () => { if ($('#status .error')) clearStatus(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        const offer = (w) => { UPDATE_READY = w; showUpdateToast(); };
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
        });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch(() => {});
    });
    // Reload only after the user accepted an update (the very first install also fires controllerchange).
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
    $('#toastBtn').addEventListener('click', () => {
      updateRequested = true;
      if (UPDATE_READY) UPDATE_READY.postMessage({ type: 'SKIP_WAITING' });
    });
  }
  if (DEMO) setTimeout(() => plan(), 100);
}

init();
