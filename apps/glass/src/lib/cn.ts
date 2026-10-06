/** Joins truthy class names. Primitives own their look, so no merge logic is needed. */
export function cn(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
