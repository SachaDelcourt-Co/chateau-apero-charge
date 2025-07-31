/// <reference types="vitest" />
/// <reference types="vite/client" />

import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import fs from 'fs';
import path from "path"

// Enhanced security headers plugin with comprehensive CORS and security policies
const securityHeadersPlugin = () => {
  return {
    name: 'enhanced-security-headers',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const isProduction = process.env.NODE_ENV === 'production';
        const origin = req.headers.origin;
        const userAgent = req.headers['user-agent'] || '';
        const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Enhanced Security Headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-Request-ID', requestId);
        res.setHeader('X-Powered-By', ''); // Remove server fingerprinting
        
        // Enhanced Permissions Policy
        const permissionsPolicy = [
          'geolocation=()',
          'microphone=()',
          'camera=()',
          'payment=()',
          'usb=()',
          'magnetometer=()',
          'gyroscope=()',
          'accelerometer=()',
          'ambient-light-sensor=()',
          'autoplay=()',
          'encrypted-media=()',
          'fullscreen=(self)',
          'picture-in-picture=()',
        ].join(', ');
        res.setHeader('Permissions-Policy', permissionsPolicy);
        
        // Enhanced Content Security Policy
        const cspDirectives = [
          "default-src 'self'",
          isProduction 
            ? "script-src 'self' 'sha256-YOUR_SCRIPT_HASH_HERE'" 
            : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: https: blob:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
          "font-src 'self' https://fonts.gstatic.com",
          "object-src 'none'",
          "media-src 'self'",
          "frame-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "upgrade-insecure-requests",
        ];
        
        if (isProduction) {
          cspDirectives.push("block-all-mixed-content");
        }
        
        res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
        
        // HSTS for secure connections
        if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
          res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }
        
        // Enhanced CORS Configuration
        const allowedOrigins = [
          // Development origins
          'https://localhost:3000',
          'http://localhost:3000',
          'https://127.0.0.1:3000',
          'http://127.0.0.1:3000',
          'https://localhost:5173',
          'http://localhost:5173',
        ];
        
        // Add production origins from environment
        const prodOrigins = process.env.VITE_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
        allowedOrigins.push(...prodOrigins);
        
        // CORS Origin Validation
        let corsAllowed = false;
        if (!origin) {
          // Allow same-origin requests (no origin header)
          corsAllowed = true;
        } else if (allowedOrigins.includes(origin)) {
          corsAllowed = true;
          res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
          // Log suspicious CORS attempts
          console.warn(`[SECURITY] Blocked CORS request from unauthorized origin: ${origin} (User-Agent: ${userAgent})`);
          corsAllowed = false;
        }
        
        if (corsAllowed && origin) {
          // Enhanced CORS headers
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
          res.setHeader('Access-Control-Allow-Headers', [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-API-Key',
            'X-Request-ID',
            'X-CSRF-Token',
            'Cache-Control',
            'Pragma',
          ].join(', '));
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
          res.setHeader('Access-Control-Expose-Headers', [
            'X-Request-ID',
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
          ].join(', '));
        }
        
        // Enhanced preflight handling
        if (req.method === 'OPTIONS') {
          if (!corsAllowed) {
            res.statusCode = 403;
            res.end('CORS policy violation');
            return;
          }
          
          // Validate preflight request headers
          const requestedHeaders = req.headers['access-control-request-headers'];
          const requestedMethod = req.headers['access-control-request-method'];
          
          const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];
          const allowedHeaders = [
            'content-type',
            'authorization',
            'x-requested-with',
            'x-api-key',
            'x-request-id',
            'x-csrf-token',
            'cache-control',
            'pragma',
          ];
          
          if (requestedMethod && !allowedMethods.includes(requestedMethod.toUpperCase())) {
            console.warn(`[SECURITY] Blocked preflight request with unauthorized method: ${requestedMethod}`);
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }
          
          if (requestedHeaders) {
            const headers = requestedHeaders.toLowerCase().split(',').map(h => h.trim());
            const unauthorizedHeaders = headers.filter(h => !allowedHeaders.includes(h));
            
            if (unauthorizedHeaders.length > 0) {
              console.warn(`[SECURITY] Blocked preflight request with unauthorized headers: ${unauthorizedHeaders.join(', ')}`);
              res.statusCode = 400;
              res.end('Unauthorized headers');
              return;
            }
          }
          
          res.statusCode = 204;
          res.end();
          return;
        }
        
        // Block requests from unauthorized origins for non-preflight requests
        if (origin && !corsAllowed) {
          res.statusCode = 403;
          res.end('CORS policy violation');
          return;
        }
        
        // Rate limiting headers for monitoring
        res.setHeader('X-Security-Policy', 'enforced');
        
        next();
      });
    }
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL;
  
  // Validate required environment variables
  if (!supabaseUrl) {
    throw new Error('Missing required environment variable: VITE_SUPABASE_URL must be defined in vite.config.ts');
  }

  const isProduction = mode === 'production';

  return {
    plugins: [
      react(),
      securityHeadersPlugin()
    ],
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
      // Enhanced CORS security settings
      cors: {
        origin: [
          'https://localhost:3000',
          'http://localhost:3000',
          'https://127.0.0.1:3000',
          'http://127.0.0.1:3000',
          'https://localhost:5173',
          'http://localhost:5173',
          ...(process.env.VITE_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [])
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'X-API-Key',
          'X-Request-ID',
          'X-CSRF-Token',
          'Cache-Control',
          'Pragma',
        ],
      },
      // Enhanced secure proxy configuration
      proxy: {
        '/api/process-bar-order': {
          target: `${supabaseUrl}/functions/v1/process-bar-order`,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => '',
          timeout: 30000,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              console.error(`[PROXY ERROR] process-bar-order: ${err.message}`);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy error', code: 'PROXY_ERROR' }));
              }
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // Add security headers to proxied requests
              proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress || 'unknown');
              proxyReq.setHeader('X-Request-ID', req.headers['x-request-id'] || `req_${Date.now()}`);
              proxyReq.setHeader('User-Agent', 'Vite-Proxy/1.0');
              console.log(`[PROXY] process-bar-order: ${req.method} ${req.url}`);
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              // Add security headers to responses
              res.setHeader('X-Proxy-Cache', 'MISS');
              res.setHeader('X-Content-Type-Options', 'nosniff');
            });
          }
        },
        '/api/process-standard-recharge': {
          target: `${supabaseUrl}/functions/v1/process-standard-recharge`,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => '',
          timeout: 30000,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              console.error(`[PROXY ERROR] process-standard-recharge: ${err.message}`);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy error', code: 'PROXY_ERROR' }));
              }
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress || 'unknown');
              proxyReq.setHeader('X-Request-ID', req.headers['x-request-id'] || `req_${Date.now()}`);
              proxyReq.setHeader('User-Agent', 'Vite-Proxy/1.0');
              console.log(`[PROXY] process-standard-recharge: ${req.method} ${req.url}`);
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              res.setHeader('X-Proxy-Cache', 'MISS');
              res.setHeader('X-Content-Type-Options', 'nosniff');
            });
          }
        },
        '/api/create-stripe-checkout': {
          target: `${supabaseUrl}/functions/v1/create-stripe-checkout`,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => '',
          timeout: 45000, // Longer timeout for payment processing
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              console.error(`[PROXY ERROR] create-stripe-checkout: ${err.message}`);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payment service unavailable', code: 'PAYMENT_ERROR' }));
              }
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress || 'unknown');
              proxyReq.setHeader('X-Request-ID', req.headers['x-request-id'] || `req_${Date.now()}`);
              proxyReq.setHeader('User-Agent', 'Vite-Proxy/1.0');
              console.log(`[PROXY] create-stripe-checkout: ${req.method} ${req.url}`);
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              res.setHeader('X-Proxy-Cache', 'MISS');
              res.setHeader('X-Content-Type-Options', 'nosniff');
            });
          }
        },
        '/api/stripe-webhook': {
          target: `${supabaseUrl}/functions/v1/stripe-webhook`,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => '',
          timeout: 30000,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              console.error(`[PROXY ERROR] stripe-webhook: ${err.message}`);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Webhook processing failed', code: 'WEBHOOK_ERROR' }));
              }
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // Preserve original headers for webhook signature validation
              proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress || 'unknown');
              proxyReq.setHeader('X-Request-ID', req.headers['x-request-id'] || `req_${Date.now()}`);
              console.log(`[PROXY] stripe-webhook: ${req.method} ${req.url}`);
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              res.setHeader('X-Proxy-Cache', 'MISS');
              res.setHeader('X-Content-Type-Options', 'nosniff');
            });
          }
        },
        '/api/monitoring': {
          target: `${supabaseUrl}/functions/v1/monitoring`,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => '',
          timeout: 15000,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              console.error(`[PROXY ERROR] monitoring: ${err.message}`);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Monitoring service unavailable', code: 'MONITORING_ERROR' }));
              }
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress || 'unknown');
              proxyReq.setHeader('X-Request-ID', req.headers['x-request-id'] || `req_${Date.now()}`);
              proxyReq.setHeader('User-Agent', 'Vite-Proxy/1.0');
              console.log(`[PROXY] monitoring: ${req.method} ${req.url}`);
            });
          }
        },
        '/api/monitoring-api': {
          target: `${supabaseUrl}/functions/v1/monitoring-api`,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => '',
          timeout: 15000,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              console.error(`[PROXY ERROR] monitoring-api: ${err.message}`);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Monitoring API unavailable', code: 'MONITORING_API_ERROR' }));
              }
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress || 'unknown');
              proxyReq.setHeader('X-Request-ID', req.headers['x-request-id'] || `req_${Date.now()}`);
              proxyReq.setHeader('User-Agent', 'Vite-Proxy/1.0');
              console.log(`[PROXY] monitoring-api: ${req.method} ${req.url}`);
            });
          }
        }
      }
    },
    // Build optimizations with security considerations
    build: {
      // Enable source maps only in development
      sourcemap: !isProduction,
      // Minify in production
      minify: isProduction ? 'esbuild' : false,
      // Security: Don't expose internal paths
      rollupOptions: {
        output: {
          // Obfuscate chunk names in production
          chunkFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          entryFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          assetFileNames: isProduction ? 'assets/[hash].[ext]' : 'assets/[name]-[hash].[ext]',
        }
      },
      // Security: Remove console logs in production
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
        }
      } : undefined,
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
  };
});