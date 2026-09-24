import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: *.test.ts. Live API contract tests: *.contract.ts (only with CONTRACT=1).
const contract = process.env.CONTRACT === "1";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Unit tests assume mock mode even if the developer's shell exports an API URL.
    env: { NEXT_PUBLIC_API_URL: "" },
    include: contract ? ["src/**/*.contract.ts"] : ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  },
});
