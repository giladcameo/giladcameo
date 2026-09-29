#!/usr/bin/env python3
"""Build data/vbb-network.json for one-transfer.html.

Inputs are the npm packages `vbb-trips` (timetable, derived from the VBB GTFS
feed) and `vbb-stations` (station names and coordinates):

    npm pack vbb-trips vbb-stations
    mkdir -p trips stations
    tar xzf vbb-trips-*.tgz -C trips && tar xzf vbb-stations-*.tgz -C stations
    python3 scripts/build_one_transfer_data.py trips/package stations/package

The output collapses every timetable into "patterns": one per line and station
sequence, with typical minutes from the first stop and the number of trips on a
reference weekday. That is all the browser needs to work out where you can get
with at most two rides.
"""
import collections
import datetime
import json
import os
import statistics
import sys

TRIPS_DIR, STATIONS_DIR = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'vbb-network.json')

REF_DAY = datetime.date(2026, 3, 24)   # a regular Tuesday in the feed
UTC_OFFSET = 3600                      # CET on the reference day
DAY_FROM, DAY_TO = 6 * 3600, 20 * 3600 # window used for the headway estimate

PRODUCTS = ['suburban', 'subway', 'tram', 'bus', 'regional', 'ferry']


def station_key(stop_id):
    parts = stop_id.split(':')
    return ':'.join(parts[:3]) if len(parts) >= 3 else stop_id


stations_full = json.load(open(os.path.join(STATIONS_DIR, 'full.json')))
# Only big stations have a parent entry; smaller ones are listed per platform.
for sid, st in list(stations_full.items()):
    stations_full.setdefault(station_key(sid), st)
lines = {}
for raw in open(os.path.join(TRIPS_DIR, 'data', 'lines.ndjson')):
    l = json.loads(raw)
    lines[l['id']] = l

ref_start = int(datetime.datetime(REF_DAY.year, REF_DAY.month, REF_DAY.day,
                                  tzinfo=datetime.timezone.utc).timestamp()) - UTC_OFFSET

# (line id, station tuple) -> {'offsets': [[min per stop], ...], 'trips', 'day'}
patterns = {}
for raw in open(os.path.join(TRIPS_DIR, 'data', 'schedules.ndjson')):
    s = json.loads(raw)
    line = lines.get(s['route']['line'])
    if not line:
        continue
    starts = [t - ref_start for t in s['starts'] if 0 <= t - ref_start < 86400 + 4 * 3600]
    if not starts:
        continue
    seq, offs = [], []
    for stop, times in zip(s['route']['stops'], s['sequence']):
        key = station_key(stop)
        t = times.get('departure') if times.get('departure') is not None else times.get('arrival')
        if t is None:
            continue
        if seq and seq[-1] == key:  # two platforms of the same station in a row
            continue
        seq.append(key)
        offs.append(t)
    if len(seq) < 2:
        continue
    p = patterns.setdefault((line['id'], tuple(seq)), {'offsets': [], 'trips': 0, 'day': 0})
    p['offsets'].append(offs)
    p['trips'] += len(starts)
    p['day'] += sum(1 for t in starts if DAY_FROM <= t < DAY_TO)


def station_info(key):
    st = stations_full.get(key)
    if st is None:
        return None
    loc = st['location']
    name = st['name']
    for suffix in (' (Berlin)',):
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    return name, round(loc['latitude'], 5), round(loc['longitude'], 5)


station_idx, station_rows = {}, []
line_idx, line_rows = {}, []
out_patterns = []
missing = set()
for (line_id, seq), p in sorted(patterns.items(), key=lambda kv: -kv[1]['trips']):
    known = [i for i, k in enumerate(seq) if station_info(k) is not None]
    missing.update(k for k in seq if station_info(k) is None)
    if len(known) < 2:
        continue
    seq = [seq[i] for i in known]
    p['offsets'] = [[o[i] for i in known] for o in p['offsets']]
    line = lines[line_id]
    product = line['product'] if line['product'] in PRODUCTS else 'bus'
    lkey = (line['name'], product)
    if lkey not in line_idx:
        line_idx[lkey] = len(line_rows)
        line_rows.append([line['name'], PRODUCTS.index(product)])
    ids = []
    for k in seq:
        if k not in station_idx:
            station_idx[k] = len(station_rows)
            station_rows.append(list(station_info(k)))
        ids.append(station_idx[k])
    # Typical minutes from the first stop, delta-encoded (keeps the file small).
    mins = [round(statistics.median(col) / 60) for col in zip(*p['offsets'])]
    mins = [max(m, mins[i - 1] if i else 0) for i, m in enumerate(mins)]
    deltas = [mins[0]] + [b - a for a, b in zip(mins, mins[1:])]
    out_patterns.append([line_idx[lkey], p['day'], ids, deltas])

json.dump({
    'source': 'VBB GTFS via vbb-trips / vbb-stations (derhuerst), CC-BY 4.0 VBB',
    'refDay': REF_DAY.isoformat(),
    'products': PRODUCTS,
    'stations': station_rows,   # [name, lat, lon]
    'lines': line_rows,         # [name, product index]
    'patterns': out_patterns,   # [line, trips 06-20h, [station], [minute deltas]]
}, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
print(f'{len(station_rows)} stations, {len(line_rows)} lines, {len(out_patterns)} patterns, '
      f'{len(missing)} unknown stations dropped -> {os.path.getsize(OUT) / 1e6:.2f} MB')
