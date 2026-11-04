import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from './http';
import { runStress } from './stress';
import { createMemoryStore } from './store';

describe('fifty players on one match', () => {
  const server = createServer(createApi(createMemoryStore()));
  let url = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it('keeps every concurrent bid and vote', async () => {
    const report = await runStress(url, 50);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.votesLanded).toBe(report.expectedVotes);
  }, 30_000);
});
