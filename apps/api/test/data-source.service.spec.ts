import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSourceService } from '../src/content/data-source.service';

const previousEnv = {
  CONTENT_DATA_SOURCE: process.env.CONTENT_DATA_SOURCE,
  EXTERNAL_API_BASE_URL: process.env.EXTERNAL_API_BASE_URL,
  EXTERNAL_PACKAGES_PATH: process.env.EXTERNAL_PACKAGES_PATH
};

describe('DataSourceService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.CONTENT_DATA_SOURCE = previousEnv.CONTENT_DATA_SOURCE;
    process.env.EXTERNAL_API_BASE_URL = previousEnv.EXTERNAL_API_BASE_URL;
    process.env.EXTERNAL_PACKAGES_PATH = previousEnv.EXTERNAL_PACKAGES_PATH;
  });

  it('rejects the old local-life source so runtime data stays on JeeSite', async () => {
    process.env.CONTENT_DATA_SOURCE = 'local-life';

    const client = { loadDataset: vi.fn() };
    const service = new DataSourceService(client as any);

    await expect(service.loadDataset()).rejects.toThrow(/Unsupported CONTENT_DATA_SOURCE/i);
    expect(client.loadDataset).not.toHaveBeenCalled();
  });

  it('coalesces concurrent loads and reuses the loaded dataset', async () => {
    const dataset = { packages: [], snapshots: [] };
    const client = { loadDataset: vi.fn().mockResolvedValue(dataset) };
    const service = new DataSourceService(client as any);

    const [first, second] = await Promise.all([
      service.loadDataset({ forceRefresh: true }),
      service.loadDataset()
    ]);

    expect(first).toBe(dataset);
    expect(second).toBe(dataset);
    expect(client.loadDataset).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached data so the next load uses the current external session', async () => {
    const firstDataset = { packages: [{ id: 'old' }], snapshots: [] };
    const secondDataset = { packages: [{ id: 'new' }], snapshots: [] };
    const client = {
      loadDataset: vi.fn().mockResolvedValueOnce(firstDataset).mockResolvedValueOnce(secondDataset)
    };
    const service = new DataSourceService(client as any);

    await expect(service.loadDataset()).resolves.toBe(firstDataset);
    service.invalidateCache();

    await expect(service.loadDataset()).resolves.toBe(secondDataset);
    expect(client.loadDataset).toHaveBeenCalledTimes(2);
  });

  it('does not let an invalidated in-flight result repopulate the cache', async () => {
    const firstDataset = { packages: [{ id: 'old' }], snapshots: [] };
    const secondDataset = { packages: [{ id: 'new' }], snapshots: [] };
    let resolveFirst!: (dataset: typeof firstDataset) => void;
    const firstLoad = new Promise<typeof firstDataset>((resolve) => {
      resolveFirst = resolve;
    });
    const client = {
      loadDataset: vi.fn().mockReturnValueOnce(firstLoad).mockResolvedValueOnce(secondDataset)
    };
    const service = new DataSourceService(client as any);

    const staleFlight = service.loadDataset();
    service.invalidateCache();
    const freshFlight = service.loadDataset();
    await expect(freshFlight).resolves.toBe(secondDataset);

    resolveFirst(firstDataset);
    await expect(staleFlight).resolves.toBe(firstDataset);
    await expect(service.loadDataset()).resolves.toBe(secondDataset);
    expect(client.loadDataset).toHaveBeenCalledTimes(2);
  });
});
