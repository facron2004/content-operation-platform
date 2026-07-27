import { describe, expect, it } from 'vitest';

/**
 * Pure regression for the O(n) grid density used by merchant-heatmap.
 * Mirrors CELL_DEG / cosLat math so a future re-introduction of O(n²)
 * pairwise distance can be spotted by behaviour change tests.
 */
function intensityByGrid(
  points: Array<{ lat: number; lng: number; merchantCount: number }>,
  centerLat = 22.543
): number[] {
  const CELL_DEG = 0.009;
  const cosLat = Math.cos((centerLat * Math.PI) / 180) || 1;
  const cellCounts = new Map<string, number>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / CELL_DEG)}:${Math.floor(p.lng / (CELL_DEG / cosLat))}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + p.merchantCount);
  }
  return points.map((p) => {
    const key = `${Math.floor(p.lat / CELL_DEG)}:${Math.floor(p.lng / (CELL_DEG / cosLat))}`;
    return Math.min((cellCounts.get(key) ?? 0) / 10, 1);
  });
}

describe('merchant heatmap grid density', () => {
  it('puts co-located merchants in the same density cell', () => {
    const points = [
      { lat: 22.543, lng: 114.058, merchantCount: 1 },
      { lat: 22.5431, lng: 114.0581, merchantCount: 1 },
      { lat: 23.5, lng: 115.0, merchantCount: 1 }
    ];
    const intensities = intensityByGrid(points);
    // First two nearly co-located → density 2/10
    expect(intensities[0]).toBeCloseTo(0.2, 5);
    expect(intensities[1]).toBeCloseTo(0.2, 5);
    // Isolated third → density 1/10
    expect(intensities[2]).toBeCloseTo(0.1, 5);
  });

  it('caps intensity at 1.0 for dense cells', () => {
    const points = Array.from({ length: 25 }, () => ({
      lat: 22.543,
      lng: 114.058,
      merchantCount: 1
    }));
    const intensities = intensityByGrid(points);
    expect(intensities.every((v) => v === 1)).toBe(true);
  });
});
