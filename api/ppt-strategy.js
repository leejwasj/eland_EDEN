const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY 없음' });

  const { ebgAnalysis, brand, store, references = [] } = req.body || {};
  if (!ebgAnalysis) return res.status(400).json({ error: 'ebgAnalysis 필드 필요' });

  const refBlock = references.length ? `\n추가 레퍼런스 자료 분석 결과:\n${references.map((r, i) =>
    `[레퍼런스 ${i+1}] ${r.fileName || ''} (${r.documentType || '자료'})\n` +
    `핵심 인사이트: ${(r.keyInsights||[]).join(' / ')}\n` +
    `전략적 시사점: ${(r.strategicPoints||[]).join(' / ')}\n` +
    `주요 데이터: ${(r.dataHighlights||[]).join(' / ')}`
  ).join('\n\n')}` : '';

  const prompt = `다음은 ${brand || '브랜드'} 브랜드의 키맨 EBG(External Brand Group) 미팅 분석 결과입니다.
${store ? `분석 대상 점포: ${store}` : ''}${refBlock}

EBG 분석 데이터:
${JSON.stringify(ebgAnalysis, null, 2)}

이 EBG 인사이트를 바탕으로 이랜드리테일 MD가 브랜드 입점 전략을 수립할 수 있도록, 서로 다른 관점의 전략 3가지를 작성해주세요.
전략은 구체적이고 실행 가능해야 하며, EBG 데이터에서 실제로 언급된 내용에 근거해야 합니다.

아래 JSON 형식으로만 응답하세요:

{
  "strategies": [
    {
      "title": "전략 제목 (10자 이내, 임팩트 있게)",
      "insight": "이 전략의 핵심 인사이트 1줄 (EBG 키맨 발언 기반)",
      "actions": ["실행방안1 (구체적, 1~2줄)", "실행방안2", "실행방안3"],
      "expectedEffect": "기대 효과 1~2줄"
    },
    {
      "title": "전략 제목 2",
      "insight": "핵심 인사이트",
      "actions": ["실행방안1", "실행방안2", "실행방안3"],
      "expectedEffect": "기대 효과"
    },
    {
      "title": "전략 제목 3",
      "insight": "핵심 인사이트",
      "actions": ["실행방안1", "실행방안2", "실행방안3"],
      "expectedEffect": "기대 효과"
    }
  ]
}

반드시 JSON만 반환하세요. 마크다운 코드블록(\`\`\`) 없이 순수 JSON으로만 응답하세요.`;

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
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || `Claude API 오류 (${r.status})` });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ strategies: [] });
    return res.status(200).json(JSON.parse(jsonStr));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
