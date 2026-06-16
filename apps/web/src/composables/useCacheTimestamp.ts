import { ref, computed, onMounted, onUnmounted } from 'vue';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export function useCacheTimestamp() {
  const cacheTimestamp = ref<number>(0);
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;

  onMounted(() => {
    // 每秒更新 now，让 relativeTime 自动刷新
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  // 计算相对时间
  const relativeTime = computed(() => {
    if (!cacheTimestamp.value) return '';

    const diff = now.value - cacheTimestamp.value;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds} 秒前`;
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  });

  // 新鲜度状态
  const freshness = computed(() => {
    if (!cacheTimestamp.value) return 'unknown';

    const age = now.value - cacheTimestamp.value;
    const oneMinute = 60 * 1000;
    const fiveMinutes = 5 * oneMinute;
    const thirtyMinutes = 30 * oneMinute;

    if (age < oneMinute) return 'fresh'; // 新鲜
    if (age < fiveMinutes) return 'good'; // 良好
    if (age < thirtyMinutes) return 'stale'; // 过时
    return 'expired'; // 过期
  });

  // 新鲜度颜色
  const freshnessColor = computed(() => {
    const colors = {
      fresh: '#52c41a',    // 绿色
      good: '#1890ff',     // 蓝色
      stale: '#faad14',    // 橙色
      expired: '#f5222d',  // 红色
      unknown: '#d9d9d9'   // 灰色
    };
    return colors[freshness.value as keyof typeof colors];
  });

  // 新鲜度文本
  const freshnessText = computed(() => {
    const texts = {
      fresh: '数据新鲜',
      good: '数据良好',
      stale: '建议刷新',
      expired: '数据过期',
      unknown: '未知'
    };
    return texts[freshness.value as keyof typeof texts];
  });

  // 更新缓存时间戳
  function updateTimestamp() {
    cacheTimestamp.value = Date.now();
  }

  // 清除时间戳
  function clearTimestamp() {
    cacheTimestamp.value = 0;
  }

  return {
    cacheTimestamp,
    relativeTime,
    freshness,
    freshnessColor,
    freshnessText,
    updateTimestamp,
    clearTimestamp
  };
}
