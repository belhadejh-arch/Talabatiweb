import { randomUUID } from "crypto";
import sharp from "sharp";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import {
  deleteDatabaseImage,
  saveDatabaseImage,
} from "./databaseImageStorage";

const objectStorageService = new ObjectStorageService();

// Public URL prefix under which uploaded images are served back to clients.
// Kept as a constant so we can recognize (and later delete) our own objects.
export const PUBLIC_IMAGE_URL_PREFIX = "/api/storage/public-objects/";
export const DATABASE_IMAGE_URL_PREFIX = "/api/storage/db-images/";

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid object path: must contain at least a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

export type ImageFolder = "products" | "categories" | "restaurants" | "drivers";

/**
 * Thrown when the uploaded file itself is not a valid/decodable image
 * (corrupt data, truncated upload, or an unsupported format that slipped
 * past the mimetype filter). Callers should surface this as a 400, unlike
 * other failures in this module (storage/network) which are server errors.
 */
export class InvalidImageError extends Error {
  constructor(message = "الملف المرفوع ليس صورة صالحة أو أنه تالف") {
    super(message);
    this.name = "InvalidImageError";
  }
}

/**
 * Processes a raw uploaded image buffer (resize + compress + convert to
 * WebP) and writes the result directly into the public object storage
 * bucket. Returns the public URL to store in Postgres (never the image
 * bytes themselves) plus the relative object path (used for later deletion).
 */
export async function processAndStoreImage(
  buffer: Buffer,
  folder: ImageFolder,
): Promise<{ url: string; objectPath: string }> {
  let processed: Buffer;
  try {
    processed = await sharp(buffer)
      .rotate() // respect EXIF orientation, then strip it
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    // sharp throws plain Errors for undecodable input (corrupt/truncated
    // files, unsupported formats) — treat any decode/encode failure here
    // as a client-side "invalid image" rather than a server bug.
    throw new InvalidImageError();
  }

  const objectPath = `${folder}/${randomUUID()}.webp`;
  const canUseReplitObjectStorage = Boolean(
    process.env.PUBLIC_OBJECT_SEARCH_PATHS &&
      (process.env.REPL_ID ||
        process.env.REPLIT_DEPLOYMENT ||
        process.env.REPLIT_DEV_DOMAIN ||
        process.env.REPLIT_DOMAINS),
  );

  if (canUseReplitObjectStorage) {
    try {
      const searchPaths = objectStorageService.getPublicObjectSearchPaths();
      const fullPath = `${searchPaths[0]}/${objectPath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      const file = objectStorageClient.bucket(bucketName).file(objectName);
      await file.save(processed, {
        contentType: "image/webp",
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
      });

      return { url: `${PUBLIC_IMAGE_URL_PREFIX}${objectPath}`, objectPath };
    } catch (error) {
      // A sidecar or bucket outage must not make the public Render API
      // unusable. The processed bytes are safe to persist in the fallback.
      logger.warn({ err: error, folder }, "Object Storage unavailable; using database image storage");
    }
  }

  const databaseImageId = await saveDatabaseImage(processed, "image/webp", folder);
  return {
    url: `${DATABASE_IMAGE_URL_PREFIX}${databaseImageId}`,
    objectPath: databaseImageId,
  };
}

/**
 * Best-effort delete of a previously stored image, given the public URL
 * that was persisted in Postgres. Silently no-ops for URLs that were not
 * produced by this module (e.g. legacy external image URLs), and never
 * throws — deletion failures must never block product/category mutations.
 */
export async function deleteStoredImage(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(PUBLIC_IMAGE_URL_PREFIX)) return;

  try {
    const objectPath = url.slice(PUBLIC_IMAGE_URL_PREFIX.length);
    const searchPaths = objectStorageService.getPublicObjectSearchPaths();
    const fullPath = `${searchPaths[0]}/${objectPath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  } catch (err) {
    logger.warn({ err, url }, "Failed to delete stored image (non-blocking)");
  }
}

/**
 * Deletes a database-backed image. Kept separate from deleteStoredImage so
 * legacy Object Storage URLs retain their existing best-effort behavior.
 */
export async function deleteDatabaseStoredImage(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(DATABASE_IMAGE_URL_PREFIX)) return;

  try {
    await deleteDatabaseImage(url.slice(DATABASE_IMAGE_URL_PREFIX.length));
  } catch (err) {
    logger.warn({ err, url }, "Failed to delete database image (non-blocking)");
  }
}
