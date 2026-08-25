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
def short(v, n=240):
    s = re.sub(r'\s+', ' ', str(v or '')).strip()
    return s[:n]

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
        'context': short(c.get('cultural_context'), 900),
        'curatorial': short(c.get('curatorial'), 500),
        'sig': short(c.get('genre_significance'), 500),
        'era': short(c.get('era'), 400),
        'movement': short(c.get('movement'), 200),
        'dbio': short(c.get('director_bio'), 400),
        'effects': arr(c.get('effects'), 6),
        'fashion': arr(c.get('fashion'), 6),
    }

p = os.path.join(ROOT, 'data', 'index.json')
json.dump(index, open(p, 'w'), separators=(',', ':'))
print(f'index.json   {os.path.getsize(p)/1e6:6.1f} MB')

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
