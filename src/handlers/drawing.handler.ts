/**
 * ─── Drawing Handler ──────────────────────────────────────────
 * SECTION: Whiteboard Drawing (Live Strokes)
 *
 * Features:
 *  - Excalidraw element-delta CRDT sync
 *  - Live pointer/cursor presence
 *  - Respects freeze & lock states
 *  - Canvas snapshot save/load via REST
 */

import type { Server } from "socket.io";
import type { Application } from "express";
import type { CustomSocket } from "../types.js";
import { rooms, ensureRoom, getPage, mergeElements, pageSnapshot, isTeacherSocket } from "../room.js";

// ─── Socket handlers ──────────────────────────────────────────

export function registerDrawingSocketHandlers(socket: CustomSocket, io: Server) {

  // ── Excalidraw element delta sync ───────────────────────────
  socket.on("elements_update", ({ payload }) => {
    if (!socket.roomId) return;
    const room = ensureRoom(socket.roomId);

    // Guard: freeze blocks everyone
    if (room.isFrozen) return;
    // Guard: lock blocks non-teachers
    if (room.isLocked && !isTeacherSocket(socket)) return;

    const page = getPage(room, payload?.pageId || room.currentPageId);
    const accepted = mergeElements(page, payload?.elements ?? []);
    if (payload?.appState) page.appState = payload.appState;
    room.isDirty = true;

    if (accepted.length) {
      socket.to(socket.roomId).emit("elements_update", {
        roomId: socket.roomId,
        payload: { elements: accepted, pageId: page.id },
      });
    }
  });

  // ── Live pointer/cursor presence ────────────────────────────
  socket.on("pointer_update", ({ payload }) => {
    if (!socket.roomId || !socket.userId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const p = room.participants.get(socket.userId);
    if (p) p.pointer = payload;
    socket.to(socket.roomId).emit("pointer_update", {
      roomId: socket.roomId,
      payload: { userId: socket.userId, name: socket.user?.name, ...payload },
    });
  });

  // ── Live stroke synchronization ──────────────────────────────
  socket.on("stroke_draw", ({ payload }) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit("stroke_draw", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Clear canvas (teacher only) ─────────────────────────────
  socket.on("clear_canvas", () => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    // Also clear board files from memory
    room.boardFiles = [];
    // Broadcast to everyone in the room (including sender via io.in)
    io.in(socket.roomId).emit("clear_canvas", {
      roomId: socket.roomId,
    });
  });

  // ── Board file: add (teacher only) ─────────────────────────
  socket.on("board_file_add", ({ payload }) => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);

    const boardFile = {
      id: payload.id || crypto.randomUUID(),
      url: payload.url,
      name: payload.name,
      position: payload.position || { x: 0.5, y: 0.5 },
      scale: payload.scale || 0.3,
      addedBy: socket.user?.name || "Teacher",
      timestamp: Date.now(),
    };

    room.boardFiles.push(boardFile);
    // Cap at 20 files to prevent memory overflow
    if (room.boardFiles.length > 20) {
      room.boardFiles.splice(0, room.boardFiles.length - 20);
    }

    io.in(socket.roomId).emit("board_file_add", {
      roomId: socket.roomId,
      payload: boardFile,
    });
  });

  // ── Board file: remove (teacher only) ──────────────────────
  socket.on("board_file_remove", ({ payload }) => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);

    room.boardFiles = room.boardFiles.filter(f => f.id !== payload.id);

    io.in(socket.roomId).emit("board_file_remove", {
      roomId: socket.roomId,
      payload: { id: payload.id },
    });
  });
}

// ─── REST routes ──────────────────────────────────────────────

export function registerDrawingRoutes(app: Application) {
  // Load current snapshot
  app.get("/load/:roomId", (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ ok: false });
    res.json({ ok: true, snapshot: pageSnapshot(getPage(room, room.currentPageId)) });
  });

  // Save snapshot
  app.post("/save/:roomId", (req, res) => {
    const room = ensureRoom(req.params.roomId);
    const { pageId, elements, backgroundColor, appState } = req.body;
    const page = getPage(room, pageId || room.currentPageId);
    if (Array.isArray(elements)) mergeElements(page, elements);
    if (backgroundColor) page.backgroundColor = backgroundColor;
    if (appState) page.appState = appState;
    room.isDirty = true;
    res.json({ ok: true, pageId: page.id });
  });
}
