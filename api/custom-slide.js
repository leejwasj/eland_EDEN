const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY 없음' });

  const { title, prompt, brand, store, ebgContext, referenceSummary } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt 필드 필요' });

  const systemContext = [
    brand ? `브랜드: ${brand}` : '',
    store ? `분석 점포: ${store}` : '',
    ebgContext ? `EBG 핵심 인사이트: ${ebgContext}` : '',
    referenceSummary ? `레퍼런스 요약: ${referenceSummary}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `당신은 이랜드리테일 MD(머천다이저)를 위한 전략 슬라이드 작성 전문가입니다.
${systemContext ? `\n현재 분석 맥락:\n${systemContext}\n` : ''}
사용자의 프롬프트를 바탕으로 PPT 슬라이드 1장을 작성하세요.
내용은 구체적이고 실행 가능해야 하며, 리테일 MD 관점에서 유용해야 합니다.

아래 JSON 형식으로만 응답하세요:

{
  "slideTitle": "슬라이드 제목 (15자 이내)",
  "headline": "핵심 메시지 한 줄 (인상적으로, 20자 이내)",
  "sections": [
    {
      "title": "섹션 제목",
      "points": ["포인트1 (구체적, 1~2줄)", "포인트2", "포인트3"]
    },
    {
      "title": "섹션 제목2",
      "points": ["포인트1", "포인트2"]
    }
  ],
  "keyMetrics": [
    {"label": "지표명", "value": "수치 또는 내용"}
  ],
  "conclusion": "결론 또는 액션 아이템 한 줄"
}

sections는 2~3개, 각 section의 points는 2~4개로 구성하세요.
keyMetrics는 수치나 핵심 데이터가 있을 경우에만 포함하세요 (없으면 빈 배열).
반드시 JSON만 반환하세요. 마크다운 코드블록 없이 순수 JSON으로 응답하세요.`;

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
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `슬라이드 주제/제목: ${title || '커스텀 분석'}\n\n프롬프트/내용:\n${prompt}`
        }],
        system: systemPrompt
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
