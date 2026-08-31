import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService } from "../lib/objectStorage";
import { getDatabaseImage } from "../lib/databaseImageStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Portable public image route used by deployments that cannot reach the
 * Replit Object Storage sidecar (for example the existing Render API).
 */
router.get("/storage/db-images/:imageId", async (req: Request, res: Response) => {
  try {
    const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;
    if (!/^[0-9a-f-]{36}$/i.test(imageId)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const image = await getDatabaseImage(imageId);
    if (!image) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.data.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(image.data);
  } catch (error) {
    req.log.error({ err: error }, "Error serving database image");
    res.status(500).json({ error: "Failed to serve image" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serves public assets (uploaded menu photos, category photos, etc.) from
 * PUBLIC_OBJECT_SEARCH_PATHS. Unconditionally public — no authentication or
 * ACL checks — since these are customer-facing menu images.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;
