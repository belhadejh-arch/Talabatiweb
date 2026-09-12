import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : undefined;

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || process.env.AUTH_SECRET;
if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET or AUTH_SECRET is required in production");
}
const PgSession = connectPgSimple(session);

// When the frontend and backend are on different origins (e.g. Vercel +
// Render), the session cookie must be SameSite=None + Secure to be sent on
// cross-site requests. In same-origin dev (Replit preview) "lax" is fine.
if (isProduction) app.set("trust proxy", 1);

app.use(
  session({
    name: "talabat.sid",
    secret: sessionSecret || "talabat-dev-only-secret",
    store: new PgSession({
      pool,
      tableName: "talabat_sessions",
      createTableIfMissing: false,
      pruneSessionInterval: 60 * 60,
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 365 * 24 * 60 * 60 * 1000, // Keep the driver signed in for one year; logout remains explicit.
    },
  }),
);

// Unprefixed health check — some hosting platforms (e.g. Render) probe this
// exact path regardless of where the API is otherwise mounted.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", router);

// Keep API failures machine-readable for split deployments such as Vercel +
// Render. Express otherwise returns an HTML error page that obscures the
// actual failure in the admin dashboard.
app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: error, method: req.method, path: req.path }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "حدث خطأ داخلي في الخادم. حاول مرة أخرى" });
});

export default app;
