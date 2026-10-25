import { buildPrompt, SCENARIOS, validateRewrites } from './rewrite.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handleRewrite(request, fetcher = fetch) {
  if (request.method !== 'POST') return json({ error: '请使用 POST 请求。' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '不允许跨站请求。' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: '请求格式应为 JSON。' }, 415);
  // A streamed byte limit prevents oversized bodies even without Content-Length.
  let size = 0, body = '';
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: '请求内容为空。' }, 400);
    const decoder = new TextDecoder();
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 100000) { await reader.cancel(); return json({ error: '单次请求过大。' }, 413); } body += decoder.decode(value, { stream: true }); }
    body += decoder.decode();
  } catch { return json({ error: '无法读取请求。' }, 400); }
  let data;
  try { data = JSON.parse(body); } catch { return json({ error: '请求 JSON 无效。' }, 400); }
  if (!data || typeof data !== 'object') return json({ error: '请求参数无效。' }, 400);
  const { segments, apiKey, scenario, level } = data;
  if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 300 || /[\r\n]/.test(apiKey)) return json({ error: '请填写有效的 DeepSeek API Key。' }, 400);
  if (!Object.hasOwn(SCENARIOS, scenario) || !['light', 'balanced'].includes(level) || !Array.isArray(segments) || !segments.length || segments.length > 50 || segments.some(s => typeof s !== 'string' || !s.trim() || s.length > 6000) || segments.reduce((a,s) => a + s.length, 0) > 8000) return json({ error: '文本片段或改写选项无效。' }, 400);
  try {
    const timeout = AbortSignal.timeout(90000);
    const response = await fetcher('https://api.deepseek.com/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([request.signal, timeout]),
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-flash', messages: [ { role: 'system', content: buildPrompt(scenario, level) }, { role: 'user', content: JSON.stringify({ segments }) } ], thinking: { type: 'disabled' }, max_tokens: 16000, response_format: { type: 'json_object' }, stream: false }),
    });
    if (!response.ok) {
      const message = response.status === 401 ? '密钥无效或已过期，请检查 DeepSeek API Key。' : response.status === 402 ? '模型账户余额不足，请前往 DeepSeek 平台检查。' : response.status === 429 ? '模型请求过于频繁，请稍后重试。' : '模型服务暂时不可用，请稍后重试。';
      // Never relay upstream bodies, which may include request or account data.
      return json({ error: message }, response.status === 401 ? 401 : response.status === 429 ? 429 : 502);
    }
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    if (choice?.finish_reason !== 'stop') return json({ error: '模型未完整输出，已停止导出。请缩短内容后重试。' }, 502);
    let result;
    try { result = JSON.parse(choice.message.content); } catch { return json({ error: '模型返回格式异常，请重试。' }, 502); }
    const rewritten = validateRewrites(segments, result?.segments);
    return json({ segments: rewritten });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return json({ error: '请求已取消或超时，请缩短内容后重试。' }, 504);
    if (error instanceof Error && /模型/.test(error.message)) return json({ error: error.message }, 502);
    return json({ error: '无法连接模型服务，请稍后重试。' }, 502);
  }
}
