import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where the dev server forwards /api to. Defaults to the local API; override
  // with VITE_API_PROXY_TARGET to point dev at a remote/staging backend.
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // The external-API markdown lives in the repo's docs/ folder (single
        // source of truth — same files GitHub renders). The in-app /api-docs
        // page imports them as ?raw, so docs and the app never diverge.
        '@docs': path.resolve(__dirname, '../docs'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Allow the dev server to read files outside the client root (client/),
      // specifically the sibling docs/ folder consumed via the @docs alias.
      fs: { allow: [path.resolve(__dirname, '..')] },
      // Proxy the API through the dev server so the browser only ever talks to
      // ONE origin (localhost:5173) in dev — exactly like prod, where the app
      // and API share an origin behind the ingress. This removes the whole
      // class of "works on k8s, breaks on localhost" bugs caused by split
      // origins: cookies ride along same-origin (no credentials gymnastics) and
      // CORS never enters the picture. Requires API_BASE to be relative in dev
      // (see client/src/config/urls.ts + .env).
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
