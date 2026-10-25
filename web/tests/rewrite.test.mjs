import test from 'node:test';
import assert from 'node:assert/strict';
import { localRewrite, validateRewrites, buildPrompt, makeBatches } from '../lib/rewrite.mjs';
import { handleRewrite } from '../lib/model-handler.mjs';

test('local editing reduces filler while preserving numbers, uncertainty and negation', () => {
  const source = '值得注意的是，A 为 81.2%，不支持 GPU。我们进行详细的分析，结果可能存在偏差。';
  assert.equal(localRewrite(source).text, 'A 为 81.2%，不支持 GPU。我们详细分析，结果可能存在偏差。');
  assert.equal(localRewrite('这不是速度问题，而是认证失败。').text, '这不是速度问题，而是认证失败。');
});
test('literal links and code are protected', () => {
  const source = '`进行详细的分析` https://example.org/进行详细的分析\n```\n值得注意的是，code\n```';
  assert.equal(localRewrite(source).text, source);
});
test('model validation rejects count, numeric, URL, code and blank changes', () => {
  const source = ['A=81.2% `python run.py --seed 42` https://example.org/v1'];
  assert.deepEqual(validateRewrites(source, source), source);
  for (const bad of [[], [''], ['A=81.3% `python run.py --seed 42` https://example.org/v1'], ['A=81.2% `python run.py --seed 41` https://example.org/v1'], ['A=81.2% `python run.py --seed 42` https://other.org/v1']]) assert.throws(() => validateRewrites(source, bad));
});
test('prompt respects scenario and intensity without inventing facts', () => {
  assert.match(buildPrompt('research', 'balanced'), /统计显著性/);
  assert.match(buildPrompt('mail'), /不增加承诺/);
  assert.throws(() => buildPrompt('invalid'));
});
test('batching retains sequence and obeys item and char limits', () => {
  const source = Array.from({ length: 140 }, (_, i) => `${i}`.padEnd(150, 'x'));
  const batches = makeBatches(source);
  assert.deepEqual(batches.flat().map(s => s.text), source);
  assert.ok(batches.every(b => b.length <= 50 && b.reduce((a,s) => a+s.text.length, 0) <= 6000));
});

const body = { apiKey: 'test-only-not-a-real-key', segments: ['值得注意的是，准确率为 81.2%。'], scenario: 'research', level: 'light' };
const request = (data = body, origin = 'https://example.com') => new Request('https://example.com/api/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) });
const upstream = segments => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ segments }) } }] }));
test('model relay sends only to fixed provider and returns validated text without key', async () => {
  let called = false;
  const result = await handleRewrite(request(), async (url, init) => {
    called = true; assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, `Bearer ${body.apiKey}`);
    const sent = JSON.parse(init.body); assert.equal(sent.model, 'deepseek-flash'); assert.equal(sent.response_format.type, 'json_object');
    return upstream(['准确率为 81.2%。']);
  });
  assert.ok(called); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  const output = await result.text(); assert.ok(!output.includes(body.apiKey)); assert.equal(JSON.parse(output).segments[0], '准确率为 81.2%。');
});
test('invalid requests never call provider', async () => {
  const forbiddenFetch = async () => { throw new Error('Provider should not be called'); };
  assert.equal((await handleRewrite(request(body, 'https://evil.test'), forbiddenFetch)).status, 403);
  assert.equal((await handleRewrite(request({ ...body, apiKey: '' }), forbiddenFetch)).status, 400);
  assert.equal((await handleRewrite(request({ ...body, scenario: '__proto__' }), forbiddenFetch)).status, 400);
  assert.equal((await handleRewrite(request({ ...body, segments: ['x'.repeat(9000)] }), forbiddenFetch)).status, 400);
  assert.equal((await handleRewrite(request({ ...body, segments: Array(51).fill('x') }), forbiddenFetch)).status, 400);
  assert.equal((await handleRewrite(request(null), forbiddenFetch)).status, 400);
  const huge = new Request('https://example.com/api/rewrite', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: 'x'.repeat(100001) });
  assert.equal((await handleRewrite(huge, forbiddenFetch)).status, 413);
});
test('auth, balance, throttling and truncated or malformed responses are explicit', async () => {
  for (const code of [401, 402, 429, 500]) {
    const r = await handleRewrite(request(), async () => new Response(body.apiKey, { status: code }));
    assert.ok(r.status >= 400); assert.ok(!(await r.text()).includes(body.apiKey));
  }
  const truncated = await handleRewrite(request(), async () => new Response(JSON.stringify({ choices: [{ finish_reason:'length' }] })));
  assert.equal(truncated.status, 502);
  const invalid = await handleRewrite(request(), async () => upstream(['准确率为 99%。']));
  assert.equal(invalid.status, 502);
});
