import react from "@vitejs/plugin-react";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Next turns `import photo from "./x.jpg"` into { src, width, height }; Vite
 * would give a bare URL string, which next/image rejects. Stand in for Next's
 * loader in tests.
 */
function staticImages(): Plugin {
  return {
    name: "next-static-images",
    enforce: "pre",
    load(id) {
      if (!/\.(png|jpe?g|webp)$/.test(id)) return null;
      const src = `/images/${basename(id)}`;
      return `export default ${JSON.stringify({ src, width: 1200, height: 1500 })};`;
    },
  };
}

export default defineConfig({
  plugins: [staticImages(), react()],
  resolve: {
    tsconfigPaths: true,
    // Server modules (e.g. lib/notify.ts) are reachable from pages under test.
    alias: { "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
