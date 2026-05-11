export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, lat, lng, radius = 1000, size = 15, mode, x, y } = req.query;

  const apiKey = process.env.KAKAO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'KAKAO_API_KEY 환경변수가 설정되지 않았습니다.' });

  // coord2regioncode mode
  if (mode === 'region') {
    const coordX = x || lng;
    const coordY = y || lat;
    if (!coordX || !coordY) return res.status(400).json({ error: 'x, y (또는 lat, lng) 필요' });
    const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${coordX}&y=${coordY}`;
    try {
      const response = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Default: keyword search
  if (!q || !lat || !lng) return res.status(400).json({ error: 'q, lat, lng 파라미터가 필요합니다.' });

  const clampedSize = Math.min(Math.max(parseInt(size) || 15, 1), 45);
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&y=${lat}&x=${lng}&radius=${radius}&size=${clampedSize}&sort=distance`;

  try {
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
