import { describe, expect, it } from "vitest";
import { parseIncomingCollaborationMessage } from "@/hooks/useProjectCollaboration";

const peer = {
  clientId: "client-1",
  name: "Matti",
  color: "#8bc48b",
  cursor: null,
  connectedAt: "2026-04-26T18:00:00.000Z",
};

describe("parseIncomingCollaborationMessage", () => {
  it("accepts a valid welcome message", () => {
    expect(parseIncomingCollaborationMessage(JSON.stringify({
      type: "welcome",
      self: peer,
      peers: [{ ...peer, clientId: "client-2" }],
    }))).toEqual({
      type: "welcome",
      self: peer,
      peers: [{ ...peer, clientId: "client-2" }],
    });
  });

  it("accepts peer updates with validated cursor data", () => {
    expect(parseIncomingCollaborationMessage(JSON.stringify({
      type: "cursor:update",
      peer: {
        ...peer,
        cursor: { line: 12, column: 4, selectionStart: 120, selectionEnd: 140 },
      },
    }))).toEqual({
      type: "cursor:update",
      peer: {
        ...peer,
        cursor: { line: 12, column: 4, selectionStart: 120, selectionEnd: 140 },
      },
    });
  });

  it("accepts project and BOM update messages", () => {
    expect(parseIncomingCollaborationMessage(JSON.stringify({
      type: "project:update",
      projectId: "project-1",
      patch: { name: "Updated" },
      updated_at: "2026-04-26T18:01:00.000Z",
      sourceClientId: "client-2",
      sourceName: "Laura",
    }))).toEqual({
      type: "project:update",
      projectId: "project-1",
      patch: { name: "Updated" },
      updated_at: "2026-04-26T18:01:00.000Z",
      sourceClientId: "client-2",
      sourceName: "Laura",
    });

    expect(parseIncomingCollaborationMessage(JSON.stringify({
      type: "bom:update",
      projectId: "project-1",
      count: 1,
      items: [{ material_id: "timber", quantity: 3, unit: "m" }],
    }))).toEqual({
      type: "bom:update",
      projectId: "project-1",
      count: 1,
      items: [{ material_id: "timber", quantity: 3, unit: "m" }],
      sourceClientId: undefined,
      sourceName: undefined,
    });
  });

  it("accepts server error messages", () => {
    expect(parseIncomingCollaborationMessage(JSON.stringify({
      type: "error",
      error: "permission denied",
    }))).toEqual({ type: "error", error: "permission denied" });
  });

  it("rejects malformed JSON, binary payloads, and unknown message types", () => {
    expect(parseIncomingCollaborationMessage("{not valid")).toBeNull();
    expect(parseIncomingCollaborationMessage(new ArrayBuffer(8))).toBeNull();
    expect(parseIncomingCollaborationMessage(JSON.stringify({ type: "future:event" }))).toBeNull();
  });

  it("rejects messages that would otherwise throw in the websocket handler", () => {
    expect(parseIncomingCollaborationMessage(JSON.stringify({ type: "welcome", peers: [] }))).toBeNull();
    expect(parseIncomingCollaborationMessage(JSON.stringify({ type: "presence:update" }))).toBeNull();
    expect(parseIncomingCollaborationMessage(JSON.stringify({ type: "presence:leave", clientId: 42 }))).toBeNull();
    expect(parseIncomingCollaborationMessage(JSON.stringify({ type: "project:update", projectId: "p1", patch: [] }))).toBeNull();
    expect(parseIncomingCollaborationMessage(JSON.stringify({
      type: "bom:update",
      projectId: "p1",
      count: 1,
      items: [{ material_id: "timber", quantity: Number.NaN, unit: "m" }],
    }))).toBeNull();
  });
});
