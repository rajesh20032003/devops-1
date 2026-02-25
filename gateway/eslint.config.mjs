import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["eslint.config.mjs"]   // ✅ ignore config file
  },

  js.configs.recommended,

  {
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs"
    }
  }
];