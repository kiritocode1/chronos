import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import * as NodePath from "node:path"

// Where the built Vite SPA lives. In the Docker image the frontend is built
// into `web/dist` next to the source tree; override with STATIC_DIR if needed.
const STATIC_DIR = Bun.env.STATIC_DIR
  ? NodePath.resolve(Bun.env.STATIC_DIR)
  : NodePath.resolve(import.meta.dir, "../../web/dist")

const INDEX_HTML = NodePath.join(STATIC_DIR, "index.html")

// The SPA shell. Client-side routes (e.g. /jobs/:id) and unknown asset paths
// all fall back to this so React Router can take over.
const serveIndex = HttpServerResponse.file(INDEX_HTML)

// Resolve a request path to a file inside STATIC_DIR, rejecting traversal.
const resolveSafe = (pathname: string): string | null => {
  const candidate = NodePath.join(STATIC_DIR, NodePath.normalize(pathname))
  return candidate.startsWith(STATIC_DIR) ? candidate : null
}

// Catch-all GET handler, mounted last. find-my-way ranks "*" below every
// concrete API route, so this only runs for non-API GETs.
export const spaRoutes = HttpRouter.empty.pipe(
  HttpRouter.get(
    "*",
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      )

      // An unmatched /api/* GET is a real 404 — never serve the SPA shell for it.
      if (pathname.startsWith("/api")) {
        return yield* HttpServerResponse.json(
          { error: "Not Found" },
          { status: 404 },
        )
      }

      if (pathname === "/" || pathname === "") {
        return yield* serveIndex
      }

      const target = resolveSafe(pathname)
      if (target === null) return yield* serveIndex

      // Serve the static file; missing files fall back to the SPA shell.
      return yield* HttpServerResponse.file(target).pipe(
        Effect.catchAll(() => serveIndex),
      )
    }).pipe(
      // If even index.html is missing, the frontend wasn't built into the image.
      Effect.catchAll(() =>
        HttpServerResponse.text("Frontend build not found", { status: 500 }),
      ),
    ),
  ),
)
