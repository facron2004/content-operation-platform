import type { Ref } from 'vue';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';

export type ChartClickPayload = {
  name?: string;
  value?: number | string;
  dataIndex?: number;
  data?: { key?: string; value?: number; [k: string]: unknown };
};

export function bindChartPanel(
  el: Ref<HTMLDivElement | null>,
  getOption: () => EChartsCoreOption | Record<string, unknown> | null | undefined,
  onClick?: (payload: ChartClickPayload) => void
) {
  let chart: echarts.ECharts | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let lastSize = { w: 0, h: 0 };

  const handleClick = (params: unknown) => {
    if (!onClick) return;
    const p = params as ChartClickPayload;
    onClick({
      name: p.name,
      value: p.value as number | string | undefined,
      dataIndex: p.dataIndex,
      data: p.data as ChartClickPayload['data']
    });
  };

  const render = () => {
    if (!el.value) return;
    const option = getOption();
    if (!option || typeof option !== 'object' || Object.keys(option).length === 0) {
      // empty option: clear chart if already mounted, otherwise skip init
      if (chart) chart.clear();
      return;
    }
    if (!chart) {
      chart = echarts.init(el.value);
      chart.on('click', handleClick);
    }
    chart.setOption(option as EChartsCoreOption, true);
  };

  /**
   * echarts.resize({ width }) stamps an inline pixel width on the host. Clear it
   * before measuring so % / flex width can follow the parent after sidebar toggle.
   * Prefer the parent's content box (minus padding) over the host's frozen size.
   */
  const readSize = () => {
    const node = el.value;
    if (!node) return { w: 0, h: 0 };
    if (node.style.width) node.style.width = '';
    if (node.style.height) node.style.height = '';
    // Force layout after clearing inline sizes so clientWidth reflects CSS.
    void node.offsetWidth;

    const parent = node.parentElement;
    let w = node.clientWidth;
    if (parent) {
      const cs = getComputedStyle(parent);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const contentW = parent.clientWidth - padX;
      if (contentW > 0) w = contentW;
    }
    const h = node.clientHeight;
    return {
      w: Math.max(0, Math.floor(w || 0)),
      h: Math.max(0, Math.floor(h || 0))
    };
  };

  const scheduleResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!chart || !el.value) return;
      const { w, h } = readSize();
      // Skip zero-size (hidden tab / display:none) and no-op resizes so a
      // self-observed node cannot re-enter resize → grow → resize.
      if (w <= 0 || h <= 0) return;
      if (w === lastSize.w && h === lastSize.h) return;
      lastSize = { w, h };
      chart.resize({ width: w, height: h });
    }, 80);
  };

  const mount = () => {
    lastSize = readSize();
    render();
    resizeObserver = new ResizeObserver(scheduleResize);
    // Observe the parent when available so chart canvas reflow cannot feed
    // back into the observed box. Fall back to self if parent is missing.
    const target = el.value?.parentElement ?? el.value;
    if (target) resizeObserver.observe(target);
    window.addEventListener('resize', scheduleResize);
  };

  const unmount = () => {
    window.removeEventListener('resize', scheduleResize);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (resizeTimer) clearTimeout(resizeTimer);
    lastSize = { w: 0, h: 0 };
    chart?.off('click', handleClick);
    chart?.dispose();
    chart = null;
  };

  return { dispose: { render, mount, unmount } };
}
