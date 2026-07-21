/**
 * Minimal connectivity probe for the aisenyu gateway via the Codex path:
 *   GET  /v1/models
 *   POST /v1/responses   (wire_api = "responses")
 *
 * Reads credentials from environment (or local .env via dotenv):
 *   OPENAI_API_KEY / AI_API_KEY / ANTHROPIC_AUTH_TOKEN
 *   AI_API_BASE_URL / OPENAI_BASE_URL (default https://api.aisenyu.com/v1)
 *   AI_MODEL / OPENAI_MODEL (default grok-4.5)
 *
 * Also tries ~/.codex/auth.json OPENAI_API_KEY if env is empty
 * (never prints the full key).
 *
 * Usage:
 *   node scripts/test-codex-aisenyu.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  override: true,
});

function readCodexAuthKey() {
  const candidates = [
    process.env.CODEX_HOME && path.join(process.env.CODEX_HOME, 'auth.json'),
    path.join(os.homedir(), '.codex', 'auth.json'),
    'E:\\AI_Caches\\.codex\\auth.json',
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data.OPENAI_API_KEY === 'string' && data.OPENAI_API_KEY) {
        return { key: data.OPENAI_API_KEY, source: p };
      }
    } catch {
      // ignore missing / unreadable
    }
  }
  return { key: '', source: '' };
}

const envKey =
  process.env.OPENAI_API_KEY ||
  process.env.AI_API_KEY ||
  process.env.ANTHROPIC_AUTH_TOKEN ||
  '';
const codexAuth = envKey ? { key: '', source: '' } : readCodexAuthKey();
const TOKEN = envKey || codexAuth.key;
const TOKEN_SOURCE = envKey
  ? 'env (.env / process)'
  : codexAuth.source
    ? `codex auth.json (${codexAuth.source})`
    : '(missing)';

const OPENAI_BASE = (
  process.env.AI_API_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  'https://api.aisenyu.com/v1'
).replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'grok-4.5';

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

function extractResponsesText(body) {
  if (!body || typeof body !== 'object') return '';
  if (typeof body.output_text === 'string') return body.output_text;
  if (Array.isArray(body.output)) {
    const parts = [];
    for (const item of body.output) {
      if (!item) continue;
      if (typeof item.text === 'string') parts.push(item.text);
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c?.text === 'string') parts.push(c.text);
          if (typeof c?.output_text === 'string') parts.push(c.output_text);
        }
      }
    }
    if (parts.length) return parts.join('');
  }
  // Some gateways still return chat-completions shape
  const chat =
    body?.choices?.[0]?.message?.content ??
    body?.choices?.[0]?.text ??
    '';
  return chat || '';
}

async function main() {
  console.log('=== aisenyu Codex (responses) connectivity ===');
  console.log(`OPENAI_BASE = ${OPENAI_BASE}`);
  console.log(`MODEL       = ${MODEL}`);
  console.log(`TOKEN       = ${mask(TOKEN)}`);
  console.log(`TOKEN_SRC   = ${TOKEN_SOURCE}`);
  console.log('');

  if (!TOKEN) {
    console.error(
      'Missing API key. Set OPENAI_API_KEY (or AI_API_KEY) in .env, or run: printf "%s" "$KEY" | codex login --with-api-key',
    );
    process.exit(1);
  }

  // 1) models
  console.log('[1/2] GET /v1/models');
  try {
    const { res, body } = await getJson(`${OPENAI_BASE}/models`, {
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
        console.log(
          `  note: "${MODEL}" not in first page of models (gateway may still accept it)`,
        );
      }
    }
  } catch (e) {
    fail('/v1/models', e);
  }

  // 2) responses (Codex wire_api)
  console.log('[2/2] POST /v1/responses');
  try {
    const { res, body } = await getJson(`${OPENAI_BASE}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: 'Reply with exactly: pong',
        max_output_tokens: 16,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      // Fall back once with chat-completions-shaped payload some bridges accept
      console.warn(
        `  WARN HTTP ${res.status} ${JSON.stringify(body).slice(0, 240)}`,
      );
      console.log('  retry with chat-style messages field (bridge compatibility)');
      const retry = await getJson(`${OPENAI_BASE}/responses`, {
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
      if (!retry.res.ok) {
        fail(
          '/v1/responses',
          `HTTP ${retry.res.status} ${JSON.stringify(retry.body).slice(0, 240)}`,
        );
      } else {
        const content = extractResponsesText(retry.body);
        console.log(
          `  OK HTTP ${retry.res.status}  content=${JSON.stringify(String(content).slice(0, 80))}`,
        );
      }
    } else {
      const content = extractResponsesText(body);
      console.log(
        `  OK HTTP ${res.status}  content=${JSON.stringify(String(content).slice(0, 80))}`,
      );
    }
  } catch (e) {
    fail('/v1/responses', e);
  }

  console.log('');
  if (process.exitCode && process.exitCode !== 0) {
    console.log('Result: FAILED (see above)');
    process.exit(process.exitCode);
  }
  console.log('Result: OK — Codex gateway path is reachable.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
