const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { query, brand } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query 필드 필요' });

  // 1. Google News RSS 수집
  let rawItems = [];
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    const rssCtrl = new AbortController();
    const rssTimer = setTimeout(() => rssCtrl.abort(), 5000);
    const r = await fetch(rssUrl, { signal: rssCtrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' } });
    clearTimeout(rssTimer);
    if (r.ok) {
      const xml = await r.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && rawItems.length < 15) {
        const block = match[1];
        const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                       block.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() || '';
        const link = (block.match(/<link>([\s\S]*?)<\/link>/) ||
                      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/))?.[1]?.trim() || '';
        const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
        const description = (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                             block.match(/<description>([\s\S]*?)<\/description>/))?.[1]
                             ?.replace(/<[^>]+>/g, '').trim() || '';
        const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || '';
        if (title) rawItems.push({ title, link, pubDate, description, source });
      }
    }
  } catch (_) {}

  if (!rawItems.length) return res.status(200).json({ items: [] });

  // 2. ANTHROPIC_API_KEY 없으면 원본 반환
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ items: rawItems.slice(0, 6) });

  // 3. Claude로 전략적 유의미 기사 선별 및 요약
  const prompt = `당신은 이랜드리테일의 MD(머천다이저)를 돕는 전략 분석가입니다.
브랜드명: ${brand || query}

다음은 이 브랜드와 관련된 최근 뉴스 기사 목록입니다:

${rawItems.map((n, i) => `[${i + 1}] 제목: ${n.title.replace(/<[^>]+>/g, '')}
    날짜: ${n.pubDate}
    요약: ${(n.description || '').slice(0, 150)}`).join('\n\n')}

위 기사들 중에서 이랜드리테일 MD가 브랜드 입점 전략을 수립할 때 전략적으로 유의미한 기사를 최대 4개 선별하세요.

선별 기준:
- 브랜드의 사업 방향, 확장 계획, 오프라인 전략에 관한 기사 우선
- 브랜드 실적, 소비자 반응, 트렌드 변화를 보여주는 기사 우선
- 단순 이벤트·행사·광고성 기사 제외
- 리테일 MD 입장에서 의사결정에 도움이 되는 기사 선별

반드시 아래 JSON 형식으로만 응답하세요:

{
  "items": [
    {
      "index": 1,
      "title": "기사 제목 (원문 그대로)",
      "summary": "MD 관점에서 핵심 내용 1~2문장 요약",
      "insight": "이 기사가 입점 전략에 주는 시사점 1문장",
      "pubDate": "날짜",
      "link": "링크"
    }
  ]
}

반드시 JSON만 반환하세요. 마크다운 코드블록 없이 순수 JSON으로 응답하세요.`;

  try {
    const claudeCtrl = new AbortController();
    const claudeTimer = setTimeout(() => claudeCtrl.abort(), 8000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: claudeCtrl.signal,
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    clearTimeout(claudeTimer);

    if (!r.ok) return res.status(200).json({ items: rawItems.slice(0, 6) });

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return res.status(200).json({ items: rawItems.slice(0, 6) });

    const parsed = JSON.parse(jsonStr);
    const curated = (parsed.items || []).map(item => {
      const original = rawItems[item.index - 1] || {};
      return {
        title: item.title || original.title || '',
        summary: item.summary || '',
        insight: item.insight || '',
        pubDate: item.pubDate || original.pubDate || '',
        link: item.link || original.link || '',
        source: original.source || ''
      };
    });

    return res.status(200).json({ items: curated });
  } catch (_) {
    return res.status(200).json({ items: rawItems.slice(0, 6) });
  }
}
