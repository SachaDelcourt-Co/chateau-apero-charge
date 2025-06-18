/// <reference types="vitest" />
/// <reference types="vite/client" />

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import fs from 'fs';
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    https: {
      key: fs.readFileSync('./localhost-key.pem'),
      cert: fs.readFileSync('./localhost.pem'),
    },
    host: 'localhost', // important : ne pas mettre 0.0.0.0 ici
    port: 3000,
    proxy: {
      '/api/process-bar-order': {
        target: 'https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1/process-bar-order',
        changeOrigin: true,
        rewrite: (path) => '',
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying request to:', req.url);
          });
        }
      },
      '/api/process-standard-recharge': {
        target: 'https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1/process-standard-recharge',
        changeOrigin: true,
        rewrite: (path) => '',
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying standard recharge request to:', req.url);
          });
        }
      },
      '/api/create-stripe-checkout': {
        target: 'https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1/create-stripe-checkout',
        changeOrigin: true,
        rewrite: (path) => '',
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying create-stripe-checkout request to:', req.url);
          });
        }
      },
      '/api/stripe-webhook': {
        target: 'https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1/stripe-webhook',
        changeOrigin: true,
        rewrite: (path) => '',
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying stripe-webhook request to:', req.url);
          });
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 60000,
    include: ['**/__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    deps: {
      optimizer: {
        web: {
          include: [
            '@radix-ui/**',
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
          ]
        }
      }
    },
    css: false,
  },
});
