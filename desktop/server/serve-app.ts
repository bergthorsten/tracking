const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

function contentType(pathname: string) {
  const extension = pathname.match(/\.[^.]+$/)?.[0]

  return extension ? mimeTypes[extension] : undefined
}

async function readDistFile(distRoot: URL, pathname: string) {
  const safePath = pathname.replace(/^\/+/, "")
  const fileUrl = new URL(safePath || "index.html", distRoot)

  if (!fileUrl.href.startsWith(distRoot.href)) {
    return null
  }

  try {
    return await Deno.readFile(fileUrl)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null
    }

    throw error
  }
}

export async function serveStaticApp(pathname: string, distRoot: URL) {
  const assetPath = pathname === "/" ? "index.html" : pathname
  const asset = await readDistFile(distRoot, assetPath)

  if (asset) {
    return new Response(asset, {
      headers: {
        "content-type": contentType(assetPath) ?? "application/octet-stream",
      },
    })
  }

  const index = await readDistFile(distRoot, "index.html")

  if (!index) {
    return new Response("Run `npm run build` before starting Deno Desktop.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  }

  return new Response(index, {
    headers: { "content-type": mimeTypes[".html"] },
  })
}
