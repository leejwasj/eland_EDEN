export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lng, radius = 1000, pageNo = 1, numOfRows = 1000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat, lng 필요' });

  const key = process.env.SOHO_API_KEY;
  if (!key) return res.status(500).json({ error: 'SOHO_API_KEY 환경변수 없음' });

  const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius` +
    `?serviceKey=${key}&pageNo=${pageNo}&numOfRows=${numOfRows}` +
    `&radius=${radius}&cx=${lng}&cy=${lat}&type=json`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    // Detect XML error response
    if (text.trim().startsWith('<')) {
      return res.status(502).json({ error: 'API XML 오류 응답', raw: text.slice(0, 300) });
    }

    let data;
    try { data = JSON.parse(text); } catch(e) {
      return res.status(502).json({ error: 'JSON 파싱 실패', raw: text.slice(0, 300) });
    }

    if (!r.ok) return res.status(r.status).json({ error: data });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
