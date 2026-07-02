import { ref } from 'vue';

/**
 * 请求 ID race-guard:每次 `next()` 递增一个本地计数器,
 * 调用方保存当前 ID 后,异步 await 完成后用 `isStale(id)` 检查
 * 期间是否被新的请求覆盖,是则放弃本次结果写入。
 *
 * 用法:
 *   const guard = useRequestId();
 *   const run = async () => {
 *     const id = guard.next();
 *     try { const data = await api.foo(); } finally {
 *       if (!guard.isStale(id)) { 写入状态 }
 *     }
 *   };
 *
 * 比手写 `let requestId = 0; const my = ++requestId; if (my !== requestId) return;`
 * 简洁,适合每个 composable 持有一个独立计数器(避免互相覆盖)。
 */
export function useRequestId() {
  const counter = ref(0);
  return {
    next(): number {
      counter.value += 1;
      return counter.value;
    },
    isStale(id: number): boolean {
      return id !== counter.value;
    }
  };
}
