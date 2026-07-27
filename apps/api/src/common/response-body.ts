/**
 * Bounded response-body readers for outbound fetches.
 * Full `response.text()` can pin API memory on bloated/malicious same-host pages
 * or oversized external catalog JSON — always cap before materializing.
 */

/** Default max for HTML form pages (package detail, partner shop, login). */
export const HTML_RESPONSE_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB

/** Default max for external catalog JSON pages. */
export const JSON_RESPONSE_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB

/** Login / cookie-validate responses are small. */
export const LOGIN_RESPONSE_MAX_BYTES = 512 * 1024; // 512 KiB

export class ResponseBodyTooLargeError extends Error {
  readonly maxBytes: number;
  readonly contentLength: number | null;

  constructor(maxBytes: number, contentLength: number | null = null) {
    super(
      contentLength != null
        ? `Response body ${contentLength} bytes exceeds max ${maxBytes}`
        : `Response body exceeds max ${maxBytes} bytes`
    );
    this.name = 'ResponseBodyTooLargeError';
    this.maxBytes = maxBytes;
    this.contentLength = contentLength;
  }
}

function parseContentLength(response: Response): number | null {
  try {
    const raw = response.headers?.get?.('content-length');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Read a Response body as UTF-8 text with a hard byte ceiling.
 * Rejects early when Content-Length is declared over the limit; otherwise
 * streams until the limit and aborts.
 */
export async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const declared = parseContentLength(response);
  if (declared != null && declared > maxBytes) {
    // Drain/cancel so the socket is not left hanging.
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
    throw new ResponseBodyTooLargeError(maxBytes, declared);
  }

  // Prefer streaming when available (Node 18+ fetch / undici).
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          throw new ResponseBodyTooLargeError(maxBytes, total);
        }
        chunks.push(value);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return new TextDecoder('utf-8').decode(merged);
  }

  // Fallback chain for test mocks / older Response shims that only expose
  // arrayBuffer() or text() — still enforce max after materialization.
  if (typeof response.arrayBuffer === 'function') {
    const buf = await response.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new ResponseBodyTooLargeError(maxBytes, buf.byteLength);
    }
    return new TextDecoder('utf-8').decode(buf);
  }

  if (typeof response.text === 'function') {
    const text = await response.text();
    // Approximate byte length via UTF-8; reject oversize post-read.
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) {
      throw new ResponseBodyTooLargeError(maxBytes, bytes);
    }
    return text;
  }

  throw new Error('Response body is not readable');
}
