const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'graphify-out/**',
            'images/**',
            'raw-images/**',
            '.lighthouseci/**',
            'playwright-report/**',
            'test-results/**'
        ]
    },

    // Frontend: native ES modules running in the browser (js/main.js is the entry point).
    {
        ...js.configs.recommended,
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                EXIF: 'readonly' // exif-js CDN global
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
            'no-var': 'error'
        }
    },

    // Build-time Node scripts (CommonJS).
    {
        ...js.configs.recommended,
        files: ['image-tools/**/*.js', 'scripts/**/*.js', 'playwright.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
            'no-var': 'error'
        }
    },

    // Playwright specs run in Node but drive a browser page.
    {
        ...js.configs.recommended,
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.browser }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
        }
    }
];
