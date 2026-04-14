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
    const room = rooms.get(socket.roomId);
    if (!room) return;
    
    // Persist final stroke state for Z-order matching
    if (payload.type === "end") {
      room.boardObjects.push({ type: "stroke", payload });
    }

    socket.to(socket.roomId).emit("stroke_draw", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Text object add (broadcast to other peers) ───────────────
  socket.on("text_add", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (room.isLocked && !isTeacherSocket(socket)) return;

    room.boardObjects.push({ type: "text", payload });

    socket.to(socket.roomId).emit("text_add", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Text object update (broadcast content/position changes) ──
  socket.on("text_update", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (room.isLocked && !isTeacherSocket(socket)) return;
    socket.to(socket.roomId).emit("text_update", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Clear canvas (teacher only) ─────────────────────────────
  socket.on("clear_canvas", () => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    // Also clear board files and objects from memory
    room.boardFiles = [];
    room.boardObjects = [];
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

  // ── Board file: update (teacher only) ──────────────────────
  socket.on("board_file_update", ({ payload }) => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);

    console.log(`[board_file_update] Received from ${socket.user?.name} for file ${payload.id}:`, payload);

    const file = room.boardFiles.find(f => f.id === payload.id);
    if (file) {
      if (payload.position) file.position = payload.position;
      if (payload.scale) file.scale = payload.scale;
      console.log(`[board_file_update] Updated file ${payload.id} in memory.`);
    }

    socket.to(socket.roomId).emit("board_file_update", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Board background color change (teacher only) ─────────────
  socket.on("board_color_change", ({ color, page }) => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    
    const room = ensureRoom(socket.roomId);
    
    // If a page index was sent, find the page id. 
    // For now we just broadcast the index and color so clients can handle it.
    io.in(socket.roomId).emit("board_color_sync", {
      roomId: socket.roomId,
      color,
      page,
    });
  });

  // ── Page update (teacher only) ──────────────────────────────
  socket.on("page_update", (data) => {
    const { payload } = data;
    if (!socket.roomId) return;
    
    const isTeacher = isTeacherSocket(socket);
    console.log(`[page_update] Request from ${socket.user?.name} (id: ${socket.userId}). IsTeacher: ${isTeacher}. Payload:`, payload);

    if (!isTeacher) {
        console.warn(`[page_update] Access denied for ${socket.user?.name}`);
        return;
    }
    
    // Broadcast to everyone including the sender
    console.log(`[page_update] Broadcasting to room ${socket.roomId}`);
    io.to(socket.roomId).emit("page_update", {
      roomId: socket.roomId,
      payload,
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
