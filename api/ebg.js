const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const GEMINI_MODEL = 'gemini-1.5-flash';

const EBG_PROMPT = (brand, multiNote) =>
  `이 문서는 이랜드리테일 MD가 브랜드 키맨을 직접 만나고 작성한 EBG(External Brand Group) 미팅 보고서입니다.${brand ? ` 브랜드명: ${brand}` : ''}${multiNote}

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

async function analyzeWithClaude(key, imageBlocks, prompt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: ctrl.signal,
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }]
    })
  });
  clearTimeout(timer);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API 오류 (${r.status})`);
  }
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

async function analyzeWithGemini(key, imgList, prompt) {
  const parts = [];
  for (const img of imgList) {
    const m = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error('유효하지 않은 이미지 형식');
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  parts.push({ text: prompt });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  clearTimeout(timer);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API 오류 (${r.status})`);
  }
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEM_API || process.env.GOOGLE_API_KEY;

  if (!anthropicKey && !geminiKey) {
    return res.status(503).json({
      error: 'API 키 없음 — Vercel 환경변수에 ANTHROPIC_API_KEY 또는 GEMINI_API_KEY를 설정하세요'
    });
  }

  const { image, images, brand } = req.body || {};
  const imgList = Array.isArray(images) && images.length ? images : (image ? [image] : []);
  if (!imgList.length) return res.status(400).json({ error: 'image 또는 images 필드 필요' });
  if (imgList.length > 5) return res.status(400).json({ error: '최대 5장까지 업로드 가능합니다' });

  const multiNote = imgList.length > 1
    ? `\n\n이번 EBG는 총 ${imgList.length}장의 자료로 구성되어 있습니다. 모든 페이지를 종합하여 하나의 통합 분석을 작성하세요.`
    : '';
  const prompt = EBG_PROMPT(brand, multiNote);

  try {
    let text;

    if (anthropicKey) {
      const imageBlocks = imgList.map(img => {
        const m = img.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!m) throw new Error('유효하지 않은 이미지 형식');
        return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
      });
      text = await analyzeWithClaude(anthropicKey, imageBlocks, prompt);
    } else {
      text = await analyzeWithGemini(geminiKey, imgList, prompt);
    }

    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ goal: null, sections: [], insights: [], needs: [] });
    return res.status(200).json(JSON.parse(jsonStr));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
