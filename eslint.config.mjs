import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  {
    ignores: [
      "eslint.config.mjs",
      "src/eslint.config.ts",
      "dist/**",
      "node_modules/**",
    ],
  },
  // Standard JS rules
  eslint.configs.recommended,
  // Standard TS rules
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "no-unused-vars": "off", // Turn off base rule
      "@typescript-eslint/no-unused-vars": "warn", // Use TS-specific rule
      "no-console": "off",
    },
  }
);