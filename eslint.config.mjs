import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "out/**",
      ".qa-site/**",
      ".static-build-*/**",
      ".npm-cache/**",
      "docs/design/**"
    ]
  }
];

export default eslintConfig;
