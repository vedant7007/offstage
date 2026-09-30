/**
 * Drizzle schema, split by domain. Everything is re-exported here so drizzle-kit
 * and the typed client see every table. Column names are snake_case (casing option).
 */
export * from "./core";
export * from "./program";
export * from "./registrations";
export * from "./crew";
export * from "./knowledge";
export * from "./proposals";
export * from "./money";
export * from "./planning";
export * from "./auth";
