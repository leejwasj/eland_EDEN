const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY 없음' });

  const { image, extraPages = [], brand } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image 필드 필요' });

  const match = image.match(/^data:([\w\/+]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: '유효하지 않은 파일 형식' });
  const [, mimeType, base64Data] = match;

  const prompt = `이 문서는 DART(전자공시시스템)에 공시된 기업의 재무 관련 문서입니다.${brand ? ` 기업/브랜드명: ${brand}` : ''}

문서 전체를 읽고 아래 JSON 형식으로만 응답하세요. 없는 항목은 null로 처리하세요.

{
  "companyName": "회사명",
  "reportType": "사업보고서|반기보고서|분기보고서|기타",
  "period": "보고 기간 (예: 2024년 3분기)",
  "revenue": "매출액 (예: 1,234억원)",
  "operatingProfit": "영업이익",
  "netIncome": "당기순이익",
  "debtRatio": "부채비율 (예: 123%)",
  "businessSummary": "주요 사업 내용 2~3줄 요약",
  "majorRisks": ["주요 리스크1", "주요 리스크2"],
  "growthHighlights": ["성장 포인트1", "성장 포인트2"]
}

반드시 JSON만 반환하세요. 마크다운 코드블록(\`\`\`) 없이 순수 JSON으로만 응답하세요.`;

  const imageContent = [
    { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
    ...extraPages.map(p => ({ type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } })),
    { type: 'text', text: prompt }
  ];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: imageContent }]
      })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || `Claude API 오류 (${r.status})` });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ error: 'JSON 파싱 실패' });
    return res.status(200).json(JSON.parse(jsonStr));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
