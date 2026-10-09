// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/', 'assets/vendor/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // ignoreRestSiblings: `const { removed, ...rest } = obj` drops a field on purpose.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Tooling files run in Node.
    files: ['*.config.js', 'test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
];
