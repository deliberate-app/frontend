/**
 * Cross-origin access for the deployment's API routes.
 *
 * The hosted app calls these same-origin, where CORS does not apply at all. Local dev servers
 * (`just dev-testnet`) point at the deployment and arrive cross-origin, so loopback origins are
 * reflected - and only loopback.
 *
 * What this does NOT do is stop another site calling these routes. CORS governs whether the
 * browser hands the *response* back to the calling page, not whether the request is delivered:
 * a `multipart/form-data` POST is a CORS-safelisted request, so no preflight fires and the
 * upload completes whether or not these headers come back. An attacker driving the pin proxy
 * from their own page never needed to read the response, because the CID is the hash of bytes
 * they already hold. Withholding these headers is therefore a privacy measure, not a gate - the
 * gate has to be in the route.
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
