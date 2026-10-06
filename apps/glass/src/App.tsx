import { RouterProvider } from "@tanstack/react-router";
import { useState } from "react";

import { PairScreen } from "./components/shell/PairScreen";
import type { AuthGateState } from "./connection/auth";
import { router } from "./router";
import { AppAtomRegistryProvider } from "./state/registry";

/** Owns the auth gate. Nothing below the gate touches the connection runtime until paired. */
export function App({ initialGate }: { readonly initialGate: AuthGateState }) {
  const [gate, setGate] = useState(initialGate);

  if (gate.status !== "authenticated") {
    return (
      <PairScreen
        initialError={gate.errorMessage ?? null}
        onPaired={() => setGate({ status: "authenticated" })}
      />
    );
  }

  return (
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
    </AppAtomRegistryProvider>
  );
}
