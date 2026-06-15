import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'release/**', 'build/**', 'node_modules/**'],
  },
  // Electron 主进程 / 预加载：Node 环境，CommonJS
  {
    files: ['electron/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  // 构建/工具配置文件：Node 环境，ESM
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  // React 渲染进程：浏览器环境，ESM
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // process.env.NODE_ENV 由 Vite 在构建期替换，lint 时声明为只读全局
      globals: { ...globals.browser, process: 'readonly' },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 关键规则保持 error：react-hooks/rules-of-hooks、no-undef（来自 recommended）
      // 以下为风格类问题，降级为 warning 作为后续清理 backlog，不阻断 lint
      'react/no-unescaped-entities': 'warn',
      'react/display-name': 'warn',
      'no-case-declarations': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  // 测试文件：补充 Vitest 全局
  {
    files: ['**/*.test.{js,jsx}', '**/__tests__/**'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'off',
    },
  },
];
