// PDF.js can reject inside its worker if Terminate arrives while the document
// manager is still initializing. Let document initialization settle before
// destroying it; callers mark their effect inactive immediately, so a closed
// viewer never renders or updates state while this cleanup is pending.
export function disposePdfLoadingTask(task) {
  return task.promise.then(() => task.destroy(), () => task.destroy()).catch(() => {});
}
