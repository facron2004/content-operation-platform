# 动销 / 不动销页设计 QA

> **证据日期与范围**：本文记录一次本地 Web 页面视觉验收快照；不代表当前所有页面或 Windows/EXE/安装器验收。桌面发布当前延期，最新全局状态见 [文档对齐总览](docs/DOCUMENTATION-STATUS.md)。

- Visual source of truth: `docs/design-references/movement-redesign-target.png`
- Reference size: 1729 × 910
- Implementation route: `http://127.0.0.1:3100/movement`
- Comparison viewport: 1729 × 910
- State: authenticated, light theme, default stagnant-SKU tab, live local data

## Verification

- Movement feature tests: 4 files, 18 tests passed
- Web production build: passed (`vue-tsc --noEmit` and `vite build`)
- Touched movement source files: ESLint passed
- Browser console warnings/errors: 0
- Browser page errors: 0
- Horizontal document overflow: none
- Rendered content: 4 KPI cards, 2 charts, 20 table rows
- Tab interaction: stagnant → moving → stagnant passed
- Risk drilldown: “15 天未销” chart legend click updated the bucket filter successfully

## Comparison artifacts

- Implementation viewport: `output/playwright/movement-redesign/implementation-1729x910.png`
- Full-page implementation: `output/playwright/movement-redesign/implementation-full-page.png`
- Same-viewport side-by-side: `output/playwright/movement-redesign/comparison-full.png`
- Focused analytics/table comparison: `output/playwright/movement-redesign/comparison-focus.png`
- Browser metrics: `output/playwright/movement-redesign/browser-results.json`

## Visual findings

- The page follows the reference hierarchy: compact hero, four KPI cards, paired risk/health
  analysis, and a dense operational table.
- The implementation keeps the analytics and at least five detail rows visible in the
  910-pixel viewport, improving information density over the original page.
- Risk colors, icon treatment, radii, panel borders, spacing, and typography are visually
  consistent with the reference and the existing Apple-style shell.
- The horizontal risk bars, donut structure, legend, insights, filters, and table remain
  readable without document-level horizontal scrolling.
- No P0, P1, or P2 visual issue remains in the full-view or focused comparison.

final result: passed
