import { describe, expect, it } from 'vitest';
import {
  CHANNEL_WINDOW_HOURS,
  DEFAULT_CHANNEL_WINDOW_HOURS,
  channelWindowEnd,
  channelWindowHours,
  isWithinChannelWindow
} from '../src/common/channel-window';

describe('channel-window', () => {
  it('maps known channels and defaults unknown', () => {
    expect(channelWindowHours('wechat_group')).toBe(24);
    expect(channelWindowHours('moments')).toBe(72);
    expect(channelWindowHours('merchant_share')).toBe(48);
    expect(channelWindowHours('unknown')).toBe(DEFAULT_CHANNEL_WINDOW_HOURS);
    expect(channelWindowHours(null)).toBe(DEFAULT_CHANNEL_WINDOW_HOURS);
    expect(CHANNEL_WINDOW_HOURS.wechat_group).toBe(24);
  });

  it('isWithinChannelWindow requires publishedAt and open window', () => {
    const start = Date.parse('2026-07-20T00:00:00.000Z');
    expect(isWithinChannelWindow(null, 'wechat_group', start)).toBe(false);
    expect(isWithinChannelWindow('', 'wechat_group', start)).toBe(false);
    expect(isWithinChannelWindow('not-a-date', 'wechat_group', start)).toBe(false);

    // exactly at start → open
    expect(isWithinChannelWindow('2026-07-20T00:00:00.000Z', 'wechat_group', start)).toBe(true);
    // 23h later still open for wechat_group (24h)
    expect(
      isWithinChannelWindow('2026-07-20T00:00:00.000Z', 'wechat_group', start + 23 * 60 * 60 * 1000)
    ).toBe(true);
    // 25h later closed
    expect(
      isWithinChannelWindow('2026-07-20T00:00:00.000Z', 'wechat_group', start + 25 * 60 * 60 * 1000)
    ).toBe(false);
    // moments stays open longer
    expect(
      isWithinChannelWindow('2026-07-20T00:00:00.000Z', 'moments', start + 48 * 60 * 60 * 1000)
    ).toBe(true);
  });

  it('channelWindowEnd is publishedAt + channel hours as sqlite datetime', () => {
    const end = channelWindowEnd('2026-07-20T00:00:00.000Z', 'wechat_group');
    // toSqliteDateTime UTC space form of +24h
    expect(end).toMatch(/^2026-07-2[01] \d{2}:\d{2}:\d{2}$/);
    const endMs = Date.parse(end.replace(' ', 'T') + 'Z');
    const startMs = Date.parse('2026-07-20T00:00:00.000Z');
    expect(endMs - startMs).toBe(24 * 60 * 60 * 1000);
  });
});
