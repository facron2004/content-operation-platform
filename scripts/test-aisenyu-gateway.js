/**
 * Minimal connectivity probe for the aisenyu Anthropic/OpenAI-compatible gateway.
 *
 * Reads credentials from environment (or local .env via dotenv):
 *   ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY / AI_API_KEY
 *   ANTHROPIC_BASE_URL (default https://api.aisenyu.com)
 *   ANTHROPIC_MODEL / AI_MODEL (default grok-4.5)
 *
 * Usage:
 *   node scripts/test-aisenyu-gateway.js
 *
 * Never prints the full API key.
 */
// Prefer project .env over host-injected vars (Claude Desktop may override
// ANTHROPIC_BASE_URL to a local proxy for the interactive session).
require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env'),
  override: true,
});

const BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.aisenyu.com').replace(/\/$/, '');
const TOKEN =
  process.env.ANTHROPIC_AUTH_TOKEN ||
  process.env.ANTHROPIC_API_KEY ||
  process.env.AI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  '';
const MODEL = process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || 'grok-4.5';
const OPENAI_BASE = process.env.AI_API_BASE_URL || `${BASE}/v1`;

function mask(key) {
  if (!key) return '(missing)';
  if (key.length <= 12) return '***';
  return `${key.slice(0, 6)}...${key.slice(-4)} (len=${key.length})`;
}

function fail(step, err) {
  console.error(`[FAIL] ${step}:`, err?.message || err);
  process.exitCode = 1;
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 300);
  }
  return { res, body, text };
}

async function main() {
  console.log('=== aisenyu gateway connectivity ===');
  console.log(`ANTHROPIC_BASE_URL = ${BASE}`);
  console.log(`OPENAI_BASE        = ${OPENAI_BASE}`);
  console.log(`MODEL              = ${MODEL}`);
  console.log(`TOKEN              = ${mask(TOKEN)}`);
  console.log('');

  if (!TOKEN) {
    console.error(
      'Missing API key. Set ANTHROPIC_AUTH_TOKEN (or AI_API_KEY) in .env or the environment.',
    );
    process.exit(1);
  }

  // 1) OpenAI-compatible models list
  console.log('[1/3] GET /v1/models');
  try {
    const { res, body } = await getJson(`${OPENAI_BASE.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      fail('/v1/models', `HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const data = Array.isArray(body?.data) ? body.data : [];
      const ids = data
        .map((m) => m.id || m.name)
        .filter(Boolean)
        .slice(0, 12);
      console.log(`  OK HTTP ${res.status}  models=${data.length}  sample=${JSON.stringify(ids)}`);
      if (ids.includes(MODEL) || data.some((m) => (m.id || m.name) === MODEL)) {
        console.log(`  model "${MODEL}" is listed`);
      } else if (data.length) {
        console.log(`  note: "${MODEL}" not in first page of models (gateway may still accept it)`);
      }
    }
  } catch (e) {
    fail('/v1/models', e);
  }

  // 2) OpenAI-compatible chat completion (minimal)
  console.log('[2/3] POST /v1/chat/completions');
  try {
    const { res, body } = await getJson(`${OPENAI_BASE.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
        max_tokens: 16,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      fail('/v1/chat/completions', `HTTP ${res.status} ${JSON.stringify(body).slice(0, 240)}`);
    } else {
      const content =
        body?.choices?.[0]?.message?.content ??
        body?.choices?.[0]?.text ??
        body?.output_text ??
        '';
      console.log(`  OK HTTP ${res.status}  content=${JSON.stringify(String(content).slice(0, 80))}`);
    }
  } catch (e) {
    fail('/v1/chat/completions', e);
  }

  // 3) Anthropic-compatible messages (Claude Code path; no /v1 suffix on base)
  console.log('[3/3] POST /v1/messages (Anthropic-compatible)');
  try {
    const { res, body } = await getJson(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': TOKEN,
        Authorization: `Bearer ${TOKEN}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
      }),
    });
    if (!res.ok) {
      // Some gateways only expose OpenAI surface; treat as soft warning if chat worked.
      console.warn(
        `  WARN HTTP ${res.status} ${JSON.stringify(body).slice(0, 240)}`,
      );
      console.warn(
        '  (Anthropic /v1/messages may be optional; Claude Code needs this path.)',
      );
      if (process.exitCode !== 1) process.exitCode = 0; // keep soft unless earlier hard fail
    } else {
      const textParts = Array.isArray(body?.content)
        ? body.content.map((c) => c.text || '').join('')
        : '';
      console.log(
        `  OK HTTP ${res.status}  type=${body?.type || '?'}  content=${JSON.stringify(textParts.slice(0, 80))}`,
      );
    }
  } catch (e) {
    console.warn('[WARN] /v1/messages:', e?.message || e);
  }

  console.log('');
  if (process.exitCode && process.exitCode !== 0) {
    console.log('Result: FAILED (see above)');
    process.exit(process.exitCode);
  }
  console.log('Result: OK — gateway is reachable with the configured key/model.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
