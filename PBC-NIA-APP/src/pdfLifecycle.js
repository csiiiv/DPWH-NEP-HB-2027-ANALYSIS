// PDF.js can reject inside its worker if Terminate arrives while the document
// manager is still initializing. Let document initialization settle before
// destroying it; callers mark their effect inactive immediately, so a closed
// viewer never renders or updates state while this cleanup is pending.
export function disposePdfLoadingTask(task) {
  return task.promise.then(() => task.destroy(), () => task.destroy()).catch(() => {});
}

// Destroying a PDF document aborts its in-flight range fetches. Chromium
// raises those intentional aborts as unhandled promise rejections ("signal
// is aborted without reason"), which the browser checks treat as page
// errors. Mark exactly those teardown signatures as handled; every other
// rejection still surfaces.
const PDF_TEARDOWN_REJECTIONS = [
  'signal is aborted without reason', // fetch() aborted via AbortController
  'Worker was destroyed',             // pdf.js worker terminated mid-task
  'Transport destroyed',              // pdf.js message handler torn down
  'Loading aborted',                  // getDocument() promise cancelled
];
if (typeof window !== 'undefined' && !window.__pdfTeardownGuard) {
  window.addEventListener('unhandledrejection', event => {
    const message = String(event.reason?.message ?? event.reason ?? '');
    if (PDF_TEARDOWN_REJECTIONS.some(signature => message.includes(signature)))
      event.preventDefault();
  });
  window.__pdfTeardownGuard = true;
}
