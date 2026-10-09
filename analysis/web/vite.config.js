import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The application lives beside retained viewers at <project>/app/.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    host: "127.0.0.1",
    proxy: Object.fromEntries(
      ["/analysis", "/HB_BUDGET", "/pdfs"].map((path) => [
        path,
        { target: "http://127.0.0.1:8000" },
      ]),
    ),
  },
});
