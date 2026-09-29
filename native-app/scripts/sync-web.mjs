#!/usr/bin/env node
// Builds native-app/www from the repo's berlin-transit.html.
//
// The root web file stays the single source of truth (and keeps working on
// GitHub Pages unchanged). Only the copy in www/ is rewritten for the native
// shell:
//   - Leaflet is bundled from node_modules into www/vendor/leaflet (no CDN,
//     so the map UI loads offline / on flaky networks; tiles stay remote)
//   - viewport-fit=cover + safe-area padding so the header/panels clear the
//     notch, status bar and gesture bar
//   - src/native.js (status bar + Android back button) is injected
//
// www/ is generated output and is gitignored; run `npm run sync-web`.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appDir, '..');
const www = join(appDir, 'www');
const leafletDist = join(appDir, 'node_modules', 'leaflet', 'dist');
const LEAFLET_VERSION = '1.9.4';

const leafletPkg = JSON.parse(readFileSync(join(appDir, 'node_modules', 'leaflet', 'package.json'), 'utf8'));
if (leafletPkg.version !== LEAFLET_VERSION) {
  throw new Error(`Expected leaflet ${LEAFLET_VERSION} in node_modules, found ${leafletPkg.version}. Run npm ci.`);
}

let html = readFileSync(join(repoRoot, 'berlin-transit.html'), 'utf8');

// Replace exactly one occurrence, failing loudly if the web file drifted.
function replaceOnce(from, to, what) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`sync-web: expected 1 match for ${what}, found ${n}`);
  html = html.replace(from, () => to);
}

const cdn = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist`;
replaceOnce('  <link rel="preconnect" href="https://unpkg.com"/>\n', '', 'unpkg preconnect');
replaceOnce(`href="${cdn}/leaflet.css"`, 'href="vendor/leaflet/leaflet.css"', 'leaflet.css');
replaceOnce(`src="${cdn}/leaflet.js"`, 'src="vendor/leaflet/leaflet.js"', 'leaflet.js');
replaceOnce(
  'content="width=device-width,initial-scale=1.0"',
  'content="width=device-width,initial-scale=1.0,viewport-fit=cover"',
  'viewport meta',
);
if (html.includes('unpkg.com')) throw new Error('sync-web: unpkg.com reference left in output');
if (!html.includes("'serviceWorker' in navigator && !window.Capacitor")) {
  throw new Error('sync-web: service worker registration is no longer guarded with !window.Capacitor');
}

// Safe areas. Capacitor 8 on Android injects --safe-area-inset-* (older
// WebViews report env() as 0); iOS reports env(). Rules mirror the original
// desktop + mobile layout, only adding the insets.
const safeAreaCss = `<style id="native-safe-area">
  :root{
    --sat:var(--safe-area-inset-top,env(safe-area-inset-top,0px));
    --sar:var(--safe-area-inset-right,env(safe-area-inset-right,0px));
    --sab:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px));
    --sal:var(--safe-area-inset-left,env(safe-area-inset-left,0px));
  }
  header{height:calc(46px + var(--sat));padding-top:var(--sat);
    padding-left:calc(14px + var(--sal));padding-right:calc(14px + var(--sar))}
  .filter-bar{top:calc(56px + var(--sat));right:calc(10px + var(--sar))}
  .panel{top:calc(56px + var(--sat));left:calc(10px + var(--sal));bottom:calc(10px + var(--sab))}
  #debugBadge{bottom:calc(10px + var(--sab));right:calc(10px + var(--sar))}
  .leaflet-top{top:var(--sat)}
  .leaflet-left{left:var(--sal)}
  @media(max-width:768px){
    header{height:calc(44px + var(--sat));
      padding-left:calc(12px + var(--sal));padding-right:calc(12px + var(--sar))}
    .filter-bar{top:calc(44px + var(--sat));right:0;
      padding-left:calc(10px + var(--sal));padding-right:calc(10px + var(--sar))}
    .panel{top:auto;left:0;bottom:0;padding-bottom:var(--sab)}
    .panel.collapsed{height:calc(56px + var(--sab))}
    #debugBadge{bottom:calc(52% + 8px);right:calc(8px + var(--sar))}
  }
</style>
`;
replaceOnce('</head>', `${safeAreaCss}</head>`, '</head>');
replaceOnce('</body>', '<script src="native.js"></script>\n</body>', '</body>');

rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'vendor', 'leaflet'), { recursive: true });
writeFileSync(join(www, 'index.html'), html);
cpSync(join(appDir, 'src', 'native.js'), join(www, 'native.js'));
cpSync(join(repoRoot, 'icon.png'), join(www, 'icon.png'));
for (const f of ['leaflet.js', 'leaflet.css', 'images']) {
  cpSync(join(leafletDist, f), join(www, 'vendor', 'leaflet', f), { recursive: true });
}
console.log(`sync-web: wrote ${www} (leaflet ${LEAFLET_VERSION} bundled locally)`);
