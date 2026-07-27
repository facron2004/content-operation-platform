/** Chunk-load / session-hydration helpers for reliable first navigation. */

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed|error loading dynamically imported module|Unable to preload CSS/i;

const CHUNK_RELOAD_KEY = 'ops_route_chunk_reload';

/** Fallback when sessionStorage is unavailable (SSR/test). Survives only in-process. */
let memoryChunkReloadFlag = false;

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function storageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    error instanceof Error
      ? `${error.message}\n${error.name}`
      : typeof error === 'string'
        ? error
        : String(error);
  return CHUNK_ERROR_RE.test(msg);
}

/** True when a full page reload was already attempted for a chunk failure this tab. */
export function consumeChunkReloadFlag(): boolean {
  if (storageGet(CHUNK_RELOAD_KEY) === '1' || memoryChunkReloadFlag) {
    storageRemove(CHUNK_RELOAD_KEY);
    memoryChunkReloadFlag = false;
    return true;
  }
  return false;
}

export function markChunkReloadPending(): void {
  memoryChunkReloadFlag = true;
  storageSet(CHUNK_RELOAD_KEY, '1');
}

export function clearChunkReloadFlag(): void {
  memoryChunkReloadFlag = false;
  storageRemove(CHUNK_RELOAD_KEY);
}

/**
 * Soft-retry a dynamic import once. Note: some browsers cache a rejected
 * import() promise for the same module URL — callers should still handle
 * terminal failure via full reload (see handleRouterError).
 */
export function withImportRetry<T>(
  loader: () => Promise<T>,
  retries = 1,
  delayMs = 150
): () => Promise<T> {
  return async () => {
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await loader();
      } catch (err) {
        last = err;
        if (!isChunkLoadError(err) || attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
    throw last;
  };
}

export type SessionHydrateResult = 'ok' | 'empty' | 'failed';

export type SessionHydrateInput = {
  hasServerSession: boolean;
  fetchMe: () => Promise<
    | {
        userId?: string;
        username?: string;
        roles?: Array<{ role: string; scopeType?: string; scopeId?: string } | string>;
      }
    | null
    | undefined
  >;
  initFromSession: (info: {
    userId: string;
    username: string;
    roles: string[];
    bindings: Array<{ userId: string; role: string; scopeType?: string; scopeId?: string }>;
  }) => void;
  retries?: number;
  delayMs?: number;
};

/**
 * Hydrate role session from /users/me with a short retry.
 * Does NOT invent roles on failure — caller must treat "failed" differently from "denied".
 */
export async function hydrateServerSession(
  input: SessionHydrateInput
): Promise<SessionHydrateResult> {
  if (input.hasServerSession) return 'ok';
  const retries = input.retries ?? 1;
  const delayMs = input.delayMs ?? 200;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await input.fetchMe();
      if (!data?.userId) return 'empty';
      const rawRoles = Array.isArray(data.roles) ? data.roles : [];
      const roles = rawRoles.map((r) => (typeof r === 'string' ? r : r.role));
      const bindings = rawRoles.map((r) =>
        typeof r === 'string'
          ? { userId: data.userId as string, role: r }
          : {
              userId: data.userId as string,
              role: r.role,
              scopeType: r.scopeType,
              scopeId: r.scopeId
            }
      );
      input.initFromSession({
        userId: data.userId,
        username: data.username ?? '',
        roles,
        bindings
      });
      return 'ok';
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  return 'failed';
}

/**
 * Role gate decision after hydration attempt.
 * - session unknown → block navigation in place (do NOT treat as permission denied)
 * - session ok + missing role → hard deny
 * - no required roles → allow
 */
export function resolveRoleAccess(params: {
  requiredRoles?: readonly string[] | string[] | undefined;
  hasServerSession: boolean;
  effectiveRoles: readonly string[];
}): 'allow' | 'deny' | 'session-unknown' {
  const required = params.requiredRoles;
  if (!required || required.length === 0) return 'allow';
  if (!params.hasServerSession) return 'session-unknown';
  const hasRole = params.effectiveRoles.some((r) => required.includes(r));
  return hasRole ? 'allow' : 'deny';
}
