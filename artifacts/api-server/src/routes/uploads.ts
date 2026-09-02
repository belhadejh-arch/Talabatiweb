import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/auth";
import {
  processAndStoreImage,
  deleteStoredImage,
  deleteDatabaseStoredImage,
  InvalidImageError,
  type ImageFolder,
} from "../lib/imageUpload";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB raw upload cap
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});

const ALLOWED_FOLDERS = new Set<string>(["products", "categories", "restaurants", "drivers"]);

/**
 * POST /uploads/image
 *
 * Accepts a single multipart image upload (field name "image"), server-side
 * resizes/compresses/converts it to WebP via sharp, and stores it in object
 * storage. Only the resulting public URL is ever persisted to Postgres.
 */
router.post(
  "/uploads/image",
  requireAuth,
  (req: Request, res: Response, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || "Upload failed" });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const folderRaw = typeof req.body?.folder === "string" ? req.body.folder : "products";
    const folder: ImageFolder = (ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : "products") as ImageFolder;

    try {
      const { url } = await processAndStoreImage(req.file.buffer, folder);
      res.status(201).json({ url });
    } catch (error) {
      if (error instanceof InvalidImageError) {
        req.log.warn({ err: error }, "Rejected invalid uploaded image");
        res.status(400).json({ error: error.message });
        return;
      }
      req.log.error({ err: error }, "Failed to process/store uploaded image");
      res.status(500).json({ error: "Failed to process image" });
    }
  },
);

/**
 * DELETE /uploads/image
 *
 * Best-effort deletion of a previously uploaded image, given its public
 * URL. Used when the admin replaces or removes an image explicitly.
 */
router.delete("/uploads/image", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const url = typeof req.body?.url === "string" ? req.body.url : undefined;
  await deleteStoredImage(url);
  await deleteDatabaseStoredImage(url);
  res.sendStatus(204);
});

export default router;
