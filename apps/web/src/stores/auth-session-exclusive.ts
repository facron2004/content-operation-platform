export type AuthSessionResult = boolean | null;
export async function runExclusiveAuthRequest(
  inflight: { current: Promise<AuthSessionResult> | null },
  work: () => Promise<AuthSessionResult>
): Promise<AuthSessionResult> {
  if (inflight.current) return inflight.current;
  const request = (async () => {
    try {
      return await work();
    } finally {
      setTimeout(() => {
        if (inflight.current === request) inflight.current = null;
      }, 100);
    }
  })();
  inflight.current = request;
  return request;
}
