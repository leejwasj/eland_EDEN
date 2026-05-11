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

  const prompt = `이 문서는 이랜드리테일 MD가 브랜드 키맨을 직접 만나고 작성한 EBG(External Brand Group) 미팅 보고서입니다.${brand ? ` 브랜드명: ${brand}` : ''}

EBG 보고서는 아래 구조로 작성됩니다:
- 목표: 브랜드의 핵심 목표
- <EBG 진행한 것>: 미팅 경위
- 핵심질문: MD가 키맨에게 던진 핵심 질문
- 번호별 섹션: 키맨 발언 인용 + "→ 액션 아이템"
- # 찾은 인사이트: ①②③ 형태의 핵심 인사이트 요약

문서 전체를 꼼꼼히 읽고 아래 JSON 형식으로만 응답하세요. 내용이 없는 항목은 null 또는 빈 배열로 처리하세요.

{
  "goal": "목표 한 줄",
  "ebgContext": "EBG 진행한 것 요약 (누구를 만났는지, 어떤 방식으로)",
  "keyQuestion": "핵심질문 전문",
  "sections": [
    {
      "title": "번호+섹션 제목 (예: 1. '26년에 핵심 상권에 2개 정도 오픈하려고')",
      "keyQuote": "키맨 주요 발언 요약 (1~2줄)",
      "actionItem": "→ 뒤에 나오는 액션 아이템 전문"
    }
  ],
  "insights": ["① 인사이트1", "② 인사이트2", "③ 인사이트3"],
  "storeConditions": {
    "area": "선호 평수 (예: 15평 이상)",
    "location": "선호 상권 유형 (예: 핵심 상권, 복합몰 1층)",
    "neighborBrands": ["함께 있어야 할 브랜드들"],
    "avoidConditions": "피해야 할 조건 (있으면)"
  },
  "preferredAreas": ["강남", "강서" 등 언급된 지역들],
  "expansionPlan": "출점 계획 요약 (예: 26년 2개 추가 오픈 계획)",
  "needs": ["니즈 태그 1", "니즈 태그 2", "니즈 태그 3"],
  "priceRange": "가격대 (언급된 경우만, 없으면 null)",
  "concerns": "브랜드 측 우려·조건 (있으면)"
}

JSON만 반환하세요. 마크다운 코드블록 없이 순수 JSON으로만 응답하세요.`;

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
        max_tokens: 2048,
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
    if (!jsonStr) return res.status(200).json({ goal: null, sections: [], insights: [], needs: [] });

    return res.status(200).json(JSON.parse(jsonStr));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
