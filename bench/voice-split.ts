/** Samples whose id hashes into the last fifth are held back from the voice baseline's reference set. */
export function heldBack(id: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 5 === 0;
}
