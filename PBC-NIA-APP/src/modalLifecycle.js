let activeDialogs = 0, originalOverflow = '';

// A PDF can sit above an evidence dialog. Restore scrolling only after every
// dialog closes, even when route changes unmount them in a different order.
export function openModalDialog(element, returnFocus = document.activeElement) {
  element.showModal();
  if (activeDialogs === 0) originalOverflow = document.body.style.overflow;
  activeDialogs++;
  document.body.style.overflow = 'hidden';
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    element.close();
    activeDialogs--;
    if (activeDialogs === 0) document.body.style.overflow = originalOverflow;
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
  };
}
