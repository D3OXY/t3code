import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";

import { App } from "./App";
import { resolveAuthGate } from "./connection/auth";
import { syncAppearanceToDocument } from "./stores/appearance";

syncAppearanceToDocument();

// Resolve auth before the first commit so the boot splash holds until we know
// whether to show the app or the pairing screen. No connection atom mounts
// until the gate says authenticated, so the socket never backs off on 401s.
void resolveAuthGate().then((gate) => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App initialGate={gate} />
    </React.StrictMode>,
  );
});
