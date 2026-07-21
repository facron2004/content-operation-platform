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

  const scheduleResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => chart?.resize(), 80);
  };

  const mount = () => {
    render();
    resizeObserver = new ResizeObserver(scheduleResize);
    if (el.value) resizeObserver.observe(el.value);
    window.addEventListener('resize', scheduleResize);
  };

  const unmount = () => {
    window.removeEventListener('resize', scheduleResize);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (resizeTimer) clearTimeout(resizeTimer);
    chart?.off('click', handleClick);
    chart?.dispose();
    chart = null;
  };

  return { dispose: { render, mount, unmount } };
}
