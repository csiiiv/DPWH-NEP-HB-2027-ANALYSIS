import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { legacyRoutes } from "./src/routes.js";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
// Serve retained files directly in development, including PDF range requests.
// Production continues to use the packaged static assets on GitHub Pages.
function retainedFiles() {
  return {
    name: "retained-workbench-files",
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
        const verification = pathname.match(/^\/analysis\/verification_(hb|nep|dpwh_nep_api)\.json$/);
        if (verification) {
          const files = { hb: "hb_native_verification.html", nep: "nep_source_verification.html", dpwh_nep_api: "dpwh_nep_api_verification.html" };
          const html = fs.readFileSync(root + "/analysis/viewers/" + files[verification[1]], "utf8");
          const data = html.match(/<script id="sourceData" type="application\/json">([\s\S]*?)<\/script>/)[1];
          res.setHeader("Content-Type", "application/json"); res.end(data); return;
        }
        const oldPage = pathname.split("/").pop();
        if (legacyRoutes[oldPage] && (pathname.startsWith("/analysis/") || pathname.startsWith("/legacy/") || pathname.startsWith("/site/"))) {
          const destination = "/#" + legacyRoutes[oldPage];
          res.setHeader("Content-Type", "text/html");
          res.end(`<!doctype html><title>Opening workbench</title><a href="${destination}">Open workbench</a><script>const fragment=location.hash.slice(1);location.replace(${JSON.stringify(destination)}+(fragment ? "?"+(fragment==="review" ? "view=review" : "section="+encodeURIComponent(fragment)) : ""));</script>`);
          return;
        }
        const routes = [
          [
            "/analysis/",
            [
              root + "/analysis/data",
              root + "/_site/analysis",
              root + "/analysis/viewers",
              root + "/dpwh-transparency-nep-data/json",
            ],
          ],
          ["/pdfs/", [root + "/dbm-nep-data"]],
          ["/HB_BUDGET/", [root + "/HB_BUDGET"]],
          ["/HB_BUDGET_3rd_reading/", [root + "/HB_BUDGET_3rd_reading"]],
          ["/legacy/", [root + "/_site"]],
        ];
        const route = routes.find(([prefix]) => pathname.startsWith(prefix));
        if (!route) return next();
        const suffix = pathname.slice(route[0].length);
        const target = route[1]
          .map((dir) => [dir, path.resolve(dir, suffix)])
          .find(
            ([dir, file]) =>
              file.startsWith(dir + path.sep) &&
              fs.existsSync(file) &&
              fs.statSync(file).isFile(),
          );
        if (!target) return next();
        const file = target[1],
          size = fs.statSync(file).size;
        res.setHeader(
          "Content-Type",
          {
            ".pdf": "application/pdf",
            ".json": "application/json",
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".mjs": "application/javascript",
            ".webp": "image/webp",
          }[path.extname(file)] || "application/octet-stream",
        );
        res.setHeader("Accept-Ranges", "bytes");
        let start = 0,
          end = size - 1;
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            return res.end();
          }
          start = match[1]
            ? Number(match[1])
            : Math.max(0, size - Number(match[2]));
          end =
            match[1] && match[2]
              ? Math.min(Number(match[2]), size - 1)
              : size - 1;
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
  plugins: [react(), retainedFiles()],
  build: { outDir: "dist" },
  server: { host: "127.0.0.1" },
});
