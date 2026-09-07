import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next sets settings.react.version to "detect", which makes
    // eslint-plugin-react@7.37.5 (the newest release, unpatched for ESLint 10)
    // call the removed context.getFilename() API and crash. Pin the version
    // instead so it never runs that detection path.
    settings: {
      react: {
        version: "19.2.8",
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
