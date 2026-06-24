import path from "node:path";
import { defineConfig } from "vitest/config";

const fromRoot = (p: string) => path.resolve(process.cwd(), p);

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws when imported outside an RSC graph; stub it for tests.
      "server-only": fromRoot("src/test/empty.ts"),
      // Mirror the tsconfig `@/*` path alias.
      "@": fromRoot("src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Point the readers at the committed fixture set so the suite is hermetic
    // (the real data/ dir is gitignored and absent on a fresh clone).
    env: {
      TRADING_DATA_DIR: fromRoot("src/test/fixtures"),
    },
  },
});
