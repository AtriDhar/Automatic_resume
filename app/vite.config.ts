import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  const exposeClientKey = mode === 'development' || env.EXPOSE_CLIENT_GEMINI_KEY === 'true';
    // Local dev has no /api/* functions (they live on Vercel/Netlify edge).
    // If DEV_API_PROXY is set (e.g. https://your-app.vercel.app), proxy the
    // API routes there so dev works WITHOUT exposing a client-side key.
    const devApiProxy = (env.DEV_API_PROXY || '').trim().replace(/\/$/, '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: devApiProxy
          ? {
              '/api': {
                target: devApiProxy,
                changeOrigin: true,
                secure: true,
              },
            }
          : undefined,
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(exposeClientKey ? geminiApiKey : ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(exposeClientKey ? geminiApiKey : '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
