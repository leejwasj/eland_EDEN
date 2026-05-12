const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const GEMINI_MODEL = 'gemini-2.0-flash';

const DART_PROMPT = (brand) =>
  `이 문서는 DART(전자공시시스템)에 공시된 기업의 재무 관련 문서입니다.${brand ? ` 기업/브랜드명: ${brand}` : ''}

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

async function analyzeWithClaude(key, mimeType, base64Data, extraPages, prompt) {
  const imageContent = [
    { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
    ...extraPages.map(p => ({ type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } })),
    { type: 'text', text: prompt }
  ];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, messages: [{ role: 'user', content: imageContent }] })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API 오류 (${r.status})`);
  }
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

async function analyzeWithGemini(key, image, extraPages, prompt) {
  // 이미지 기반 분석 (스캔본 등)
  const parts = [];
  const allImgs = [image, ...extraPages.map(p => `data:${p.mimeType};base64,${p.data}`)];
  for (const img of allImgs) {
    const m = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error('유효하지 않은 이미지 형식');
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  parts.push({ text: prompt });
  return callGemini(key, parts);
}

async function analyzeWithGeminiText(key, text, prompt) {
  // 텍스트 기반 분석 (무료 티어 가능)
  const parts = [{ text: `${text}\n\n${prompt}` }];
  return callGemini(key, parts);
}

async function callGemini(key, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
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

  const { image, text: textInput, extraPages = [], brand } = req.body || {};
  if (!image && !textInput) return res.status(400).json({ error: 'image 또는 text 필드 필요' });

  const prompt = DART_PROMPT(brand);

  try {
    let result;
    if (textInput) {
      // PDF 텍스트 추출본 — 이미지 토큰 불필요, 무료 티어 사용 가능
      if (anthropicKey) {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: CLAUDE_MODEL, max_tokens: 1024,
            messages: [{ role: 'user', content: `${textInput}\n\n${prompt}` }]
          })
        });
        if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error?.message || `Claude API 오류 (${r.status})`); }
        const d = await r.json();
        result = d.content?.[0]?.text || '';
      } else {
        result = await analyzeWithGeminiText(geminiKey, textInput, prompt);
      }
    } else {
      // 이미지 파일 (스캔본)
      const match = image.match(/^data:([\w\/+]+);base64,(.+)$/);
      if (!match) return res.status(400).json({ error: '유효하지 않은 파일 형식' });
      const [, mimeType, base64Data] = match;
      if (anthropicKey) {
        result = await analyzeWithClaude(anthropicKey, mimeType, base64Data, extraPages, prompt);
      } else {
        result = await analyzeWithGemini(geminiKey, image, extraPages, prompt);
      }
    }

    const jsonStr = result.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ error: 'JSON 파싱 실패' });
    return res.status(200).json(JSON.parse(jsonStr));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
