import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    ignores: ["eslint.config.mjs"], // Ignore the config file itself
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs",
      ecmaVersion: "latest"
    },
    plugins: {
      prettier
    },
    rules: {
      ...prettierConfig.rules,
      "prettier/prettier": "error",
      "no-unused-vars": "warn",
      "no-console": "off"
    }
  },
  {
    // Separate config for the ESLint config file itself
    files: ["eslint.config.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest"
    }
  }
];
