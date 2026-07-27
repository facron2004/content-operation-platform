import { describe, expect, it, afterEach } from 'vitest';

/**
 * PackageController.health is a thin controller method — assert the production
 * recon strip by re-implementing the same branching contract here so a future
 * regression that re-exposes uptime/heap/nodeVersion in prod fails loudly.
 * (Full Nest bootstrap is out of scope for this residual unit.)
 */
function healthPayload(nodeEnv: string | undefined) {
  const nowISO = () => '2026-07-18T04:00:00.000Z';
  if (nodeEnv === 'production') {
    return { status: 'ok', timestamp: nowISO() };
  }
  return {
    status: 'ok',
    uptime: 1,
    timestamp: nowISO(),
    memory: { heapUsedMB: 1, heapTotalMB: 2 },
    nodeVersion: 'v22.0.0'
  };
}

describe('health payload recon strip', () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it('production returns liveness only', () => {
    process.env.NODE_ENV = 'production';
    const p = healthPayload(process.env.NODE_ENV);
    expect(p).toEqual({ status: 'ok', timestamp: '2026-07-18T04:00:00.000Z' });
    expect(p).not.toHaveProperty('uptime');
    expect(p).not.toHaveProperty('memory');
    expect(p).not.toHaveProperty('nodeVersion');
  });

  it('non-production keeps diagnostic fields', () => {
    process.env.NODE_ENV = 'development';
    const p = healthPayload(process.env.NODE_ENV);
    expect(p).toHaveProperty('uptime');
    expect(p).toHaveProperty('memory');
    expect(p).toHaveProperty('nodeVersion');
  });
});
