export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query 필드 필요' });

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    const r = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' }
    });
    if (!r.ok) return res.status(r.status).json({ error: `Google News RSS 오류 (${r.status})` });

    const xml = await r.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const block = match[1];
      const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                     block.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() || '';
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) ||
                    block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/))?.[1]?.trim() || '';
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
      const description = (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                           block.match(/<description>([\s\S]*?)<\/description>/))?.[1]
                           ?.replace(/<[^>]+>/g, '').trim() || '';
      const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || '';

      if (title) items.push({ title, link, pubDate, description, source });
    }

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
