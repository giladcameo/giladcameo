// Builds www/ for Capacitor from the web app in ../moto-weather.
// Run from this folder: npm run prepare-www
// - copies the app (without the service worker, which a native shell does not need)
// - bundles Leaflet locally so the map code loads without a CDN
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.resolve(root, '..', 'moto-weather');
const out = path.join(root, 'www');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const item of ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons']) {
  await cp(path.join(src, item), path.join(out, item), { recursive: true });
}

const leafletDist = path.join(root, 'node_modules', 'leaflet', 'dist');
const vendor = path.join(out, 'vendor', 'leaflet');
await mkdir(vendor, { recursive: true });
await cp(path.join(leafletDist, 'leaflet.js'), path.join(vendor, 'leaflet.js'));
await cp(path.join(leafletDist, 'leaflet.css'), path.join(vendor, 'leaflet.css'));
await cp(path.join(leafletDist, 'images'), path.join(vendor, 'images'), { recursive: true });

const indexPath = path.join(out, 'index.html');
let html = await readFile(indexPath, 'utf8');
const cssTag = /<link[^>]*href="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css"[^>]*>/;
const jsTag = /<script[^>]*src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[^>]*><\/script>/;
if (!cssTag.test(html) || !jsTag.test(html)) {
  throw new Error('Could not find the Leaflet CDN tags in moto-weather/index.html. Update scripts/prepare-www.mjs.');
}
html = html
  .replace(cssTag, '<link rel="stylesheet" href="vendor/leaflet/leaflet.css">')
  .replace(jsTag, '<script src="vendor/leaflet/leaflet.js"></script>');
if (html.includes('unpkg.com')) throw new Error('A unpkg.com reference is still left in index.html');
await writeFile(indexPath, html);

console.log('www/ is ready');
