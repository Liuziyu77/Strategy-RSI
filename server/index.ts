import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { ViteDevServer } from 'vite';
import { loadConfig } from './config';
import { Store } from './store';
import { Arena } from './arena';
import { createApp } from './app';

const config = loadConfig(),
  arena = new Arena(new Store(config.dataDir), config),
  app = createApp(arena);
const production = process.env.NODE_ENV === 'production';
if (production) {
  app.get('/*', serveStatic({ root: './dist' }));
  app.get('/*', serveStatic({ path: './dist/index.html' }));
}
const api = getRequestListener(app.fetch);
let vite: ViteDevServer | null = null;
const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) api(req, res);
  else if (vite) vite.middlewares(req, res, () => api(req, res));
  else api(req, res);
});
if (!production) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
}
server.listen(config.port, config.host, () =>
  console.log(`Strategy-RSI · http://${config.host}:${config.port}`),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  server.closeAllConnections();
  await vite?.close();
  await arena.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
