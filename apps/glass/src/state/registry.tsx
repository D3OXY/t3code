import { RegistryContext } from "@effect/atom-react";
import { AtomRegistry } from "effect/reactivity";
import type { PropsWithChildren } from "react";

/** Module-level so non-React code (commands, keybindings) can read and refresh atoms. */
export const appAtomRegistry = AtomRegistry.make();

export function AppAtomRegistryProvider({ children }: PropsWithChildren) {
  return <RegistryContext.Provider value={appAtomRegistry}>{children}</RegistryContext.Provider>;
}
