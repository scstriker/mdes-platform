import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";
import { onError, onNotFound } from "./errors";
import { catalogRoutes } from "./routes/catalog";
import { importRoutes } from "./routes/import";
import { indicatorRoutes } from "./routes/indicators";
import { metaRoutes } from "./routes/meta";
import { observationRoutes } from "./routes/observations";
import { searchRoutes } from "./routes/search";
import { statisticsRoutes } from "./routes/statistics";
import { statsRoutes } from "./routes/stats";
import { tradeRoutes } from "./routes/trade";

export type { AppEnv } from "./env";

export function createApp(bindDeps: MiddlewareHandler<AppEnv>) {
  const app = new Hono<AppEnv>();

  app.use("*", cors());
  app.use("*", bindDeps);

  metaRoutes(app);
  indicatorRoutes(app);
  observationRoutes(app);
  searchRoutes(app);
  importRoutes(app);
  statsRoutes(app);
  tradeRoutes(app);
  statisticsRoutes(app);
  catalogRoutes(app);

  app.notFound(onNotFound);
  app.onError(onError);
  return app;
}
