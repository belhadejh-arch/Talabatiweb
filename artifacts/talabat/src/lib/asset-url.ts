import { getBaseUrl } from "@workspace/api-client-react";

/**
 * Resolves an image/asset path returned by the API into a URL usable in
 * `<img src>`. Server-uploaded images are stored as relative paths
 * (`/api/storage/public-objects/...`); in a split-domain deployment
 * (frontend and backend on different hosts) those must be prefixed with the
 * API's base URL. Absolute URLs (external image links, legacy data) pass
 * through untouched.
 */
export function getAssetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  const base = getBaseUrl();
  return base ? `${base}${path}` : path;
}
