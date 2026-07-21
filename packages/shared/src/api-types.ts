/* Shared API response types (backend controllers + frontend API service). CIRCULAR DEPENDENCY GUARD: submodules MUST stay type-only imports from domain-types. index.ts re-exports this barrel via export * from './api-types'. Runtime imports here would create a circular dependency at runtime. */ export * from './api-ai-types';
export * from './api-package-types';
export * from './api-console-types';
export * from './api-alerts-types';
export * from './api-content-types';
export * from './api-task-types';
export * from './api-campaign-types';
