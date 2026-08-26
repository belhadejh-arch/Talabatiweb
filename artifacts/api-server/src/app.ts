import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import session from "express-session";
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

const sessionSecret = process.env.SESSION_SECRET || process.env.AUTH_SECRET || "talabat-dev-secret-change-in-prod";
const isProduction = process.env.NODE_ENV === "production";

// When the frontend and backend are on different origins (e.g. Vercel +
// Render), the session cookie must be SameSite=None + Secure to be sent on
// cross-site requests. In same-origin dev (Replit preview) "lax" is fine.
if (isProduction) app.set("trust proxy", 1);

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// Unprefixed health check — some hosting platforms (e.g. Render) probe this
// exact path regardless of where the API is otherwise mounted.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", router);

export default app;
