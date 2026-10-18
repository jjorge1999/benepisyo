#!/usr/bin/env python3
"""
Build data/lgus.json: every Philippine city and municipality with its province, region and an approximate
town-centre coordinate (used only on the phone to guess the city from location).

Sources (both CC BY 4.0):
  - Names, types, provinces, regions: PSA Philippine Standard Geographic Code, 30 June 2026
    (npm package @ianlabicani/geoph-lite, folder `regions/`)
  - Coordinates: GeoNames gazetteer (npm package cities.json: cities.json + admin2.json)

Usage: python3 -I build_lgus.py <geoph-lite package dir> <cities.json package dir> <out.json>
"""
import glob, json, re, sys, unicodedata

GEOPH, CITIES, OUT = sys.argv[1:4]

# PSGC region code prefix -> GeoNames admin1 codes covering it (NIR and BARMM span older regions).
REGION_ADMIN1 = {
    '01': ['01'], '02': ['02'], '03': ['03'], '04': ['40'], '05': ['05'], '06': ['06'], '07': ['07'], '08': ['08'],
    '09': ['09'], '10': ['10'], '11': ['11'], '12': ['12'], '13': ['NCR'], '14': ['15'], '16': ['13'], '17': ['41'],
    '18': ['06', '07'], '19': ['14', '12', '09'],
}
# Names kept from before so existing links keep working.
KEEP_ID = {('calamba', 'Laguna'): 'calamba'}


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\(.*?\)', ' ', s)
    for a, b in [('island garden city of ', ''), ('city of ', ''), ('municipality of ', ''), ('province of ', ''),
                 (' city', ''), ('sta. ', 'santa '), ('sto. ', 'santo '), ('gen. ', 'general '), ('pres. ', 'president '),
                 ('ñ', 'n')]:
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]', '', s)


def slug(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\(.*?\)', ' ', s).replace('city of ', '').replace(' city', '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def pretty(name):
    m = re.match(r'^City of (.+)$', name)
    return (m.group(1) + ' City') if m else name


# ---- GeoNames ----
cities = [c for c in json.load(open(f'{CITIES}/cities.json')) if c.get('country') == 'PH']
admin2 = {a['code']: norm(a['name']) for a in json.load(open(f'{CITIES}/admin2.json')) if a['code'].startswith('PH.')}
by_name = {}
for c in cities:
    c['prov'] = admin2.get(f"PH.{c['admin1']}.{c['admin2']}", '')
    by_name.setdefault(norm(c['name']), []).append(c)

# ---- PSGC ----
lgus = []
for f in sorted(glob.glob(f'{GEOPH}/regions/*.json')):
    reg = json.load(open(f))
    rcode = reg['psgc_code'][:2]
    groups = [(p['name'], p.get('localities', [])) for p in reg.get('provinces', [])] + [('', reg.get('localities', []))]
    for prov, locs in groups:
        for l in locs:
            lgus.append({'psgc': l['psgc_code'], 'name': pretty(l['name']), 'raw': l['name'], 'type': l.get('type', ''),
                         'province': prov, 'region': reg['name'], 'rcode': rcode})

matched = approx = 0
for x in lgus:
    cands = by_name.get(norm(x['raw']), [])
    pick = [c for c in cands if x['province'] and c['prov'] == norm(x['province'])]
    if not pick:
        pick = [c for c in cands if c['admin1'] in REGION_ADMIN1.get(x['rcode'], [])]
    if not pick and len(cands) == 1:
        pick = cands
    if pick:
        x['lat'], x['lng'] = round(float(pick[0]['lat']), 4), round(float(pick[0]['lng']), 4)
        matched += 1

# Towns without a confident match get no coordinate (they are typed in instead of detected).

# Stable, readable ids: town name, plus province when the name repeats.
counts = {}
for x in lgus:
    counts[slug(x['raw'])] = counts.get(slug(x['raw']), 0) + 1
for x in lgus:
    base = slug(x['raw'])
    if (base, x['province']) in KEEP_ID:
        x['id'] = KEEP_ID[(base, x['province'])]
    elif counts[base] == 1:
        x['id'] = base
    elif x['type'] == 'city':
        x['id'] = f'{base}-city'
    else:
        x['id'] = f"{base}-{slug(x['province'] or x['region'])}"
seen = {}
for x in lgus:
    seen[x['id']] = seen.get(x['id'], 0) + 1
for x in lgus:
    if seen[x['id']] > 1 and x['id'] != 'calamba':
        x['id'] = f"{slug(x['raw'])}-{slug(x['province'] or x['region'])}"
assert len({x['id'] for x in lgus}) == len(lgus), 'duplicate ids'

out = [{k: x[k] for k in ('id', 'name', 'type', 'province', 'region', 'psgc', 'lat', 'lng', 'approx') if k in x} for x in lgus]
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(out)} LGUs ({sum(1 for x in out if x["type"] == "city")} cities); coordinates for {matched}, none for {len(out) - matched}')
