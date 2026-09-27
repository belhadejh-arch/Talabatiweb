import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db.mjs";
import { handleApi } from "./api.mjs";

const id = "539d81f6-2798-454d-b765-3ee7ee4db2b7";
const path = `/api/storage/db-images/${id}`;

function response() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
      this.writableEnded = true;
    }
  };
}

test("public catalog image route serves the original bytes and supports HEAD", async (t) => {
  const data = Buffer.from("RIFF....WEBPVP8 ");
  const queries = [];
  t.mock.method(pool, "query", async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [{ data, content_type: "image/webp" }] };
  });

  for (const method of ["GET", "HEAD"]) {
    const res = response();
    assert.equal(await handleApi({ url: path, method }, res), true);
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "image/webp");
    assert.equal(res.headers["content-length"], data.length);
    assert.deepEqual(res.body, method === "GET" ? data : undefined);
  }
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].params, [id, path]);
  assert.match(queries[0].sql, /b\.folder = 'restaurants'/);
  assert.match(queries[0].sql, /b\.folder = 'products'/);
  assert.doesNotMatch(queries[0].sql, /b\.folder = 'drivers'/);
});

test("image route rejects invalid identifiers, missing or private images, and writes", async (t) => {
  const query = t.mock.method(pool, "query", async () => ({ rows: [] }));
  for (const [url, method, status] of [
    [`${path}/extra`, "GET", 404],
    ["/api/storage/db-images/not-an-id", "GET", 404],
    [path, "GET", 404],
    [path, "POST", 405]
  ]) {
    const res = response();
    assert.equal(await handleApi({ url, method }, res), true);
    assert.equal(res.status, status);
  }
  assert.equal(query.mock.callCount(), 1);
});