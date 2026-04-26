import http from "http";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { query } from "./db";
import logger from "./logger";
import { getJwtSecret } from "./secrets";
import { getAuthCookieToken } from "./session-cookie";

const COLORS = ["#e5a04b", "#7ab3e0", "#8bc48b", "#d4a0e0", "#f0b86a", "#e07a7a"];
const MAX_SCENE_BYTES = 512 * 1024;
const MAX_MESSAGE_BYTES = MAX_SCENE_BYTES + 16 * 1024;

interface AuthPayload {
  id?: string;
  email?: string;
  role?: string;
}

export interface CollaborationCursor {
  line: number;
  column: number;
  selectionStart?: number;
  selectionEnd?: number;
}

export interface CollaborationPeer {
  clientId: string;
  name: string;
  color: string;
  cursor: CollaborationCursor | null;
  connectedAt: string;
}

interface CollaborationClient {
  socket: WebSocket;
  projectId: string;
  clientId: string;
  name: string;
  color: string;
  cursor: CollaborationCursor | null;
  connectedAt: string;
}

export interface ProjectUpdateEvent {
  type: "project:update";
  projectId: string;
  patch: Record<string, unknown>;
  updated_at?: string;
  sourceClientId?: string;
  sourceName?: string;
}

export interface BomUpdateEvent {
  type: "bom:update";
  projectId: string;
  items: { material_id: string; quantity: number; unit: string }[];
  count: number;
  sourceClientId?: string;
  sourceName?: string;
}

export type CollaborationBroadcastEvent = ProjectUpdateEvent | BomUpdateEvent;

const rooms = new Map<string, Map<string, CollaborationClient>>();
let wss: WebSocketServer | null = null;

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/<[^>]*>/g, "").trim().slice(0, 60);
  return cleaned || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tokenDisplayName(payload: AuthPayload | null, suppliedName: string | null): string {
  if (suppliedName) return suppliedName;
  if (payload?.email) return payload.email.split("@")[0] || "Helscoop user";
  return "Guest collaborator";
}

function normalizeCursor(value: unknown): CollaborationCursor | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const line = Number(raw.line);
  const column = Number(raw.column);
  if (!Number.isFinite(line) || !Number.isFinite(column) || line < 1 || column < 0) return null;
  const cursor: CollaborationCursor = {
    line: Math.floor(line),
    column: Math.floor(column),
  };
  const selectionStart = Number(raw.selectionStart);
  const selectionEnd = Number(raw.selectionEnd);
  if (Number.isFinite(selectionStart) && selectionStart >= 0) cursor.selectionStart = Math.floor(selectionStart);
  if (Number.isFinite(selectionEnd) && selectionEnd >= 0) cursor.selectionEnd = Math.floor(selectionEnd);
  return cursor;
}

function normalizeBomItems(value: unknown): BomUpdateEvent["items"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const materialId = typeof raw.material_id === "string" ? raw.material_id.trim() : "";
    const quantity = Number(raw.quantity);
    const unit = typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim().slice(0, 24) : "kpl";
    if (!materialId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return [];
    return [{ material_id: materialId, quantity, unit }];
  });
}

function toPeer(client: CollaborationClient): CollaborationPeer {
  return {
    clientId: client.clientId,
    name: client.name,
    color: client.color,
    cursor: client.cursor,
    connectedAt: client.connectedAt,
  };
}

function sendJson(socket: WebSocket, payload: object): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ ...payload, sentAt: new Date().toISOString() }));
  } catch (err) {
    logger.warn({ err }, "Failed to send collaboration message");
  }
}

function broadcastToRoom(projectId: string, payload: object, exceptClientId?: string): void {
  const room = rooms.get(projectId);
  if (!room) return;
  for (const client of room.values()) {
    if (client.clientId === exceptClientId) continue;
    sendJson(client.socket, payload);
  }
}

function removeClient(client: CollaborationClient): void {
  const room = rooms.get(client.projectId);
  if (!room) return;
  room.delete(client.clientId);
  if (room.size === 0) {
    rooms.delete(client.projectId);
    return;
  }
  broadcastToRoom(client.projectId, {
    type: "presence:leave",
    projectId: client.projectId,
    clientId: client.clientId,
  });
}

function rawDataByteLength(raw: RawData): number {
  if (Array.isArray(raw)) return raw.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (typeof raw === "string") return Buffer.byteLength(raw);
  return raw.byteLength;
}

function rawDataToString(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return raw.toString("utf8");
}

async function authorizeProjectAccess(projectId: string, token: string | null, shareToken: string | null) {
  let payload: AuthPayload | null = null;
  if (token) {
    try {
      payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
    } catch {
      if (!shareToken) return { authorized: false, payload: null };
    }
  }

  if (payload?.id) {
    const result = await query(
      "SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [projectId, payload.id],
    );
    if (result.rows.length > 0) return { authorized: true, payload };
  }

  if (shareToken) {
    const result = await query(
      `SELECT id
       FROM projects
       WHERE id = $1
         AND share_token = $2
         AND deleted_at IS NULL
         AND (share_token_expires_at IS NULL OR share_token_expires_at > now())`,
      [projectId, shareToken],
    );
    if (result.rows.length > 0) return { authorized: true, payload };
  }

  return { authorized: false, payload: null };
}

function handleClientMessage(client: CollaborationClient, raw: RawData): void {
  if (rawDataByteLength(raw) > MAX_MESSAGE_BYTES) {
    sendJson(client.socket, { type: "error", error: "Collaboration message exceeds maximum size of 528 KB" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDataToString(raw));
  } catch {
    sendJson(client.socket, { type: "error", error: "Invalid collaboration message" });
    return;
  }

  if (!isRecord(parsed)) {
    sendJson(client.socket, { type: "error", error: "Invalid collaboration message" });
    return;
  }

  const message = parsed;
  if (typeof message.type !== "string") {
    sendJson(client.socket, { type: "error", error: "Invalid collaboration message type" });
    return;
  }

  if (message.type === "cursor:update") {
    client.cursor = normalizeCursor(message.cursor);
    broadcastToRoom(client.projectId, {
      type: "cursor:update",
      projectId: client.projectId,
      peer: toPeer(client),
    }, client.clientId);
    return;
  }

  if (message.type === "presence:update") {
    client.name = safeName(message.name, client.name);
    broadcastToRoom(client.projectId, {
      type: "presence:update",
      projectId: client.projectId,
      peer: toPeer(client),
    }, client.clientId);
    return;
  }

  if (message.type === "scene:update" && typeof message.scene_js === "string") {
    if (message.scene_js.length > MAX_SCENE_BYTES) {
      sendJson(client.socket, { type: "error", error: "Scene script exceeds maximum size of 512 KB" });
      return;
    }
    broadcastToRoom(client.projectId, {
      type: "project:update",
      projectId: client.projectId,
      sourceClientId: client.clientId,
      sourceName: client.name,
      patch: { scene_js: message.scene_js },
    }, client.clientId);
    return;
  }

  if (message.type === "bom:update") {
    const items = normalizeBomItems(message.items);
    broadcastToRoom(client.projectId, {
      type: "bom:update",
      projectId: client.projectId,
      sourceClientId: client.clientId,
      sourceName: client.name,
      items,
      count: items.length,
    }, client.clientId);
  }
}

async function handleConnection(socket: WebSocket, req: http.IncomingMessage): Promise<void> {
  const url = new URL(req.url || "", "http://localhost");
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    socket.close(1008, "Missing projectId");
    return;
  }

  const auth = await authorizeProjectAccess(
    projectId,
    url.searchParams.get("token") || getAuthCookieToken(req),
    url.searchParams.get("shareToken"),
  );
  if (!auth.authorized) {
    socket.close(1008, "Unauthorized");
    return;
  }

  const clientId = crypto.randomUUID();
  const room = rooms.get(projectId) || new Map<string, CollaborationClient>();
  rooms.set(projectId, room);

  const client: CollaborationClient = {
    socket,
    projectId,
    clientId,
    name: safeName(url.searchParams.get("name"), tokenDisplayName(auth.payload, null)),
    color: COLORS[room.size % COLORS.length],
    cursor: null,
    connectedAt: new Date().toISOString(),
  };

  room.set(clientId, client);
  sendJson(socket, {
    type: "welcome",
    projectId,
    self: toPeer(client),
    peers: [...room.values()].filter((peer) => peer.clientId !== clientId).map(toPeer),
  });
  broadcastToRoom(projectId, {
    type: "presence:join",
    projectId,
    peer: toPeer(client),
  }, clientId);

  socket.on("message", (raw) => {
    try {
      handleClientMessage(client, raw);
    } catch (err) {
      logger.warn({ err, projectId }, "Failed to handle collaboration message");
      sendJson(socket, { type: "error", error: "Collaboration message failed" });
    }
  });
  socket.on("close", () => removeClient(client));
  socket.on("error", (err) => {
    logger.warn({ err, projectId }, "Collaboration socket error");
    removeClient(client);
  });
}

export function installCollaborationServer(server: http.Server): WebSocketServer {
  if (wss) return wss;
  wss = new WebSocketServer({ server, path: "/collaboration" });
  wss.on("close", () => {
    wss = null;
  });
  wss.on("connection", (socket, req) => {
    void handleConnection(socket, req).catch((err) => {
      logger.error({ err }, "Collaboration connection failed");
      socket.close(1011, "Collaboration server error");
    });
  });
  return wss;
}

export function broadcastProjectEvent(projectId: string, event: CollaborationBroadcastEvent): void {
  broadcastToRoom(projectId, event, event.sourceClientId);
}

export function getCollaborationClientId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value) ? value : undefined;
}

export function getRoomPeers(projectId: string): CollaborationPeer[] {
  return [...(rooms.get(projectId)?.values() || [])].map(toPeer);
}
