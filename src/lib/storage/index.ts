/**
 * Document storage on Supabase Storage, over the REST API.
 *
 * Deliberately not @supabase/supabase-js: constructing that client also
 * constructs a realtime client, which needs a global WebSocket that Node 20
 * does not provide, and it throws before a single byte is uploaded. Storage is
 * a handful of plain HTTP calls, so this uses fetch directly — no SDK, no
 * websocket, no surprise at runtime.
 *
 * The bucket is private. Reads go through short-lived signed URLs minted
 * server-side after the caller has been checked, so a leaked path is not a
 * leaked document.
 *
 * Object keys are `<organisationId>/<invoiceId>/<filename>`. Tenant id first
 * means deleting one document, or one tenant, is a prefix operation that cannot
 * reach anyone else's files (FR-11.2).
 */

const BUCKET = "documents";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const storageConfigured = Boolean(baseUrl && serviceKey);

function config() {
  if (!baseUrl || !serviceKey) {
    throw new Error(
      "Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return {
    api: `${baseUrl.replace(/\/$/, "")}/storage/v1`,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  };
}

/** Strips anything that could escape the key prefix or confuse the CDN. */
export function safeFileName(name: string) {
  const cleaned = name
    .replace(/[^\w.\- ]+/g, "")
    .replace(/[\\/]/g, "")         // [FIXED: P2 path traversal prevention]
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
  return cleaned || "document";
}

export function documentKey(organisationId: string, invoiceId: string, fileName: string) {
  return `${organisationId}/${invoiceId}/${safeFileName(fileName)}`;
}

export async function putDocument(
  key: string,
  body: Uint8Array,
  contentType: string,
) {
  const { api, headers } = config();
  const response = await fetch(`${api}/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: body as unknown as BodyInit,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${await response.text()}`);
  }
  return key;
}

/** Short-lived read URL. Default 5 minutes — long enough to open, not to share. */
export async function signedDocumentUrl(key: string, expiresInSeconds = 300) {
  const { api, headers } = config();
  const response = await fetch(`${api}/object/sign/${BUCKET}/${key}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });

  if (!response.ok) {
    throw new Error(`Could not sign URL (${response.status}): ${await response.text()}`);
  }

  const { signedURL } = (await response.json()) as { signedURL: string };
  return `${api}${signedURL.startsWith("/") ? "" : "/"}${signedURL}`;
}

/** Removes every object under a prefix. Used when a document is deleted. */
export async function removeDocumentPrefix(prefix: string) {
  const { api, headers } = config();

  // Paginate through all objects under this prefix — a single list call is
  // capped and a tenant with many documents can easily have more entries than
  // one page returns.
  const LIMIT = 100;
  let offset = 0;
  let totalRemoved = 0;

  while (true) {
    const listed = await fetch(`${api}/object/list/${BUCKET}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: LIMIT, offset }),
    });

    if (!listed.ok) {
      throw new Error(`Could not list ${prefix} (${listed.status}): ${await listed.text()}`);
    }

    const entries = (await listed.json()) as { name: string }[];
    if (!entries.length) break;

    const prefixes = entries.map((entry) => `${prefix}/${entry.name}`);
    const removed = await fetch(`${api}/object/${BUCKET}`, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes }),
    });

    if (!removed.ok) {
      throw new Error(`Could not remove ${prefix} (${removed.status}): ${await removed.text()}`);
    }

    totalRemoved += prefixes.length;
    if (entries.length < LIMIT) break;
    offset += entries.length;
  }

  return totalRemoved;
}
