import React, { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export default function PdfPreview({ source, onClose }) {
  const canvas = useRef(null),
    host = useRef(null);
  const [loaded, setLoaded] = useState(null),
    [page, setPage] = useState(source.page),
    [zoom, setZoom] = useState({ mode: "width", percent: 100 }),
    [size, setSize] = useState({ width: 600, height: 700 }),
    [revision, setRevision] = useState(0),
    [status, setStatus] = useState("Loading document…"),
    [error, setError] = useState("");
  useEffect(() => {
    setPage(source.page);
  }, [source]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let live = true;
    setLoaded(null);
    setError("");
    setStatus("Loading document…");
    const task = pdfjs.getDocument({
      url: source.url,
      isEvalSupported: false,
      disableStream: true,
      disableAutoFetch: true,
      rangeChunkSize: 65536,
    });
    task.promise
      .then((doc) => {
        if (live) setLoaded({ url: source.url, doc });
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setStatus("");
        }
      });
    return () => {
      live = false;
      task.destroy().catch(() => {});
    };
  }, [source.url]);
  useEffect(() => {
    if (!loaded || loaded.url !== source.url) return;
    let live = true,
      renderTask;
    setError("");
    setStatus(`Rendering page ${page}…`);
    (async () => {
      try {
        if (page < 1 || page > loaded.doc.numPages)
          throw new Error(`Page must be between 1 and ${loaded.doc.numPages}.`);
        const pdfPage = await loaded.doc.getPage(page);
        if (!live) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale:
            zoom.mode === "height"
              ? Math.max(0.1, (size.height - 24) / base.height)
              : zoom.mode === "width"
                ? Math.max(0.1, (size.width - 24) / base.width)
                : zoom.percent / 100,
        });
        const el = canvas.current;
        const density = Math.min(window.devicePixelRatio || 1, 2);
        el.width = Math.ceil(viewport.width * density);
        el.height = Math.ceil(viewport.height * density);
        el.style.width = `${viewport.width}px`;
        el.style.height = `${viewport.height}px`;
        renderTask = pdfPage.render({
          canvasContext: el.getContext("2d"),
          viewport,
          transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
        });
        await renderTask.promise;
        if (live) setStatus(`Page ${page} of ${loaded.doc.numPages}`);
      } catch (e) {
        if (live && e.name !== "RenderingCancelledException") {
          setError(e.message);
          setStatus("");
        }
      }
    })();
    return () => {
      live = false;
      renderTask?.cancel();
    };
  }, [loaded, source.url, page, size, zoom, revision]);
  return (
    <section className="pdf-pane" aria-labelledby="pdf-title">
      <div className="pdf-head">
        <div>
          <h2 id="pdf-title">{source.document}</h2>
          <p>{source.title}</p>
        </div>
        <button onClick={onClose}>Clear preview</button>
      </div>
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF navigation">
        <div className="group">
          <span>Page</span>
          <button
            aria-label="Previous page"
            disabled={page <= 1 || !loaded}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </button>
          <select
            aria-label="PDF page"
            value={page}
            disabled={!loaded}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {loaded ? (
              Array.from({ length: loaded.doc.numPages }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))
            ) : (
              <option value={page}>{page}</option>
            )}
          </select>
          <button
            aria-label="Next page"
            disabled={!loaded || page >= loaded.doc.numPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
          <button
            aria-label="Refresh page"
            disabled={!loaded}
            onClick={() => setRevision((r) => r + 1)}
          >
            ↻
          </button>
        </div>
        <div className="group">
          <button
            aria-pressed={zoom.mode === "width"}
            onClick={() => setZoom({ mode: "width", percent: 100 })}
          >
            Fit W
          </button>
          <button
            aria-pressed={zoom.mode === "height"}
            onClick={() => setZoom({ mode: "height", percent: 100 })}
          >
            Fit H
          </button>
          <button
            aria-label="Zoom out"
            onClick={() =>
              setZoom({
                mode: "custom",
                percent: Math.max(25, zoom.percent - 10),
              })
            }
          >
            −
          </button>
          <input
            aria-label="Zoom percent"
            type="number"
            min="25"
            max="400"
            value={zoom.percent}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 25 && n <= 400) setZoom({ mode: "custom", percent: n });
            }}
          />
          <span>%</span>
          <button
            aria-label="Zoom in"
            onClick={() =>
              setZoom({
                mode: "custom",
                percent: Math.min(400, zoom.percent + 10),
              })
            }
          >
            +
          </button>
        </div>
      </div>
      <a
        className="pdf-original"
        href={`${source.url}#page=${page}`}
        target="_blank"
        rel="noopener"
      >
        Open source PDF ↗
      </a>
      <p role="status">{status}</p>
      {error && (
        <p role="alert">
          Could not preview this page: {error}. Use the source PDF link above.
        </p>
      )}
      <div className="pdf-canvas" ref={host}>
        <canvas
          ref={canvas}
          aria-label={`PDF page ${page}`}
          hidden={!!error || !loaded || loaded.url !== source.url}
        />
      </div>
    </section>
  );
}
