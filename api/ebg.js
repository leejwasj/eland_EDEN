const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY 없음 — Vercel 환경변수를 확인하세요' });

  const { image, images, brand } = req.body || {};
  const imgList = Array.isArray(images) && images.length ? images : (image ? [image] : []);
  if (!imgList.length) return res.status(400).json({ error: 'image 또는 images 필드 필요' });
  if (imgList.length > 5) return res.status(400).json({ error: '최대 5장까지 업로드 가능합니다' });

  const imageBlocks = [];
  for (const img of imgList) {
    const m = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: '유효하지 않은 이미지 형식' });
    imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }

  const multiNote = imgList.length > 1
    ? `\n\n이번 EBG는 총 ${imgList.length}장의 자료로 구성되어 있습니다. 모든 페이지를 종합하여 하나의 통합 분석을 작성하세요.`
    : '';

  const prompt = `이 문서는 이랜드리테일 MD가 브랜드 키맨을 직접 만나고 작성한 EBG(External Brand Group) 미팅 보고서입니다.${brand ? ` 브랜드명: ${brand}` : ''}${multiNote}

EBG 보고서 구조:
- 목표: 브랜드의 핵심 목표
- <EBG 진행한 것>: 미팅 경위
- 핵심질문: MD가 키맨에게 던진 핵심 질문
- 번호별 섹션: 키맨 발언 인용 + "→ 액션 아이템"
- # 찾은 인사이트: ①②③ 형태의 핵심 인사이트

문서 전체를 읽고 아래 JSON 형식으로만 응답하세요. 없는 항목은 null 또는 빈 배열로 처리하세요.

특히 "summary" 필드는 이 EBG 미팅 전체를 MD 관점에서 3~5문장으로 요약한 핵심 줄거리를 적으세요. (브랜드 현황, 키맨의 핵심 메시지, MD에게 시사하는 바)

{
  "brandName": "문서에서 추출한 브랜드명 (예: DJI, 팝마트, 올리브영)",
  "summary": "EBG 미팅 종합 요약 3~5문장",
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
  "preferredAreas": ["강남", "강서"],
  "expansionPlan": "출점 계획 요약",
  "needs": ["니즈 태그1", "니즈 태그2", "니즈 태그3"],
  "priceRange": "가격대 또는 null",
  "concerns": "브랜드 측 우려사항 또는 null"
}

반드시 JSON만 반환하세요. 마크다운 코드블록(\`\`\`) 없이 순수 JSON으로만 응답하세요.`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: prompt }]
        }]
      })
    });
    clearTimeout(timer);

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || `Claude API 오류 (${r.status})` });
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
