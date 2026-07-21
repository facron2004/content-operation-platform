# Content Ops AI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local MVP for sales-driven package recommendation, copy generation, audit, and performance feedback.

**Architecture:** npm workspaces monorepo with Vue admin UI, NestJS API, shared TypeScript contracts, and SQLite persistence through Prisma Client. The first version uses seed data and template copy generation while keeping adapters for external backend APIs and future AI providers.

**Tech Stack:** Vue 3, TypeScript, Vite, Element Plus, Pinia, ECharts, NestJS, Prisma Client, SQLite, Vitest.

---

## Completed Implementation Tasks

- [x] Initialize Git repo and npm workspace skeleton.
- [x] Add shared DTOs and enums for packages, snapshots, promotion scores, generated copy, performance, roles, channels, and audit states.
- [x] Add Prisma schema plus SQLite bootstrap and seed data for realistic local operation.
- [x] Write failing tests for promotion status, scoring, strategy generation, copy generation, machine audit, and core API workflow.
- [x] Implement promotion status recognition, scoring, strategy generation, template copy generation, and audit checks.
- [x] Implement NestJS endpoints:
  - `GET /api/content/packages/recommend`
  - `GET /api/content/packages/:packageId/analysis`
  - `POST /api/content/generate`
  - `GET /api/content/copies`
  - `POST /api/content/copies/:contentId/audit`
  - `GET /api/content/dashboard/summary`
  - `GET /api/content/performance`
- [x] Implement Vue admin pages for dashboard, recommendation table, package analysis, copy generation, audit, and performance.
- [x] Verify tests, build, seed, API smoke test, and browser generation flow.

