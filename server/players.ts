import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AgentSchema, type AppConfig, type Provider } from './config';
import type { PlayerProfile } from '../src/types';
import { Store } from './store';

const ProfileSchema = AgentSchema.extend({
  id: AgentSchema.shape.id.optional(),
  description: z.string().trim().max(1000).default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#86b2a0'),
  apiMode: z.enum(['provider', 'custom']).default('provider'),
  baseUrl: z.string().trim().max(1000).default(''),
  apiKey: z.string().trim().max(4096).optional(),
});

export function saveProfile(store: Store, config: AppConfig, input: unknown, existingId?: string) {
  const data = ProfileSchema.parse(input),
    previous = existingId ? store.player(existingId) : null;
  if (existingId && !previous) throw new Error('玩家不存在');
  if (existingId && data.id && data.id !== existingId) throw new Error('玩家 ID 创建后不能修改');
  const id = existingId ?? data.id ?? `player-${randomUUID()}`;
  if (!existingId && store.player(id)) throw new Error('玩家 ID 已存在');
  const { apiKey: suppliedKey, ...fields } = data;
  let providerId = data.provider,
    baseUrl = '',
    hasApiKey = false;
  let customProvider: Provider | undefined;
  if (data.apiMode === 'custom') {
    let url: URL;
    try {
      url = new URL(data.baseUrl);
    } catch {
      throw new Error('请填写有效的 API 基础地址');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('API 基础地址须为 http(s) 地址，不能包含鉴权信息、查询参数或片段');
    baseUrl = data.baseUrl.replace(/\/+$/, '');
    const key =
      suppliedKey ||
      (previous?.apiMode === 'custom' ? store.playerProvider(previous.provider)?.apiKey : '');
    if (!key || !data.model.trim()) throw new Error('自定义 API 需要密钥和模型名称');
    hasApiKey = true;
    // Immutable provider versions keep running and archived matches on their original API.
    providerId = `player-api-${randomUUID()}`;
    customProvider = {
      id: providerId,
      name: data.name,
      baseUrl,
      apiKey: key,
      models: [data.model],
    };
  } else if (data.kind === 'llm' || data.rsi !== 'off') {
    const provider = config.providers.find((p) => p.id === data.provider);
    if (!provider?.apiKey) throw new Error('所选 API 服务尚未配置密钥');
    if (!provider.models.includes(data.model)) throw new Error('模型不在所选服务的配置列表中');
  }
  const now = new Date().toISOString();
  const profile: PlayerProfile = {
    ...fields,
    id,
    provider: providerId,
    baseUrl,
    hasApiKey,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  store.transaction(() => {
    if (customProvider) store.savePlayerProvider(customProvider);
    store.savePlayer(profile);
  });
  return profile;
}
