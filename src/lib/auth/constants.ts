/**
 * Runtime-agnostic auth constants.
 *
 * Kept free of Node built-ins so the Edge middleware can import the cookie name
 * without dragging node:crypto (and therefore all of session.ts) into the Edge
 * bundle.
 */
export const SESSION_COOKIE = "finscanix_session";

export const SESSION_TTL_DAYS = 7;
