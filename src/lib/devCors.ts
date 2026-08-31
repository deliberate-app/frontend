/**
 * Cross-origin access for the deployment's API routes.
 *
 * The hosted app calls these same-origin, where CORS does not apply at all. Local dev servers
 * (`just dev-testnet`) point at the deployment and arrive cross-origin, so loopback origins are
 * reflected - and only loopback: anything wider would let arbitrary websites drive the routes
 * (and the quotas behind them).
 *
 * Shared rather than copied per route: two routes drifting apart on which origins they trust is
 * how one of them ends up open.
 */
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  return origin !== null && DEV_ORIGIN.test(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}
