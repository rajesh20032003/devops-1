// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";
import jest from "eslint-plugin-jest";
import prettier from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  // 1. Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "*.config.mjs",
      "*.config.js",
      "*.test.js" // optional
    ]
  },

  // 2. JavaScript recommended rules
  js.configs.recommended,

  // 3. Node.js environment
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021
      },
      sourceType: "commonjs",
      ecmaVersion: 2022
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": "warn",
      "semi": ["error", "always"],
      "quotes": ["error", "single"],
      "indent": ["error", 2]
    }
  },

  // 4. Jest for test files
  {
    files: ["**/*.test.js", "**/__tests__/**/*.js"],
    plugins: { jest },
    languageOptions: {
      globals: globals.jest
    },
    rules: {
      ...jest.configs["flat/recommended"].rules,
      "jest/no-disabled-tests": "warn",
      "jest/valid-expect": "error"
    }
  },

  // 5. Prettier integration (must come LAST!)
  eslintConfigPrettier,
  {
    plugins: { prettier },
    rules: {
      "prettier/prettier": "error"
    }
  }
];