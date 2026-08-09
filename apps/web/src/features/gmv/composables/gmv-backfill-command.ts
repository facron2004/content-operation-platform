/**
 * Dispatch a user-selected GMV backfill only while no other backfill is active.
 * The lifecycle composable keeps the same guard on the request side; this
 * boundary keeps the menu state and emitted command honest as well.
 */
export function dispatchGmvBackfillCommand<T>(
  backfilling: boolean,
  payload: T,
  close: () => void,
  emit: (payload: T) => void
): boolean {
  if (backfilling) return false;
  close();
  emit(payload);
  return true;
}
