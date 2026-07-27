import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getDataAnalysisExportUrl,
  getDataAnalysisSummary,
  type DataAnalysisSummary,
  type DataAnalysisWindow
} from '../../../services/api/data-analysis.api';
import { downloadBlob, extractErrorMessage } from '../../../services/http-client';
import { formatGmv, formatNumber, formatPercent } from '../../../utils/format';
import {
  buildChannelDonutOption,
  buildDailyTrendOption,
  buildHourlyOption,
  buildTimeSlotOption
} from './data-analysis-charts';

/** UI date presets matching the prototype chips. */
export type DataAnalysisPreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

const PRESET_LABELS: Record<DataAnalysisPreset, string> = {
  today: '今日',
  yesterday: '昨日',
  last7: '近7天',
  last30: '近30天',
  custom: '自定义'
};

/** Beijing calendar date as YYYY-MM-DD (matches API dateKey). */
function beijingTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function shiftYmd(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function resolvePresetRange(
  preset: DataAnalysisPreset,
  customStart: string,
  customEnd: string
): { window: DataAnalysisWindow; date: string; endDate?: string } {
  const today = beijingTodayKey();
  if (preset === 'today') return { window: 'day', date: today };
  if (preset === 'yesterday') return { window: 'day', date: shiftYmd(today, -1) };
  if (preset === 'last7') {
    return { window: 'week', date: shiftYmd(today, -6), endDate: today };
  }
  if (preset === 'last30') {
    return { window: 'month', date: shiftYmd(today, -29), endDate: today };
  }
  // custom
  const start = customStart || shiftYmd(today, -29);
  const end = customEnd || today;
  return { window: 'week', date: start, endDate: end };
}

/** Format MoM delta: "↑ 12.45%" / "↓ 3.12%" / "0.00%" / "—". */
export function formatDelta(ratio: number | null | undefined): {
  text: string;
  tone: 'up' | 'down' | 'flat';
} {
  if (ratio == null || !Number.isFinite(ratio)) return { text: '—', tone: 'flat' };
  if (Math.abs(ratio) < 0.00005) return { text: '0.00%', tone: 'flat' };
  const pct = `${(Math.abs(ratio) * 100).toFixed(2)}%`;
  if (ratio > 0) return { text: `↑ ${pct}`, tone: 'up' };
  return { text: `↓ ${pct}`, tone: 'down' };
}

function createDataAnalysisState() {
  const loading = ref(false);
  const exporting = ref(false);
  const loadError = ref<string | null>(null);
  const preset = ref<DataAnalysisPreset>('last30');
  const customStart = ref(shiftYmd(beijingTodayKey(), -29));
  const customEnd = ref(beijingTodayKey());
  const summary = ref<DataAnalysisSummary | null>(null);

  const queryParams = computed(() =>
    resolvePresetRange(preset.value, customStart.value, customEnd.value)
  );

  /** Monotonic id so a superseded reload never clears the newer result / shows cancel as error. */
  let reloadSeq = 0;

  async function reload() {
    const seq = ++reloadSeq;
    loading.value = true;
    loadError.value = null;
    try {
      const q = queryParams.value;
      const next = await getDataAnalysisSummary({
        window: q.window,
        date: q.date,
        endDate: q.endDate
      });
      if (seq !== reloadSeq) return; // superseded by a newer range
      summary.value = next;
    } catch (err) {
      if (seq !== reloadSeq) return;
      // In-flight abort from a newer date/preset change is not a load failure.
      const canceled =
        (err as { code?: string; name?: string } | null)?.code === 'ERR_CANCELED' ||
        (err as { name?: string } | null)?.name === 'CanceledError' ||
        (err as { name?: string } | null)?.name === 'AbortError';
      if (canceled) return;
      summary.value = null;
      loadError.value = extractErrorMessage(err, '加载数据分析预览失败');
    } finally {
      if (seq === reloadSeq) loading.value = false;
    }
  }

  async function onExport() {
    if (exporting.value) return;
    exporting.value = true;
    try {
      const q = queryParams.value;
      const range = summary.value ? `${summary.value.date}_${summary.value.endDate}` : q.window;
      await downloadBlob(
        getDataAnalysisExportUrl({
          window: q.window,
          date: q.date,
          endDate: q.endDate
        }),
        `砍价订单数据分析_${range}.xlsx`
      );
      ElMessage.success('Excel 已开始下载');
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '导出 Excel 失败'));
    } finally {
      exporting.value = false;
    }
  }

  function onPresetChange(next: DataAnalysisPreset) {
    preset.value = next;
    if (next !== 'custom') void reload();
  }

  function onCustomRangeChange(range: [string, string] | null) {
    if (!range) return;
    customStart.value = range[0];
    customEnd.value = range[1];
    preset.value = 'custom';
    void reload();
  }

  const windowRange = computed(() => {
    if (!summary.value) {
      const q = queryParams.value;
      return q.endDate && q.endDate !== q.date ? `${q.date} → ${q.endDate}` : q.date;
    }
    const { date, endDate } = summary.value;
    return date === endDate ? date : `${date} → ${endDate}`;
  });

  const dailyTrendOption = computed(() => buildDailyTrendOption(summary.value?.daily ?? []));
  const channelOption = computed(() =>
    buildChannelDonutOption(summary.value?.channels ?? [], summary.value?.overview.salesAmount ?? 0)
  );
  const timeSlotOption = computed(() => buildTimeSlotOption(summary.value?.timeSlots ?? []));
  const hourlyOption = computed(() => buildHourlyOption(summary.value?.hourly ?? []));

  onMounted(() => {
    void reload();
  });

  return {
    loading,
    exporting,
    loadError,
    preset,
    customStart,
    customEnd,
    summary,
    presetLabels: PRESET_LABELS,
    windowRange,
    dailyTrendOption,
    channelOption,
    timeSlotOption,
    hourlyOption,
    reload,
    onExport,
    onPresetChange,
    onCustomRangeChange,
    formatGmv,
    formatNumber,
    formatPercent,
    formatDelta
  };
}

/** reactive() unwraps refs so the view can pass page.loading as boolean props. */
export function useDataAnalysisPage() {
  return reactive(createDataAnalysisState());
}
