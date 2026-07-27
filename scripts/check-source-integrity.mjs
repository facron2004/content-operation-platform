#!/usr/bin/env node
/**
 * ENG-001 源码完整性检查（PRD 7.1）
 * - 扫描 apps/、packages/、electron/、prisma/ 下的 ts/vue/js 源文件
 * - 校验所有相对导入可解析
 * - 校验 tsconfig path alias（@content/*）可解析
 * - 校验 package.json scripts 引用的文件存在
 * - 校验 Electron 入口 / Prisma schema 存在
 * CI 中发现缺失文件时以非零码退出。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// scripts/ 不做导入扫描：内含一次性补丁脚本，嵌入代码字符串会误报
const SCAN_DIRS = ['apps/api/src', 'apps/web/src', 'packages', 'electron', 'prisma'];
const EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue', '.json'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'coverage', '.git', 'generated']);

// tsconfig path alias 映射（与 tsconfig.base.json 保持一致）
const ALIASES = [
  { prefix: '@content/shared', target: 'packages/shared/src' },
  { prefix: '@/', target: 'apps/web/src/' }
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs|cjs|vue)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('.')) {
    base = resolve(dirname(fromFile), spec);
  } else {
    const alias = ALIASES.find((a) => spec === a.prefix || spec.startsWith(a.prefix));
    if (!alias) return true; // 裸模块（npm 包）不在本检查范围
    base = resolve(ROOT, alias.target + spec.slice(alias.prefix.length));
  }
  if (existsSync(base) && statSync(base).isFile()) return true;
  for (const ext of EXTS) if (existsSync(base + ext)) return true;
  for (const ext of EXTS) if (existsSync(join(base, 'index' + ext))) return true;
  return false;
}

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

let fileCount = 0;
const missing = [];

for (const d of SCAN_DIRS) {
  for (const file of walk(join(ROOT, d))) {
    fileCount++;
    const src = readFileSync(file, 'utf8');
    // vue 文件只扫 <script> 块
    const code = file.endsWith('.vue')
      ? (src.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || []).join('\n')
      : src;
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      if (!spec || spec.startsWith('node:') || spec.startsWith('virtual:')) continue;
      if (!spec.startsWith('.') && !ALIASES.some((a) => spec.startsWith(a.prefix))) continue;
      if (!resolveImport(file, spec)) {
        missing.push({ file: file.replace(ROOT, '.'), spec });
      }
    }
  }
}

// package.json scripts 引用的文件
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scriptRefs = [];
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  for (const m of cmd.matchAll(/(?:node|tsx|python)\s+((?:\.\/)?(?:scripts|prisma|electron)\/[\w./-]+)/g)) {
    scriptRefs.push({ name, ref: m[1] });
  }
}
const missingScriptRefs = scriptRefs.filter((r) => !existsSync(join(ROOT, r.ref)));

// 关键入口
const entryChecks = [
  pkg.main, // electron 入口
  'prisma/schema.prisma',
  'tsconfig.base.json'
].filter(Boolean);
const missingEntries = entryChecks.filter((p) => !existsSync(join(ROOT, p)));

// ── 输出（PRD 7.1.2 规定格式）──
console.log(`检查文件总数: ${fileCount}`);
console.log(`未解析导入数量: ${missing.length}`);
console.log(`缺失文件列表: ${missing.length === 0 && missingScriptRefs.length === 0 && missingEntries.length === 0 ? '无' : ''}`);
for (const m of missing) console.log(`  [导入缺失] ${m.file} -> ${m.spec}`);
for (const r of missingScriptRefs) console.log(`  [script缺失] scripts.${r.name} -> ${r.ref}`);
for (const p of missingEntries) console.log(`  [入口缺失] ${p}`);
console.log(`引用文件列表: package.json scripts 引用 ${scriptRefs.length} 个本地文件`);

const failed = missing.length > 0 || missingScriptRefs.length > 0 || missingEntries.length > 0;
console.log(`检查结果: ${failed ? '失败' : '通过'}`);
process.exit(failed ? 1 : 0);
