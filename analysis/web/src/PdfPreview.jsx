import React, { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export default function PdfPreview({ source, onClose }) {
  const dialog = useRef(null),
    canvas = useRef(null),
    host = useRef(null);
  const [loaded, setLoaded] = useState(null),
    [page, setPage] = useState(source.page),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(600),
    [status, setStatus] = useState("Loading document…"),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    const el = dialog.current;
    const cancel = (e) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", cancel);
    return () => {
      el.removeEventListener("cancel", cancel);
      el.close();
    };
  }, []);
  useEffect(() => {
    setPage(source.page);
    setZoom(1);
  }, [source]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
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
          scale: Math.max(0.1, (width - 24) / base.width) * zoom,
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
  }, [loaded, source.url, page, width, zoom]);
  return (
    <dialog ref={dialog} className="pdf-dialog" aria-labelledby="pdf-title">
      <div className="pdf-head">
        <div>
          <h2 id="pdf-title">{source.document}</h2>
          <p>{source.title}</p>
        </div>
        <button onClick={onClose} autoFocus>
          Close preview
        </button>
      </div>
      <div className="pdf-controls">
        <button
          disabled={page <= 1 || !loaded}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous page
        </button>
        <label>
          PDF page
          <input
            aria-label="PDF page"
            type="number"
            min="1"
            max={loaded?.doc.numPages}
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (
                Number.isInteger(n) &&
                n >= 1 &&
                (!loaded || n <= loaded.doc.numPages)
              )
                setPage(n);
            }}
          />
        </label>
        <button
          disabled={!loaded || page >= loaded.doc.numPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </button>
        <label>
          Zoom
          <select
            aria-label="Zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value="1">Fit width</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>
        </label>
        <a href={`${source.url}#page=${page}`} target="_blank" rel="noopener">
          Open source PDF ↗
        </a>
      </div>
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
          hidden={!!error || !loaded}
        />
      </div>
    </dialog>
  );
}
