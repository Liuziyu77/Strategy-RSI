import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import type { Provider } from '../server/config';

export const experimentRoot = resolve('artifacts/multigame-20260916');
export const modelLabels = ['DeepSeek', 'GLM', 'Kimi', 'Qwen'];
export const expectedModels = [
  'bailian/deepseek-v4-flash',
  'glm-5.2',
  'kimi-k3',
  'qwen3.8-max-0902',
];
export function experimentProvider(): Provider {
  const path =
    process.env.EXPERIMENT_ENV ?? '/mnt/shared-storage-user/liuziyu/My_Projects/sanguosha/.env';
  const values = parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const field = 'api_key_env_yh';
  if (typeof values[field] !== 'string' || !values[field].trim())
    throw new Error('The requested api_key_env_yh field is missing.');
  if (JSON.stringify(values.models) !== JSON.stringify(expectedModels))
    throw new Error('The configured models differ from the fixed experiment plan.');
  const baseUrl = String(values.base_url ?? '').replace(/\/$/, '');
  if (!['http:', 'https:'].includes(new URL(baseUrl).protocol))
    throw new Error('Invalid endpoint.');
  return {
    id: 'experiment-yh',
    name: 'Experiment provider',
    baseUrl,
    apiKey: process.env[values[field]] || values[field],
    models: expectedModels,
  };
}
export function atomicJSON(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}
export function redact(error: unknown, provider: Provider) {
  return String(error instanceof Error ? error.message : error)
    .split(provider.apiKey)
    .join('[redacted]')
    .replace(/https?:\/\/\S+/g, '[endpoint]')
    .slice(0, 350);
}
export function sha256(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
export const gameTrace = new AsyncLocalStorage<string>();
export interface RequestRecord {
  job: string;
  model: string;
  at: string;
  status: number;
  latencyMs: number;
  queueMs: number;
  usage?: unknown;
  finishReason?: string;
  error?: string;
}
/** Bound real provider concurrency, retaining usage even for rejected model responses. */
export function instrumentProvider(provider: Provider, limit = 4) {
  const original = globalThis.fetch;
  const active = new Map<string, number>();
  const queues = new Map<string, (() => void)[]>();
  const records: RequestRecord[] = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== `${provider.baseUrl}/chat/completions`) return original(input, init);
    const model = JSON.parse(String(init?.body)).model as string;
    const queuedAt = Date.now();
    if ((active.get(model) ?? 0) >= limit) {
      await new Promise<void>((done) => {
        const queue = queues.get(model) ?? [];
        queue.push(done);
        queues.set(model, queue);
      });
    } else active.set(model, (active.get(model) ?? 0) + 1);
    const started = Date.now();
    const record: RequestRecord = {
      job: gameTrace.getStore() ?? 'unassigned',
      model,
      at: new Date().toISOString(),
      queueMs: started - queuedAt,
      latencyMs: 0,
      status: 0,
    };
    try {
      const response = await original(input, init);
      record.status = response.status;
      if (response.ok) {
        const body = (await response.clone().json()) as any;
        record.usage = body.usage;
        record.finishReason = body.choices?.[0]?.finish_reason;
      }
      return response;
    } catch (error) {
      record.error = redact(error, provider);
      throw error;
    } finally {
      record.latencyMs = Date.now() - started;
      records.push(record);
      const next = queues.get(model)?.shift();
      if (next) next();
      else active.set(model, (active.get(model) ?? 1) - 1);
    }
  };
  return {
    records,
    active,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
