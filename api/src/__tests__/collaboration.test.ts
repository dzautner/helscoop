import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "http";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../db", () => ({
  query: mocks.query,
}));

vi.mock("../logger", () => ({
  default: mocks.logger,
}));

import { broadcastProjectEvent, getRoomPeers, installCollaborationServer } from "../collaboration";

const JWT_SECRET = "helscoop-dev-secret";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") resolve(address.port);
    });
  });
}

function waitForMessage<T extends Record<string, unknown>>(
  socket: WebSocket,
  predicate: (message: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for collaboration message"));
    }, 2000);
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as T;
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

async function connectClient(port: number, projectId: string, name: string) {
  const token = jwt.sign({ id: "user-1", email: `${name.toLowerCase()}@example.com`, role: "user" }, JWT_SECRET);
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/collaboration?projectId=${projectId}&token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`,
  );
  const welcome = await waitForMessage<{
    type: string;
    self: { clientId: string; name: string };
    peers: { clientId: string; name: string }[];
  }>(socket, (message) => message.type === "welcome");
  return { socket, welcome };
}

describe("collaboration websocket server", () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let port: number;
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    server = http.createServer();
    wss = installCollaborationServer(server);
    port = await listen(server);
  });

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [{ id: "project-1" }] });
  });

  afterEach(async () => {
    await Promise.all(sockets.splice(0).map((socket) => new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      socket.once("close", () => resolve());
      socket.close();
    })));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("announces presence and cursor updates inside a project room", async () => {
    const alice = await connectClient(port, "project-1", "Alice");
    sockets.push(alice.socket);
    expect(getRoomPeers("project-1")).toHaveLength(1);

    const aliceSeesBob = waitForMessage<{ type: string; peer: { name: string; cursor: unknown } }>(
      alice.socket,
      (message) => message.type === "presence:join",
    );
    const bob = await connectClient(port, "project-1", "Bob");
    sockets.push(bob.socket);

    expect(bob.welcome.peers.map((peer) => peer.name)).toContain("Alice");
    expect((await aliceSeesBob).peer.name).toBe("Bob");

    const aliceSeesCursor = waitForMessage<{ type: string; peer: { name: string; cursor: { line: number; column: number } } }>(
      alice.socket,
      (message) => message.type === "cursor:update",
    );
    bob.socket.send(JSON.stringify({ type: "cursor:update", cursor: { line: 3, column: 2 } }));

    await expect(aliceSeesCursor).resolves.toMatchObject({
      type: "cursor:update",
      peer: { name: "Bob", cursor: { line: 3, column: 2 } },
    });
  });

  it("broadcasts persisted project updates to other collaborators", async () => {
    const alice = await connectClient(port, "project-1", "Alice");
    const bob = await connectClient(port, "project-1", "Bob");
    sockets.push(alice.socket, bob.socket);

    const bobSeesProjectUpdate = waitForMessage<{ type: string; patch: { scene_js: string }; sourceName: string }>(
      bob.socket,
      (message) => message.type === "project:update",
    );

    broadcastProjectEvent("project-1", {
      type: "project:update",
      projectId: "project-1",
      patch: { scene_js: "scene.add(box(1,1,1));" },
      sourceClientId: alice.welcome.self.clientId,
      sourceName: "Alice",
    });

    await expect(bobSeesProjectUpdate).resolves.toMatchObject({
      type: "project:update",
      patch: { scene_js: "scene.add(box(1,1,1));" },
      sourceName: "Alice",
    });
  });
});
