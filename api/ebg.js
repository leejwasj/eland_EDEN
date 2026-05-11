export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY 없음' });

  const { image, brand } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image 필드 필요' });

  const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: '유효하지 않은 이미지 형식' });
  const [, mediaType, base64Data] = match;

  const prompt = `이 문서는 이랜드리테일 MD가 브랜드 키맨을 만난 후 작성한 EBG(External Brand Group) 미팅 보고서입니다.${brand ? ` 브랜드명: ${brand}` : ''}

문서를 꼼꼼히 읽고 아래 JSON 형식으로만 응답하세요. 문서에서 확인되지 않는 항목은 null로 처리하세요.

{
  "summary": "핵심 내용 2~3줄 요약 (한국어)",
  "needs": ["니즈 태그1", "니즈 태그2", "니즈 태그3"],
  "preferredConditions": ["선호 입점 조건1", "선호 조건2"],
  "storeType": "어울리는 점포 유형 (예: 강남권 프리미엄 상권, 수도권 대형 복합몰)",
  "expansionIntent": "오프라인 확장 의향 (높음/보통/낮음/미확인 중 하나)",
  "priceRange": "주요 가격대 (예: 5~15만원대)",
  "keywords": ["브랜드 특징 키워드1", "키워드2", "키워드3"],
  "concerns": "브랜드 측 우려사항이나 조건 (없으면 null)"
}

JSON 코드블록 없이 순수 JSON만 반환하세요.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.error?.message || 'Claude API 오류' });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ summary: text, needs: [], keywords: [] });

    return res.status(200).json(JSON.parse(jsonStr));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
