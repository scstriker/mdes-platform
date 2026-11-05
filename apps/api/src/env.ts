import type { Sql } from "./db";

export type AppEnv = {
  Bindings: {
    HYPERDRIVE?: { connectionString: string };
    DATABASE_URL?: string;
    EMBEDDING_DIMS?: string;
    IMPORT_MAX_ROWS?: string;
  };
  Variables: {
    sql: Sql;
    embeddingDims: number;
    importMaxRows: number;
  };
};
