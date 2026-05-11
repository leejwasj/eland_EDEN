export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, date } = req.query;
  if (!code) return res.status(400).json({ error: 'code(행정동코드) 필요' });

  const key = process.env.SEOUL_API_KEY;
  if (!key) return res.status(503).json({ error: 'SEOUL_API_KEY 없음', noKey: true });

  // 7일 전 날짜 사용 (데이터 수집 지연 고려)
  let queryDate = date;
  if (!queryDate) {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    queryDate = d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  const url = `http://openapi.seoul.go.kr:8088/${key}/json/SpopDailySmallAreaTP/1/100/${queryDate}/${code}/`;

  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `Seoul API ${r.status}` });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
