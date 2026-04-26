import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, hasAuthSession } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

export interface CollaborationProjectUpdateEvent {
  type: "project:update";
  projectId: string;
  patch: Record<string, unknown>;
  updated_at?: string;
  sourceClientId?: string;
  sourceName?: string;
}

export interface CollaborationBomUpdateEvent {
  type: "bom:update";
  projectId: string;
  items: { material_id: string; quantity: number; unit: string }[];
  count: number;
  sourceClientId?: string;
  sourceName?: string;
}

type CollaborationStatus = "offline" | "connecting" | "connected" | "error";

type IncomingMessage =
  | { type: "welcome"; self: CollaborationPeer; peers: CollaborationPeer[] }
  | { type: "presence:join" | "presence:update" | "cursor:update"; peer: CollaborationPeer }
  | { type: "presence:leave"; clientId: string }
  | CollaborationProjectUpdateEvent
  | CollaborationBomUpdateEvent
  | { type: "error"; error?: string };

interface UseProjectCollaborationOptions {
  projectId: string;
  enabled?: boolean;
  shareToken?: string | null;
  displayName?: string | null;
  onProjectUpdate?: (event: CollaborationProjectUpdateEvent) => void;
  onBomUpdate?: (event: CollaborationBomUpdateEvent) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isCursor(value: unknown): value is CollaborationCursor {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.line) &&
    isFiniteNumber(value.column) &&
    (value.selectionStart === undefined || isFiniteNumber(value.selectionStart)) &&
    (value.selectionEnd === undefined || isFiniteNumber(value.selectionEnd))
  );
}

function isPeer(value: unknown): value is CollaborationPeer {
  if (!isRecord(value)) return false;
  return (
    typeof value.clientId === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    typeof value.connectedAt === "string" &&
    (value.cursor === null || isCursor(value.cursor))
  );
}

function isBomItem(value: unknown): value is CollaborationBomUpdateEvent["items"][number] {
  if (!isRecord(value)) return false;
  return (
    typeof value.material_id === "string" &&
    isFiniteNumber(value.quantity) &&
    typeof value.unit === "string"
  );
}

export function parseIncomingCollaborationMessage(raw: unknown): IncomingMessage | null {
  if (typeof raw !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;

  switch (parsed.type) {
    case "welcome":
      if (!isPeer(parsed.self) || !Array.isArray(parsed.peers) || !parsed.peers.every(isPeer)) return null;
      return { type: "welcome", self: parsed.self, peers: parsed.peers };

    case "presence:join":
    case "presence:update":
    case "cursor:update":
      if (!isPeer(parsed.peer)) return null;
      return { type: parsed.type, peer: parsed.peer };

    case "presence:leave":
      if (typeof parsed.clientId !== "string") return null;
      return { type: "presence:leave", clientId: parsed.clientId };

    case "project:update":
      if (
        typeof parsed.projectId !== "string" ||
        !isRecord(parsed.patch) ||
        !isOptionalString(parsed.updated_at) ||
        !isOptionalString(parsed.sourceClientId) ||
        !isOptionalString(parsed.sourceName)
      ) {
        return null;
      }
      return {
        type: "project:update",
        projectId: parsed.projectId,
        patch: parsed.patch,
        updated_at: parsed.updated_at,
        sourceClientId: parsed.sourceClientId,
        sourceName: parsed.sourceName,
      };

    case "bom:update":
      if (
        typeof parsed.projectId !== "string" ||
        !Array.isArray(parsed.items) ||
        !parsed.items.every(isBomItem) ||
        !isFiniteNumber(parsed.count) ||
        !isOptionalString(parsed.sourceClientId) ||
        !isOptionalString(parsed.sourceName)
      ) {
        return null;
      }
      return {
        type: "bom:update",
        projectId: parsed.projectId,
        items: parsed.items,
        count: parsed.count,
        sourceClientId: parsed.sourceClientId,
        sourceName: parsed.sourceName,
      };

    case "error":
      if (!isOptionalString(parsed.error)) return null;
      return { type: "error", error: parsed.error };

    default:
      return null;
  }
}

function buildWebSocketUrl(projectId: string, token: string | null, shareToken: string | null, displayName: string | null): string {
  const url = new URL(API_URL, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/collaboration`;
  url.searchParams.set("projectId", projectId);
  if (token) url.searchParams.set("token", token);
  if (shareToken) url.searchParams.set("shareToken", shareToken);
  if (displayName) url.searchParams.set("name", displayName);
  return url.toString();
}

function upsertPeer(peers: CollaborationPeer[], peer: CollaborationPeer): CollaborationPeer[] {
  const index = peers.findIndex((candidate) => candidate.clientId === peer.clientId);
  if (index === -1) return [...peers, peer];
  const next = [...peers];
  next[index] = peer;
  return next;
}

export function useProjectCollaboration({
  projectId,
  enabled = true,
  shareToken = null,
  displayName = null,
  onProjectUpdate,
  onBomUpdate,
}: UseProjectCollaborationOptions) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollaborationPeer[]>([]);
  const [status, setStatus] = useState<CollaborationStatus>("offline");

  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const onProjectUpdateRef = useRef(onProjectUpdate);
  const onBomUpdateRef = useRef(onBomUpdate);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCursorRef = useRef<CollaborationCursor | null>(null);
  const latestSceneRef = useRef<string | null>(null);
  const latestBomRef = useRef<CollaborationBomUpdateEvent["items"] | null>(null);

  onProjectUpdateRef.current = onProjectUpdate;
  onBomUpdateRef.current = onBomUpdate;

  const sendMessage = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, []);

  const flushCursor = useCallback(() => {
    cursorTimerRef.current = null;
    if (!latestCursorRef.current) return;
    sendMessage({ type: "cursor:update", cursor: latestCursorRef.current });
  }, [sendMessage]);

  const flushScene = useCallback(() => {
    sceneTimerRef.current = null;
    if (latestSceneRef.current === null) return;
    sendMessage({ type: "scene:update", scene_js: latestSceneRef.current });
  }, [sendMessage]);

  const flushBom = useCallback(() => {
    bomTimerRef.current = null;
    if (!latestBomRef.current) return;
    sendMessage({ type: "bom:update", items: latestBomRef.current });
  }, [sendMessage]);

  const sendCursor = useCallback((cursor: CollaborationCursor) => {
    latestCursorRef.current = cursor;
    if (cursorTimerRef.current) return;
    cursorTimerRef.current = setTimeout(flushCursor, 150);
  }, [flushCursor]);

  const sendSceneUpdate = useCallback((sceneJs: string) => {
    latestSceneRef.current = sceneJs;
    if (sceneTimerRef.current) return;
    sceneTimerRef.current = setTimeout(flushScene, 350);
  }, [flushScene]);

  const sendBomUpdate = useCallback((items: CollaborationBomUpdateEvent["items"]) => {
    latestBomRef.current = items;
    if (bomTimerRef.current) return;
    bomTimerRef.current = setTimeout(flushBom, 350);
  }, [flushBom]);

  useEffect(() => {
    if (!enabled || !projectId || typeof window === "undefined") return;
    const token = getToken();
    if (!hasAuthSession() && !shareToken) return;

    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("connecting");
      const socket = new WebSocket(buildWebSocketUrl(projectId, token, shareToken, displayName));
      socketRef.current = socket;

      socket.onopen = () => setStatus("connected");
      socket.onerror = () => setStatus("error");
      socket.onmessage = (event) => {
        const message = parseIncomingCollaborationMessage(event.data);
        if (!message) return;

        if (message.type === "welcome") {
          clientIdRef.current = message.self.clientId;
          setClientId(message.self.clientId);
          setPeers(message.peers);
          setStatus("connected");
          return;
        }

        if (message.type === "presence:join" || message.type === "presence:update" || message.type === "cursor:update") {
          if (message.peer.clientId === clientIdRef.current) return;
          setPeers((current) => upsertPeer(current, message.peer));
          return;
        }

        if (message.type === "presence:leave") {
          setPeers((current) => current.filter((peer) => peer.clientId !== message.clientId));
          return;
        }

        if (message.type === "project:update") {
          if (message.sourceClientId === clientIdRef.current) return;
          onProjectUpdateRef.current?.(message);
          return;
        }

        if (message.type === "bom:update") {
          if (message.sourceClientId === clientIdRef.current) return;
          onBomUpdateRef.current?.(message);
          return;
        }

        if (message.type === "error") {
          setStatus("error");
        }
      };

      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        if (closedByCleanup) return;
        if (event.code === 1008) {
          setStatus("error");
          return;
        }
        setStatus("offline");
        reconnectTimer = setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close(1000, "Leaving project");
      socketRef.current = null;
      clientIdRef.current = null;
      setClientId(null);
      setPeers([]);
      setStatus("offline");
    };
  }, [displayName, enabled, projectId, shareToken]);

  useEffect(() => () => {
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
    if (bomTimerRef.current) clearTimeout(bomTimerRef.current);
  }, []);

  return {
    clientId,
    peers,
    status,
    sendCursor,
    sendSceneUpdate,
    sendBomUpdate,
  };
}
