export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY 없음 — Vercel 환경변수를 확인하세요' });

  const { image, brand } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image 필드 필요' });

  const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: '유효하지 않은 이미지 형식' });
  const [, mimeType, base64Data] = match;

  const prompt = `이 문서는 이랜드리테일 MD가 브랜드 키맨을 직접 만나고 작성한 EBG(External Brand Group) 미팅 보고서입니다.${brand ? ` 브랜드명: ${brand}` : ''}

EBG 보고서 구조:
- 목표: 브랜드의 핵심 목표
- <EBG 진행한 것>: 미팅 경위
- 핵심질문: MD가 키맨에게 던진 핵심 질문
- 번호별 섹션: 키맨 발언 인용 + "→ 액션 아이템"
- # 찾은 인사이트: ①②③ 형태의 핵심 인사이트

문서 전체를 읽고 아래 JSON 형식으로만 응답하세요. 없는 항목은 null 또는 빈 배열로 처리하세요.

{
  "goal": "목표 한 줄",
  "ebgContext": "EBG 진행한 것 요약",
  "keyQuestion": "핵심질문 전문",
  "sections": [
    {
      "title": "번호+섹션 제목",
      "keyQuote": "키맨 주요 발언 요약 1~2줄",
      "actionItem": "→ 뒤에 나오는 액션 아이템 전문"
    }
  ],
  "insights": ["① 인사이트1", "② 인사이트2", "③ 인사이트3"],
  "storeConditions": {
    "area": "선호 평수",
    "location": "선호 상권 유형",
    "neighborBrands": ["인근 선호 브랜드들"],
    "avoidConditions": "피해야 할 조건"
  },
  "preferredAreas": ["강남", "강서" 등 언급 지역],
  "expansionPlan": "출점 계획 요약",
  "needs": ["니즈 태그1", "니즈 태그2", "니즈 태그3"],
  "priceRange": "가격대 또는 null",
  "concerns": "브랜드 측 우려사항 또는 null"
}

반드시 JSON만 반환하세요. 마크다운 코드블록(\`\`\`) 없이 순수 JSON으로만 응답하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        }
      })
    });

    if (!r.ok) {
      const err = await r.json();
      const msg = err.error?.message || `Gemini API 오류 (${r.status})`;
      return res.status(r.status).json({ error: msg });
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ goal: null, sections: [], insights: [], needs: [] });

    return res.status(200).json(JSON.parse(jsonStr));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
