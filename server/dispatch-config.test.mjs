import test from "node:test";
import assert from "node:assert/strict";
import { automaticDispatchEnabled } from "./dispatch.mjs";

test("Replit development cannot claim live email jobs by default", () => {
  assert.equal(automaticDispatchEnabled({ REPL_ID: "workspace" }), false);
  assert.equal(
    automaticDispatchEnabled({ REPL_ID: "workspace", NODE_ENV: "development" }),
    false,
  );
});

test("the deployed worker remains enabled, with an explicit override for isolated testing", () => {
  assert.equal(automaticDispatchEnabled({}), true);
  assert.equal(automaticDispatchEnabled({ NODE_ENV: "production" }), true);
  assert.equal(
    automaticDispatchEnabled({ REPL_ID: "workspace", NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    automaticDispatchEnabled({ REPL_ID: "workspace", DISPATCH_WORKER_ENABLED: "true" }),
    true,
  );
  assert.equal(automaticDispatchEnabled({ DISPATCH_WORKER_ENABLED: "false" }), false);
});