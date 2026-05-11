const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY 없음' });

  const { image, text, fileName, brand } = req.body || {};
  if (!image && !text) return res.status(400).json({ error: 'image 또는 text 필드 필요' });

  const prompt = `이 문서는 "${brand || '브랜드'}" 관련 전략 레퍼런스 자료입니다.
파일: ${fileName || '업로드 파일'}

이 자료를 이랜드리테일 MD(머천다이저)의 브랜드 입점 전략 수립 관점에서 분석하세요.
문서에 실제로 존재하는 정보만 추출하고, 없는 정보는 null 또는 빈 배열로 처리하세요.

아래 JSON 형식으로만 응답하세요:

{
  "documentType": "문서 유형 (컨설팅 보고서 / 시장조사 / 경쟁사 분석 / 브랜드 현황 / 트렌드 리포트 / 매장 분석 / 기타)",
  "keyInsights": ["핵심 인사이트1 (구체적 수치 포함 가능)", "인사이트2", "인사이트3"],
  "strategicPoints": ["MD 입점 전략에 활용할 시사점1", "시사점2"],
  "dataHighlights": ["주요 수치·데이터1", "데이터2"],
  "opportunityFactors": ["기회 요인1", "기회 요인2"],
  "riskFactors": ["리스크·주의점1"]
}

반드시 JSON만 반환하세요. 마크다운 코드블록 없이 순수 JSON으로 응답하세요.`;

  let messageContent;
  if (text) {
    messageContent = [{ type: 'text', text: `${prompt}\n\n문서 내용:\n${text.slice(0, 8000)}` }];
  } else {
    const match = image.match(/^data:([\w\/+]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: '유효하지 않은 파일 형식' });
    const [, mimeType, base64Data] = match;
    messageContent = [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
      { type: 'text', text: prompt }
    ];
  }

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
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || `Claude API 오류 (${r.status})` });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ error: 'JSON 파싱 실패', keyInsights: [], strategicPoints: [] });
    return res.status(200).json({ fileName, ...JSON.parse(jsonStr) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
