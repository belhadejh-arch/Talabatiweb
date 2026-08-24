import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  next();
}
