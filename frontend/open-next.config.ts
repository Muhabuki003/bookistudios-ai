import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext turns the Next build into a Cloudflare Worker. Cloudflare Pages can
 * only host static assets, and every route in this app is server-rendered on
 * demand, so the app is deployed as a Worker with static assets attached.
 *
 * Incremental cache, tag cache and queue are left on their defaults (in-memory,
 * per-isolate). Wire them to KV / D1 / Durable Objects here when ISR or
 * on-demand revalidation is needed.
 */
export default defineCloudflareConfig();
