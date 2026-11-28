export type AppEnv = {
  Bindings: {
    /** Cloudflare D1（wrangler.toml 的 d1_databases） */
    DB: D1Database;
    IMPORT_MAX_ROWS?: string;
    ENABLE_TEST_HOOKS?: string;
    /** 受控本地管理环境写入开关（默认关闭；仅显式设置 "1"/"true" 且本机回环或携带 TRADE_WRITE_TOKEN 时开放写路由） */
    ENABLE_TRADE_WRITE?: string;
    /** 可选远端管理写入令牌（通过 X-Admin-Token 或 Authorization: Bearer 校验） */
    TRADE_WRITE_TOKEN?: string;
  };
  Variables: {
    db: D1Database;
    importMaxRows: number;
  };
};
