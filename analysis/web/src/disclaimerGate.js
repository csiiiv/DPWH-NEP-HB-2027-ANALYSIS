// A versioned, browser-only acknowledgement. Increment the version when
// materially changing the notice so previous visitors are shown the new one.
export const DISCLAIMER_ACK_KEY = 'fy2027-budget-workbenches:disclaimer:v2';
export const DISCLAIMER_ACK_VALUE = 'acknowledged';

export function disclaimerAcknowledged(storage) {
  try {
    return storage?.getItem(DISCLAIMER_ACK_KEY) === DISCLAIMER_ACK_VALUE;
  } catch {
    return false; // Blocked storage: show the notice again rather than guessing.
  }
}

export function acknowledgeDisclaimer(storage) {
  try {
    storage?.setItem(DISCLAIMER_ACK_KEY, DISCLAIMER_ACK_VALUE);
    return Boolean(storage);
  } catch {
    return false; // Allow this visit, but never claim the choice was saved.
  }
}
