import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Enable after R2 is turned on in the Cloudflare dashboard:
// wrangler r2 bucket create ops-monical-cache
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // incrementalCache: r2IncrementalCache,
});
