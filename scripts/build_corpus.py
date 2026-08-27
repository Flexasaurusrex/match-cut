#!/usr/bin/env python3
"""Split the annotated archive into a light search index and a lazy detail file.

index.json  : everything needed to search, filter and rank. Loads on boot.
detail.json : the prose an agent quotes. Fetched once, in the background.
"""
import json, os, re

def fnv1a(s: str) -> int:
    h = 0x811c9dc5
    for ch in s.encode('utf8'):
        h ^= ch
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cards = json.load(open(os.path.join(ROOT, 'data/cards.json')))

def num(v, d=0.0):
    try: return round(float(v), 2)
    except Exception: return d
def arr(v, n=8):
    if isinstance(v, list): return [str(x) for x in v[:n]]
    if isinstance(v, str) and v.strip(): return [v]
    return []
def text(v):
    # No truncation. The prose is the most valuable thing in the archive and the
    # whole corpus is 17.5MB, sharded 128 ways. Cutting it mid-sentence was
    # costing 66% of the curatorial assessments and 61% of the director bios.
    return re.sub(r'\s+', ' ', str(v or '')).strip()

index, detail = [], {}
for c in cards:
    cid = c.get('id')
    if not cid: continue
    conns = []
    for k in (c.get('conns') or [])[:8]:
        if not isinstance(k, dict): continue
        conns.append({'a': k.get('a',''), 'v': k.get('v',''), 'r': k.get('r',''), 't': k.get('t','')})
    index.append({
        'id': cid,
        'a': c.get('artist',''),
        't': c.get('title',''),
        'y': c.get('year'),
        'd': c.get('director') or '',
        'nt': c.get('narrative_type') or '',
        've': c.get('visual_era') or '',
        'tier': c.get('tier'),
        'dc': c.get('director_confidence') or '',
        'vs': c.get('verification_score'),
        'dur': num(c.get('duration')),
        # visual fingerprint, the thing you cannot search for anywhere else
        'fp': {'motion': num(c.get('avg_motion')), 'bright': num(c.get('avg_brightness')),
               'warm': num(c.get('avg_warmth')), 'sat': num(c.get('avg_saturation')),
               'contrast': num(c.get('avg_contrast')), 'shotlen': num(c.get('avg_shot_length')),
               'cuts': num(c.get('cuts')), 'scenes': num(c.get('scene_count'))},
        'tags': arr(c.get('tags'), 10),
        'tech': arr(c.get('techniques'), 6),
        'subs': arr(c.get('subcultures'), 6),
        'conns': conns,
    })
    detail[cid] = {
        'context': text(c.get('cultural_context')),
        'curatorial': text(c.get('curatorial')),
        'sig': text(c.get('genre_significance')),
        'era': text(c.get('era')),
        'movement': text(c.get('movement')),
        'dbio': text(c.get('director_bio')),
        'effects': arr(c.get('effects'), 6),
        'fashion': arr(c.get('fashion'), 6),
    }

# Boot payload: columnar, dictionary encoded, no repeated keys. Everything
# needed to search and to draw a fingerprint, and nothing else.
def dictionary(vals):
    seen, out, table = {}, [], []
    for v in vals:
        v = v or ''
        if v not in seen:
            seen[v] = len(table); table.append(v)
        out.append(seen[v])
    return table, out

d_table, d_idx = dictionary([c['d'] for c in index])
nt_table, nt_idx = dictionary([c['nt'] for c in index])
ve_table, ve_idx = dictionary([c['ve'] for c in index])
dc_table, dc_idx = dictionary([c['dc'] for c in index])

FP = ('motion', 'bright', 'warm', 'sat', 'contrast', 'shotlen', 'cuts', 'scenes')
core = {
    'n': len(index),
    'id': [c['id'] for c in index],
    'a': [c['a'] for c in index],
    't': [c['t'] for c in index],
    'y': [c['y'] for c in index],
    'tier': [c['tier'] for c in index],
    'dur': [c['dur'] for c in index],
    'fp': [[c['fp'][k] for k in FP] for c in index],
    'dict': {'d': d_table, 'nt': nt_table, 've': ve_table, 'dc': dc_table},
    'di': d_idx, 'nti': nt_idx, 'vei': ve_idx, 'dci': dc_idx,
}
q = os.path.join(ROOT, 'data', 'core.json')
json.dump(core, open(q, 'w'), separators=(',', ':'))
print(f'core.json    {os.path.getsize(q)/1e6:6.2f} MB')

# Everything else arrives in the background and is merged in as it lands.
extra = {
    'tags': [c['tags'] for c in index],
    'tech': [c['tech'] for c in index],
    'subs': [c['subs'] for c in index],
    'conns': [c['conns'] for c in index],
}
q = os.path.join(ROOT, 'data', 'extra.json')
json.dump(extra, open(q, 'w'), separators=(',', ':'))
print(f'extra.json   {os.path.getsize(q)/1e6:6.2f} MB')

BUCKETS = 128
os.makedirs(os.path.join(ROOT, 'data/detail'), exist_ok=True)
buckets = {}
for cid, v in detail.items():
    buckets.setdefault(fnv1a(cid) % BUCKETS, {})[cid] = v
tot = 0
for b, obj in buckets.items():
    q = os.path.join(ROOT, 'data/detail', f'{b:03d}.json')
    json.dump(obj, open(q, 'w'), separators=(',', ':'))
    tot += os.path.getsize(q)
print(f'detail/      {tot/1e6:6.1f} MB across {len(buckets)} shards')

print(f'\n{len(index)} cards')
print(f'  with director   {sum(1 for c in index if c["d"])}')
print(f'  with conns      {sum(1 for c in index if c["conns"])}')
print(f'  total conns     {sum(len(c["conns"]) for c in index)}')
yrs=[c["y"] for c in index if c["y"]]
print(f'  years           {min(yrs)} to {max(yrs)}')
