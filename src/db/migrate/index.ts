import { SCHEMA_SQL_CORE } from "./sql-core";
import { SCHEMA_SQL_OPS } from "./sql-ops";

export const SCHEMA_SQL = `${SCHEMA_SQL_CORE}
${SCHEMA_SQL_OPS}`;

export { SCHEMA_PATCHES } from "./patches";
