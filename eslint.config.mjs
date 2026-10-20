import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 安裝時複製進來的第三方檔案與測試輸出
    "public/vendor/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
