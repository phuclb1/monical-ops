import { readFileSync, writeFileSync } from "node:fs";

const file = ".open-next/worker.js";
const source = readFileSync(file, "utf8");
if (source.includes("zalo-cron.internal")) {
  console.log("worker already calls the Zalo cron route");
  process.exit(0);
}

const marker = "export default {\n    async fetch(request, env, ctx) {";
const closing = source.lastIndexOf("    },\n};");
if (!source.includes(marker) || closing < 0) {
  console.error("Không nhận ra .open-next/worker.js để gắn scheduled.");
  process.exit(1);
}

const body = source.slice(source.indexOf(marker) + marker.length, closing);
const next = `${source.slice(0, source.indexOf(marker))}async function __opsFetch(request, env, ctx) {${body}}

async function __opsScheduled(_event, env, ctx) {
    const request = new Request("https://zalo-cron.internal/api/zalo/cron", {
        headers: { "x-zalo-cron": env.ZALO_CRON_TOKEN || "" },
    });
    ctx.waitUntil(__opsFetch(request, env, ctx));
}

export default {
    fetch: __opsFetch,
    scheduled: __opsScheduled,
};
`;

writeFileSync(file, next);
console.log("attached scheduled handler to .open-next/worker.js");
