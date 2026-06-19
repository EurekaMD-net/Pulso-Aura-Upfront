/**
 * Snowflake connection config (P4).
 *
 * The factual/transactional data lives in an external Snowflake instance,
 * queried on demand. Credentials come from the environment (operator-managed in
 * `.env`, never committed). Supports password OR key-pair auth — provide one.
 *
 * Required: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_WAREHOUSE,
 *           SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA, and one of
 *           SNOWFLAKE_PASSWORD | SNOWFLAKE_PRIVATE_KEY_PATH.
 * Optional: SNOWFLAKE_ROLE.
 *
 * `loadSnowflakeConfig()` returns null when not fully configured, so the rest of
 * the layer degrades to a clear `not_configured` signal instead of throwing.
 */

export interface SnowflakeConfig {
  account: string;
  username: string;
  warehouse: string;
  database: string;
  schema: string;
  role?: string;
  /** Password auth (mutually sufficient with privateKeyPath). */
  password?: string;
  /** Key-pair auth: path to an unencrypted PEM private key. */
  privateKeyPath?: string;
}

export function loadSnowflakeConfig(): SnowflakeConfig | null {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USERNAME;
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE;
  const database = process.env.SNOWFLAKE_DATABASE;
  const schema = process.env.SNOWFLAKE_SCHEMA;
  const password = process.env.SNOWFLAKE_PASSWORD;
  const privateKeyPath = process.env.SNOWFLAKE_PRIVATE_KEY_PATH;

  if (!account || !username || !warehouse || !database || !schema) return null;
  if (!password && !privateKeyPath) return null; // need an auth method

  return {
    account,
    username,
    warehouse,
    database,
    schema,
    role: process.env.SNOWFLAKE_ROLE,
    password,
    privateKeyPath,
  };
}

export function isSnowflakeConfigured(): boolean {
  return loadSnowflakeConfig() !== null;
}
