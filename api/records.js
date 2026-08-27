/* Physical releases for the artist on screen, from the Discogs database.
   Proxied because Discogs does not send CORS headers and rate limits to 25/min
   unauthenticated. Cached hard: a 1971 pressing does not change. */

const UA = 'MatchCut/1.0 +https://matchcut.live';
const cache = new Map();            // survives warm invocations
const TTL = 1000 * 60 * 60 * 12;

async function dg(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.body;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`discogs ${r.status}`);
  const body = await r.json();
  cache.set(url, { at: Date.now(), body });
  return body;
}

export default async function handler(req, res) {
  const artist = (req.query.artist || '').toString().slice(0, 80).trim();
  const title = (req.query.title || '').toString().slice(0, 80).trim();
  const want = (req.query.format || '').toString().slice(0, 20);
  if (!artist) return res.status(200).json({ error: 'artist required' });

  try {
    const q = new URLSearchParams({
      q: [artist, title].filter(Boolean).join(' '),
      type: 'release', per_page: '12',
    });
    if (want) q.set('format', want);
    const search = await dg(`https://api.discogs.com/database/search?${q}`);

    // one release per pressing family, so the list is not six copies of one record
    const seen = new Set();
    const picks = [];
    for (const r of (search.results || [])) {
      const fam = `${r.master_id || r.id}`;
      if (seen.has(fam)) continue;
      seen.add(fam);
      picks.push(r);
      if (picks.length >= 5) break;
    }

    // real marketplace prices, top few only, to stay inside the rate limit
    const priced = await Promise.all(picks.map(async (r) => {
      let price = null, currency = null, forSale = null;
      try {
        const full = await dg(`https://api.discogs.com/releases/${r.id}`);
        price = full.lowest_price ?? null;
        currency = price != null ? 'USD' : null;
        forSale = full.num_for_sale ?? null;
      } catch (e) {}
      return {
        id: r.id,
        title: (r.title || '').replace(/^.*? - /, ''),
        artist: (r.title || '').split(' - ')[0],
        year: r.year || null,
        format: (r.format || []).slice(0, 3).join(', '),
        label: (r.label || [])[0] || null,
        catno: r.catno || null,
        country: r.country || null,
        thumb: r.cover_image || r.thumb || null,
        lowest_price: price,
        currency,
        copies_for_sale: forSale,
        buy: `https://www.discogs.com/sell/release/${r.id}`,
        listing: `https://www.discogs.com${r.uri || ''}`,
      };
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).json({
      artist, title: title || null,
      source: 'Discogs marketplace',
      note: 'Prices are the lowest currently listed on Discogs. Buying happens on Discogs, not here.',
      releases: priced.filter(r => r.lowest_price != null || r.copies_for_sale),
    });
  } catch (err) {
    return res.status(200).json({ error: String(err.message || err), releases: [] });
  }
}
