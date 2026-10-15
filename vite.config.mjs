import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1100 },
});
