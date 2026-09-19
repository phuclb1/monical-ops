import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: "52bda0cc-4f78-4c8c-80c2-9fdf806e2404",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
