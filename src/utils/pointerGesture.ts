/**
 * The gesture in flight for this pointer, or null.
 *
 * `ref.current?.pointerId === event.pointerId` reads as a null check but is not
 * one: with nothing in flight it compares `undefined` against the event's id,
 * which any event carrying no pointerId satisfies. Callers then dereferenced
 * null — a stray `pointerup` took the whole board into the error boundary.
 */
export function gestureForPointer<T extends { pointerId: number }>(
  gesture: T | null | undefined,
  pointerId: number
): T | null {
  if (!gesture) return null;
  return gesture.pointerId === pointerId ? gesture : null;
}
