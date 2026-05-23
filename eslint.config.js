import typescriptEslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
    {
        ignores: ['node_modules/', 'dist/', '*.js']
    },
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
                project: './tsconfig.json'
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                Promise: 'readonly',
                Map: 'readonly',
                Set: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                Blob: 'readonly',
                Buffer: 'readonly',
                Date: 'readonly',
                Math: 'readonly',
                JSON: 'readonly',
                Error: 'readonly',
                HTMLElement: 'readonly',
                DragEvent: 'readonly',
                MouseEvent: 'readonly',
                KeyboardEvent: 'readonly',
                Event: 'readonly',
                EventTarget: 'readonly',
                Node: 'readonly',
                Element: 'readonly',
                HTMLInputElement: 'readonly',
                HTMLTextAreaElement: 'readonly',
                HTMLSelectElement: 'readonly',
                HTMLDivElement: 'readonly',
                HTMLButtonElement: 'readonly',
                HTMLIFrameElement: 'readonly',
                HTMLImageElement: 'readonly',
                HTMLDetailsElement: 'readonly',
                HTMLElementEventMap: 'readonly',
                React: 'readonly',
                JSX: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': typescriptEslint,
            react,
            'react-hooks': reactHooks
        },
        rules: {
            // React
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',

            // TypeScript strict
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/prefer-as-const': 'error',
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',

            // General strict
            'no-console': 'warn',
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'semi': ['error', 'never'],
            'quotes': ['error', 'single', { avoidEscape: true }],
            'indent': ['error', 4],
            'comma-dangle': ['error', 'never'],
            'no-trailing-spaces': 'error',
            'eol-last': 'error',
            'no-empty': 'error',
            'no-useless-escape': 'error',
            'no-useless-rename': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
            'no-duplicate-imports': 'error',
            'no-unreachable': 'error',
            'no-constant-binary-expression': 'error',
            'no-promise-executor-return': 'error',
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unreachable-loop': 'error',
            'require-atomic-updates': 'error'
        }
    }
]
