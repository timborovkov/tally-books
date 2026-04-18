import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "node_modules/**",
  ]),
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-implicit-coercion": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": ["error", "always"],
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      // UTC-only policy: block patterns that leak the host timezone or
      // bypass the helpers in src/lib/dates.ts. See docs/architecture/dates.md.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/]",
          message:
            "Do not use toLocale* — it depends on the host timezone. Use helpers from @/lib/dates instead.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:
            "Do not use Date.now() — use nowUtcMs() from @/lib/dates for wall-clock time, or performance.now() for elapsed timing.",
        },
      ],
    },
  },
  // The dates module is the single sanctioned location for raw Date / Intl
  // use; test files need Date.now() and Date constructors for fixtures.
  {
    files: ["src/lib/dates.ts", "**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Vendor-style files maintained by shadcn CLI — don't fight upstream idioms.
  {
    files: ["src/components/ui/**", "src/hooks/use-mobile.ts"],
    rules: {
      "no-implicit-coercion": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  prettier,
]);

export default eslintConfig;
