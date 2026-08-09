import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────
  {
    ignores: [
      'dist/**',
      'apps/api/dist/**',
      'apps/api/public/**',
      'apps/web/dist/**',
      'packages/shared/dist/**',
      'packages/shared/src/**/*.js',
      'packages/shared/src/**/*.js.map',
      'node_modules/**',
      'coverage/**',
      'prisma/**',
      'scripts/**',
      'test-parser.ts',
      '*.js',
      '*.cjs',
      '*.mjs',
      '**/*.d.ts',
      'apps/web/src/components.d.ts',
      'apps/web/src/auto-imports.d.ts'
    ]
  },

  // ── Base JS rules ───────────────────────────────────
  js.configs.recommended,

  // ── TypeScript ──────────────────────────────────────
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      '@typescript-eslint/no-require-imports': 'off'
    }
  },

  // ── NestJS backend (relaxed rules) ──────────────────
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // NestJS decorators use import() type expressions extensively
      '@typescript-eslint/consistent-type-imports': 'off'
    }
  },

  // ── Vue 3 frontend ─────────────────────────────────
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['apps/web/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },

  // ── Test files (relaxed rules) ──────────────────────
  {
    files: ['**/test/**/*.ts', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      // 测试文件不含 Vue 组件，关闭 Vue 模板相关规则
      'vue/one-component-per-file': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/no-v-html': 'off',
      'vue/require-default-prop': 'off',
      'vue/attributes-order': 'off'
    }
  },

  // ── Prettier (must be last to override rules) ──────
  eslintConfigPrettier
);
