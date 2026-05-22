import { createServer } from "node:http";
import { createConnection, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { waitForCallback } from "../../src/lib/auth.js";

async function getOpenPort(): Promise<number> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        throw new Error("Expected TCP server address.");
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function createHeldCallbackConnection(port: number): Promise<Socket> {
  const socket = createConnection({ host: "127.0.0.1", port });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.write("GET /callback?code=held-open HTTP/1.1\r\nHost: 127.0.0.1\r\n");
  return socket;
}

async function expectResolvesWithin(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    promise.then(() => "resolved" as const),
    new Promise<"timeout">((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), timeoutMs);
    }),
  ]);
  if (timeout) {
    clearTimeout(timeout);
  }
  expect(result).toBe("resolved");
}

describe("auth callback server", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends success with connection close and shuts down the callback server", async () => {
    const port = await getOpenPort();
    const handle = waitForCallback(port);
    const responsePromise = fetch(`http://127.0.0.1:${port}/callback?code=auth-code`);

    const callback = await handle.promise;
    expect(callback.code).toBe("auth-code");

    await callback.sendSuccess();

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.headers.get("connection")).toBe("close");
    await expect(response.text()).resolves.toContain("Authenticated");
    await expect(fetch(`http://127.0.0.1:${port}/callback?code=again`)).rejects.toThrow();
  });

  it("destroys active callback connections while shutting down after success", async () => {
    const port = await getOpenPort();
    const handle = waitForCallback(port);
    const heldSocket = await createHeldCallbackConnection(port);
    const heldSocketClosed = new Promise<void>((resolve) => {
      heldSocket.once("close", () => resolve());
    });

    try {
      const responsePromise = fetch(`http://127.0.0.1:${port}/callback?code=auth-code`);
      const callback = await handle.promise;

      await expectResolvesWithin(callback.sendSuccess(), 500);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain("Authenticated");
      await expectResolvesWithin(heldSocketClosed, 500);
    } finally {
      heldSocket.destroy();
    }
  });
});
