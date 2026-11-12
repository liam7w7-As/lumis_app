const listeners = new Set<() => void>();
export function subscribeLicenseChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function notifyLicenseChange() {
  listeners.forEach((listener) => listener());
}
