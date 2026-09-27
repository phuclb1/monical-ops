import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAppOrigin, rewriteLocalhostUrl } from "../src/lib/site";

test("zalo link uses the runtime URL for prod and staging", () => {
  assert.equal(
    resolveAppOrigin({ configured: "https://platform.monicalhoteldalat.com" }),
    "https://platform.monicalhoteldalat.com",
  );
  assert.equal(
    resolveAppOrigin({ configured: "https://ops-staging.monicalhoteldalat.com/" }),
    "https://ops-staging.monicalhoteldalat.com",
  );
  assert.equal(
    resolveAppOrigin({ host: "localhost:3000" }),
    "http://localhost:3000",
  );
  assert.equal(
    resolveAppOrigin({ host: "ops-staging.monicalhoteldalat.com", proto: "https" }),
    "https://ops-staging.monicalhoteldalat.com",
  );
  assert.equal(resolveAppOrigin({}), "https://platform.monicalhoteldalat.com");
});

test("stored zalo text drops a localhost task link", () => {
  const text =
    "Xem và xác nhận: http://localhost:3000/tasks/c5ca2231-77cb-44cf-897e-7bd6cf772a1c";
  assert.equal(
    rewriteLocalhostUrl(text, "https://ops-staging.monicalhoteldalat.com"),
    "Xem và xác nhận: https://ops-staging.monicalhoteldalat.com/tasks/c5ca2231-77cb-44cf-897e-7bd6cf772a1c",
  );
});
