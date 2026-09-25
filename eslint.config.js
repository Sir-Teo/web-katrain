import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.external']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Browser globals that read like local names. A resize listener meant
      // to close a menu was handed the bare `close` -- window.close -- and
      // closed the app's tab instead.
      'no-restricted-globals': [
        'error',
        { name: 'close', message: 'This is window.close; use a local function.' },
        { name: 'event', message: 'Use the handler parameter, not window.event.' },
        { name: 'name', message: 'This is window.name.' },
        { name: 'status', message: 'This is window.status.' },
      ],
    },
  },
])
