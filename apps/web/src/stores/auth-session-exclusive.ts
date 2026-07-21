export type AuthTokenResult = string | null;
export async function runExclusiveAuthRequest(
  inflight: { current: Promise<AuthTokenResult> | null },
  work: () => Promise<AuthTokenResult>
): Promise<AuthTokenResult> {
  if (inflight.current) return inflight.current;
  inflight.current = (async () => {
    try {
      return await work();
    } finally {
      setTimeout(() => {
        inflight.current = null;
      }, 100);
    }
  })();
  return inflight.current;
}
