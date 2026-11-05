import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";
import { onError, onNotFound } from "./errors";
import { importRoutes } from "./routes/import";
import { indicatorRoutes } from "./routes/indicators";
import { metaRoutes } from "./routes/meta";
import { observationRoutes } from "./routes/observations";
import { statsRoutes } from "./routes/stats";

export type { AppEnv } from "./env";

export function createApp(bindDeps: MiddlewareHandler<AppEnv>) {
  const app = new Hono<AppEnv>();

  app.use("*", cors());
  app.use("*", bindDeps);

  metaRoutes(app);
  indicatorRoutes(app);
  observationRoutes(app);
  importRoutes(app);
  statsRoutes(app);

  app.notFound(onNotFound);
  app.onError(onError);
  return app;
}
