export type RouteHandler = (request: Request) => Response | Promise<Response>

export interface DesktopRoute {
  path: string
  handler: RouteHandler
}

export function createRouteHandler({
  routes,
  staticHandler,
}: {
  routes: DesktopRoute[]
  staticHandler: (pathname: string) => Response | Promise<Response>
}) {
  const handlers = new Map(routes.map((route) => [route.path, route.handler]))

  return (request: Request) => {
    const url = new URL(request.url)
    const pathname = decodeURIComponent(url.pathname)
    const handler = handlers.get(pathname)

    return handler ? handler(request) : staticHandler(pathname)
  }
}
