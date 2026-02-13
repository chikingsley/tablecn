const MAILS_CHANGED_EVENT = "mails:changed";

export function emitMailsChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(MAILS_CHANGED_EVENT));
}

export function subscribeToMailsChanged(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(MAILS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(MAILS_CHANGED_EVENT, callback);
}
