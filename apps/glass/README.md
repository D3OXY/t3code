# T3 Glass

A second client for the T3 server with a wallpaper-and-frosted-glass layout:
an attention-sorted session sidebar, tabs, a centered new-session canvas, and
an agent-updates pill. It talks to the same WebSocket API as `apps/web` through
`@t3tools/client-runtime`, so it needs no server changes.

## Run it

Start a server (and the regular web app) first, then Glass next to it:

```bash
vp run dev            # server on 13773, web on 5733 (read the real ports from [dev-runner])
vp run dev:glass      # Glass on 5833, proxying /api, /ws, /oauth, /.well-known to T3CODE_PORT
```

If the dev runner picked a different server port, pass it through:
`T3CODE_PORT=<port> GLASS_PORT=5833 vp run dev:glass`.

Pairing: open the server's startup pairing URL with Glass's origin, e.g.
`http://localhost:5833/pair#token=…`. Session cookies ignore ports, so a
browser already paired with the web app on the same hostname is signed in.

## Scope

Supported: the same-origin server plus bearer-paired remote servers (Settings →
Environments). T3 Connect relay environments and SSH hosts need the main app.
