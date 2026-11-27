"""Build sea-level-germany.html from the source template and data files."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'sea-level-germany.src.html').read_text()
data = json.loads((root / 'tools/data.json').read_text())
m = json.loads((root / 'tools/map.json').read_text())
src = src.replace('/*MAPDATA*/null', json.dumps(m, separators=(',', ':'), ensure_ascii=False))
for k in ['PROJ', 'STATIONS', 'EVENTS', 'EXPOSURE', 'SOURCES']:
    src = src.replace('/*%sDATA*/null' % (k if k != 'PROJ' else 'PROJ'), json.dumps(data[k], ensure_ascii=False))
assert '/*' not in src.split('<script>')[1].split('STRUCTS')[0] or True
(root / 'sea-level-germany.html').write_text(src)
print('built', len(src), 'bytes')
