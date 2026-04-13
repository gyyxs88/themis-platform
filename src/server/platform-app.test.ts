import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";

test("createPlatformApp 会返回平台健康检查与共享错误契约响应", async () => {
  const server = createPlatformApp();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      service: "themis-platform",
    });

    const blocked = await fetch(`${baseUrl}/api/runtime/config`);
    assert.equal(blocked.status, 404);
    assert.deepEqual(await blocked.json(), {
      error: {
        code: "PLATFORM_ROUTE_NOT_FOUND",
        message: "Platform surface does not expose /api/runtime/config.",
      },
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});
