// The existing quick challenge owns this key and its own versioned decoder.
export const quickSaveKey = 'campus-chaos-p1';

export function hasQuickSave() {
  try { return Boolean(localStorage.getItem(quickSaveKey)); }
  catch { return false; }
}
