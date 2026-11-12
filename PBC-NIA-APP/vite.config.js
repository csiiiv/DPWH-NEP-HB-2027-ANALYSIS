import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dedicated NIA browser. Served from the repository root in dev so the
// retained evidence (analysis-nia data + PDFs + the Senate workbook) resolves
// with plain origin-rooted paths; the built bundle is packaged self-contained
// (scripts/package.mjs copies the evidence next to it).
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const MIME = {
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".webp": "image/webp",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".geojson": "application/geo+json",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// Repository directories this app is allowed to serve read-only in dev.
const served = [
  ["/analysis-nia/", [root + "/analysis-nia"]],
  ["/HB_BUDGET/", [root + "/HB_BUDGET"]],
  ["/dbm-other-nep-line-data/", [root + "/dbm-other-nep-line-data"]],
  ["/NIA_DATA/", [root + "/NIA_DATA"]],
  ["/disclaimer/", [root + "/disclaimer"]],
];

function retainedRepoFiles() {
  return {
    name: "retained-nia-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname;
        try {
          pathname = decodeURIComponent(
            new URL(req.url, "http://localhost").pathname,
          );
        } catch {
          return next();
        }
        const route = served.find(([prefix]) => pathname.startsWith(prefix));
        if (!route) return next();
        const suffix = pathname.slice(route[0].length) || "index.html";
        const [dir, file] = route[1]
          .map((d) => [d, path.resolve(d, suffix)])
          .find(
            ([d, f]) =>
              f.startsWith(d + path.sep) &&
              fs.existsSync(f) &&
              fs.statSync(f).isFile(),
          ) ?? [null, null];
        if (!file) return next();
        const size = fs.statSync(file).size;
        res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
        res.setHeader("Accept-Ranges", "bytes");
        let start = 0, end = size - 1;
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            return res.end();
          }
          start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
          if (start > end || start >= size) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            return res.end();
          }
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        }
        res.setHeader("Content-Length", end - start + 1);
        if (req.method === "HEAD") return res.end();
        const stream = fs.createReadStream(file, { start, end });
        res.on("close", () => stream.destroy());
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), retainedRepoFiles()],
  build: { outDir: "dist" },
  server: {
    host: "127.0.0.1",
    // Distinct default from the main workbench (5173): this app always
    // prefers 5180 so the two dev servers never masquerade as each other.
    port: 5180,
    headers: { "Cache-Control": "no-store" },
  },
});
