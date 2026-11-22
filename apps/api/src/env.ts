export type AppEnv = {
  Bindings: {
    /** Cloudflare D1（wrangler.toml 的 d1_databases） */
    DB: D1Database;
    IMPORT_MAX_ROWS?: string;
    ENABLE_TEST_HOOKS?: string;
  };
  Variables: {
    db: D1Database;
    importMaxRows: number;
  };
};
