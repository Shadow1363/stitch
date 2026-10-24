# Network, secrets and CORS

How `http_get` / `http_post` and extension HTTP reach the web, what the browser allows, and how secrets are kept out of carts. The rules are in [`CLAUDE.md`](../CLAUDE.md) (rule 11) and the language-level differences in [`departures.md`](departures.md) (D19–D22).

## How a request travels

```
script: http_get(url)         stage (sandboxed iframe)           editor (page origin)
  thread waits  ───────────►  BridgeNet posts {t:'http'}  ─────►  NetProxy.handle
                                                                     1. http/https, GET/POST only
                                                                     2. ask once per host (per cart)
                                                                     3. add secrets for that host
                                                                     4. fetch: 10 s, 1 MB, 8 at once,
                                                                        no cookies
                                                                     5. scrub secrets from the reply
  thread resumes ◄─────────  {t:'http-result'}  ◄──────────────────  {status, body}
```

- The stage can't fetch at all: production builds give `stage.html` a Content-Security-Policy with `connect-src 'none'`. This applies to extension code too. (Dev builds skip it, because Vite's HMR client needs a websocket.)
- A failed request reports `http_status()` = 0 and an empty body. The console says why: not allowed, offline, CORS, a timeout, or a reply that was too large.
- Replies land between ticks. The waiting script resumes on the next tick at its usual place in the order, and other scripts keep running meanwhile (D20).

## Host permission

The first request to a host asks *"This cart wants to connect to api.example.com"*. The answer applies to the cart being edited:

- Allowed hosts are stored next to the autosave (`autosave-hosts` in IndexedDB), **not in the cart**, so a cart file can't grant itself access.
- Opening another cart (file, URL, sample or new) starts with no hosts. **Cart → Network and secrets** lists the allowed hosts and can revoke them.
- Denials last until the editor reloads.

## Secrets

**Cart → Network and secrets** stores API keys in this browser only (IndexedDB key `secrets`, in the editor's origin). They are never written to carts, sessions or exports. Each secret has:

| Field | Meaning |
|---|---|
| Name | Used as `{{NAME}}` in a request URL (URL-encoded) or body (as is) |
| Value | The key itself |
| Hosts | Where it may be sent: `api.example.com` or `*.example.com`. With no hosts it is never sent |
| Header | Optional. Added to *every* request to an allowed host, e.g. `Authorization` with template `Bearer {value}` |

Rules the proxy enforces:

- A `{{NAME}}` for an unknown secret, or for a secret that doesn't allow the request's host, refuses the whole request. A cart can't steer a key to another server.
- Requests that carry a secret don't follow redirects, because a redirect could take an added header to another host.
- Secret values (raw and URL-encoded) are replaced with `•••` in replies and error messages before the stage sees them.
- Code never names a header secret: the editor adds it for allowed hosts, so the script just calls `http_get("https://api.example.com/…")`.

What secrets **don't** protect against: a cart you've allowed to reach a host can use your key there, for example spending your API quota. Only allow hosts you expect a cart to use. A server that transforms a key before echoing it (base64, say) defeats the scrubbing.

The linter warns about string literals that look like keys (`sk-…`, `ghp_…`, `AKIA…`, `AIza…`, `xox?-…`, `Bearer …`, private-key headers, and long random tokens), because carts are shared as files.

## CORS in the browser

The editor fetches from its own origin (for example `https://stitch.example` or `http://localhost:5173`). Browsers only hand back a cross-origin reply when the server opts in with `Access-Control-Allow-Origin`, so:

- **Works:** public APIs that send `Access-Control-Allow-Origin: *` (or the editor's origin). Many open-data, weather and game-backend APIs do.
- **Fails as status 0:** APIs that don't send the header. The request may still reach the server, but the browser hides the reply.
- `POST` with a JSON body goes out as `Content-Type: application/json`, and any secret header makes it a "non-simple" request. The browser then sends an `OPTIONS` preflight first, and the server must answer it with `Access-Control-Allow-Headers` covering `Content-Type` and the secret's header.
- Cookies are never sent (`credentials: 'omit'`), so being logged in to a site in the same browser gives a cart no access to it.

There is no way around CORS from a web page; the proxy runs in the same browser. The options are an API that allows it, your own small relay server that adds the header, or the desktop build.

## Desktop (Tauri)

Both the editor ([`desktop/`](../desktop/README.md)) and exported desktop games ([export.md](export.md#desktop-app)) are Tauri 2 apps whose requests go through Tauri's HTTP plugin, which makes them from the native side:

- **No CORS:** any API works, as with `curl`.
- The capability file holds a URL allow-list (`http:default` scope). Requests outside it fail even after the user allows the host. The editor's allows every http(s) URL, because it asks per host itself; an exported game's allows the origins its code names.
- Code picks the plugin up as `window.__TAURI__.http.fetch` (`nativeFetch` in `editor/src/lib/net.ts` and the player) and passes it to `FetchNet`.
- In the editor, secrets live in the app's own webview storage instead of your browser's.

Host prompts, secret host rules, scrubbing and the stage CSP are the same as in the browser.

## Exported players

An exported player has no editor around it. It asks the player once per host (per page load) and fetches directly with the runtime's `FetchNet`, the same class the editor's proxy builds on, with the same limits but **no secrets**: secrets belong to the person editing, not to everyone who plays the export. A game that needs a key in its export needs a relay server that holds the key.

- The player's CSP allows `connect-src http: https:` instead of `'none'`.
- A single HTML file opened from disk sends `Origin: null`, so only APIs that answer `Access-Control-Allow-Origin: *` work there. Hosted, the page's own origin applies.
