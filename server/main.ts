import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { createApi } from './http';
import { createFileStore, createMemoryStore, type Store } from './store';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

export async function openStore(): Promise<Store> {
  const kind = process.env.STORE ?? (process.env.NODE_ENV === 'production' ? 'firestore' : 'file');
  if (kind === 'memory') return createMemoryStore();
  if (kind === 'file') return createFileStore(process.env.DATA_FILE ?? join(process.cwd(), 'data', 'session.json'));
  if (kind === 'firestore') {
    const { createFirestoreStore } = await import('./firestore');
    return createFirestoreStore();
  }
  throw new Error(`STORE must be memory, file, or firestore. Received ${kind}.`);
}

export function start(store: Store, port: number): Promise<{ url: string; close: () => Promise<void> }> {
  const api = createApi(store);
  const root = join(process.cwd(), 'dist');
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path.startsWith('/api')) {
      api(req, res);
      return;
    }
    void serveStatic(root, req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      const address = server.address();
      const bound = typeof address === 'object' && address ? address.port : port;
      resolve({
        url: `http://127.0.0.1:${bound}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const requested = safeFile(root, url.pathname);
  const file = requested && (await isFile(requested)) ? requested : safeFile(root, '/index.html');
  if (!file || !(await isFile(file))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Caníbal API is running. Build the frontend with npm run build to serve it here.');
    return;
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

function safeFile(root: string, pathname: string): string | null {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = normalize(join(root, decoded));
  const base = normalize(root + sep);
  if (file !== normalize(root) && !file.startsWith(base)) return null;
  return file;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

const invoked = process.argv[1]?.replaceAll('\\', '/').endsWith('server/main.ts');
if (invoked) {
  const port = Number(process.env.PORT ?? 8080);
  const store = await openStore();
  const running = await start(store, port);
  console.log(`Caníbal listening on ${running.url} (store: ${store.kind})`);
}
