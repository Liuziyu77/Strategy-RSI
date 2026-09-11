import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { callModel, ModelOutputError } from '../../server/agents';
const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
});
async function provider(handler: (body: any, count: number) => { status?: number; body: unknown }) {
  const requests: any[] = [];
  const s = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    requests.push(request);
    const result = handler(request, requests.length);
    res
      .writeHead(result.status ?? 200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(result.body));
  });
  servers.push(s);
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  return {
    config: {
      id: 'default',
      name: 'Test',
      baseUrl: `http://127.0.0.1:${(s.address() as any).port}/v1`,
      apiKey: 'test',
      models: ['model'],
    },
    requests,
  };
}
const messages = [
  { role: 'system', content: 'Return JSON.' },
  { role: 'user', content: 'test' },
];
it('推理模型使用足够的输出预算、JSON约束和低推理开销', async () => {
  const p = await provider(() => ({
    body: {
      choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
      usage: { completion_tokens: 1800 },
    },
  }));
  const output = await callModel(p.config, 'model', messages, 1000);
  expect(output.content).toEqual({ ok: true });
  expect(p.requests[0].max_tokens).toBe(4096);
  expect(p.requests[0].response_format).toEqual({ type: 'json_object' });
  expect(p.requests[0].reasoning_effort).toBe('low');
});
it('即便可解析部分JSON，length结束也不能冒充完整输出，并保留诊断信息', async () => {
  const p = await provider(() => ({
    body: {
      choices: [{ finish_reason: 'length', message: { content: '{"ok":true}' } }],
      usage: { completion_tokens: 4096 },
    },
  }));
  try {
    await callModel(p.config, 'model', messages, 1000);
    throw new Error('unexpected success');
  } catch (error) {
    expect(error).toBeInstanceOf(ModelOutputError);
    const e = error as ModelOutputError;
    expect(e.output.finishReason).toBe('length');
    expect(e.output.raw).toContain('ok');
    expect(e.output.usage).toEqual({ completion_tokens: 4096 });
  }
});
it('不支持JSON模式的兼容服务可回退到普通Chat Completions参数', async () => {
  const p = await provider((body) =>
    body.response_format
      ? { status: 400, body: { error: 'unsupported response_format' } }
      : { body: { choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] } },
  );
  const output = await callModel(p.config, 'model', messages, 1000);
  expect(output.content).toEqual({ ok: true });
  expect(output.jsonMode).toBe(false);
  expect(p.requests).toHaveLength(2);
  expect(p.requests[1].response_format).toBeUndefined();
});
