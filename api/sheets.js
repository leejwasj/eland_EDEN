export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHEET_ID = '1wCIJhZgxv3B9oJ1S4pnDCJCcjHk5KPF4U_zlr1UUNvQ';
  // export?format=csv exports the first (active) sheet
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EDEN/1.0)',
        'Accept': 'text/csv,text/plain,*/*',
      },
      redirect: 'follow',
    });

    // Google redirects to login page (HTML) when sheet is private
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: 'Google Sheets export failed',
        status: resp.status,
        contentType,
      });
    }

    const csv = await resp.text();

    // Detect if we got an HTML login redirect instead of CSV
    if (csv.trim().startsWith('<!DOCTYPE') || csv.trim().startsWith('<html')) {
      return res.status(403).json({
        error: '시트가 비공개 상태입니다. Google Sheets를 "링크가 있는 사람 누구나 볼 수 있음"으로 공유해주세요.',
      });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900'); // 15min cache
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
