import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as dotenvParse } from 'dotenv';
import { parse as yamlParse } from 'yaml';
import { z } from 'zod';
import { HEROES } from '../src/cards';
import { validRoles } from '../src/roles';

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}
export interface AppConfig {
  providers: Provider[];
  dataDir: string;
  port: number;
  host: string;
  adminToken: string;
}
export function loadConfig(
  path = resolve('.env'),
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const yaml = /^\s*(?:base_url|models|api_key_env)\s*:/m.test(raw) ? (yamlParse(raw) ?? {}) : {};
  const vars = { ...dotenvParse(raw), ...env };
  const keyRef = String(yaml.api_key_env ?? '');
  const key = vars.API_KEY ?? vars.OPENAI_API_KEY ?? (vars[keyRef] || keyRef);
  const models = String(vars.API_MODELS ?? vars.OPENAI_MODEL ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const url = vars.API_BASE_URL ?? vars.OPENAI_BASE_URL ?? yaml.base_url ?? '';
  const providers: Provider[] = [];
  if (url)
    providers.push({
      id: 'default',
      name: '默认 API',
      baseUrl: String(url).replace(/\/$/, ''),
      apiKey: key ?? '',
      models: models.length ? models : Array.isArray(yaml.models) ? yaml.models.map(String) : [],
    });
  if (vars.PROVIDERS_JSON) {
    const extras = z
      .array(
        z.object({
          id: z.string().regex(/^[\w-]+$/),
          name: z.string(),
          baseUrl: z.url(),
          apiKeyEnv: z.string(),
          models: z.array(z.string()).min(1),
        }),
      )
      .parse(JSON.parse(vars.PROVIDERS_JSON));
    for (const p of extras)
      providers.push({
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl.replace(/\/$/, ''),
        apiKey: vars[p.apiKeyEnv] ?? '',
        models: p.models,
      });
  }
  if (new Set(providers.map((p) => p.id)).size !== providers.length)
    throw new Error('API provider id 重复');
  for (const p of providers) {
    const u = new URL(p.baseUrl);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('API URL 必须使用 http(s)');
  }
  return {
    providers,
    dataDir: resolve(vars.DATA_DIR ?? 'data'),
    port: Number(vars.PORT ?? 3930),
    host: vars.HOST ?? '127.0.0.1',
    adminToken: vars.ARENA_ADMIN_TOKEN ?? '',
  };
}
export const AgentSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(40),
  kind: z.enum(['llm', 'heuristic', 'external']).default('llm'),
  provider: z.string().default('default'),
  model: z.string().max(150).default(''),
  rsi: z.enum(['off', 'immediate', 'round', 'both']).default('off'),
  hero: z.string().refine((x) => HEROES.some((h) => h.name === x), '武将不在基础武将包中'),
});
export const MatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).default('群雄逐鹿'),
    agents: z.array(AgentSchema).min(2).max(8),
    games: z.number().int().min(1).max(100).default(1),
    concurrency: z.number().int().min(1).max(100).default(1),
    seed: z.number().int().min(0).max(2147483647).default(42),
    paceMs: z.number().int().min(0).max(10000).default(600),
    maxDecisions: z.number().int().min(20).max(10000).default(1800),
    apiTimeoutMs: z.number().int().min(1000).max(180000).default(45000),
    contextEvents: z.number().int().min(20).max(5000).default(300),
    chatEnabled: z.boolean().default(true),
    contextChatMessages: z.number().int().min(1).max(200).default(80),
    autoStart: z.boolean().default(true),
    rotateSeats: z.boolean().default(true),
    roleMode: z.enum(['random', 'fixed']).default('random'),
    roleAssignments: z.record(z.string(), z.enum(['主公', '忠臣', '反贼', '内奸'])).optional(),
  })
  .superRefine((m, ctx) => {
    if (m.concurrency > m.games)
      ctx.addIssue({ code: 'custom', message: '并行数量不能超过总局数', path: ['concurrency'] });
    if (new Set(m.agents.map((a) => a.id)).size !== m.agents.length)
      ctx.addIssue({ code: 'custom', message: '同一场比赛的 Agent ID 必须唯一', path: ['agents'] });
    if (m.roleMode === 'fixed' && !m.roleAssignments)
      ctx.addIssue({
        code: 'custom',
        message: '固定身份模式需要为每位玩家分配身份',
        path: ['roleAssignments'],
      });
    if (
      m.roleAssignments &&
      (Object.keys(m.roleAssignments).length !== m.agents.length ||
        m.agents.some((a) => !Object.hasOwn(m.roleAssignments!, a.id)) ||
        !validRoles(Object.values(m.roleAssignments), m.agents.length))
    )
      ctx.addIssue({
        code: 'custom',
        message: '身份必须覆盖全部参战玩家，且配比符合玩家人数',
        path: ['roleAssignments'],
      });
  });
export function publicProviders(config: AppConfig) {
  return config.providers.map(({ id, name, models, apiKey }) => ({
    id,
    name,
    models,
    configured: !!apiKey,
  }));
}
export function safeError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'API 请求已取消或超时';
  return String(error instanceof Error ? error.message : error)
    .replace(/(?:sk-|Bearer\s+)[a-zA-Z0-9_\-.]+/g, '[redacted]')
    .replace(/https?:\/\/\S+/g, '[endpoint]')
    .slice(0, 350);
}
