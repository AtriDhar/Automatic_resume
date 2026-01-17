import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  const exposeClientKey = mode === 'development' || env.EXPOSE_CLIENT_GEMINI_KEY === 'true';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
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
