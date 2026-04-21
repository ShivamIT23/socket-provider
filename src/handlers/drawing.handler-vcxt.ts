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
import { broadcastRoomUsers } from "./auth.handler.js";

// ─── Socket handlers ──────────────────────────────────────────

export function registerDrawingSocketHandlers(socket: CustomSocket, io: Server) {

  // ── Excalidraw element delta sync ───────────────────────────
  socket.on("elements_update", ({ payload }) => {
    if (!socket.roomId) return;
    const room = ensureRoom(socket.roomId);

    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }

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

    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }
    
    // Persist and buffer strokes
    if (payload.type === "start") {
      room.strokeBuffers.set(payload.id, {
        points: [payload.point],
        color: payload.color || "#fff",
        width: payload.width || 0.002,
        page: payload.page ?? 0
      });
    } else if (payload.type === "draw") {
      const buffer = room.strokeBuffers.get(payload.id);
      if (buffer) buffer.points.push(payload.point);
    } else if (payload.type === "end") {
      const buffer = room.strokeBuffers.get(payload.id);
      if (buffer) {
        const fullStroke = {
          id: payload.id,
          type: "full",
          points: buffer.points,
          color: buffer.color,
          width: buffer.width,
          page: buffer.page
        };
        room.boardObjects.push({ type: "stroke", payload: fullStroke, timestamp: Date.now() });
        room.redoObjects = []; // Clear redo stack on new action
        room.strokeBuffers.delete(payload.id);
        room.isDirty = true;
        room.boardCountSinceLastSync++;
        if (room.boardCountSinceLastSync >= 60) {
          import("../services/sync.service.js").then(m => m.saveRoomStateToBackend(room.id));
        }
      }
    }

    socket.to(socket.roomId).emit("stroke_draw", {
      roomId: socket.roomId,
      payload: { ...payload, timestamp: Date.now() },
    });
  });

  // ── Text object add (broadcast to other peers) ───────────────
  socket.on("text_add", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }

    room.boardObjects.push({ type: "text", payload, timestamp: Date.now() });
    room.redoObjects = []; // Clear redo stack on new action
    room.isDirty = true;
    room.boardCountSinceLastSync++;
    if (room.boardCountSinceLastSync >= 60) {
      import("../services/sync.service.js").then(m => m.saveRoomStateToBackend(room.id));
    }

    socket.to(socket.roomId).emit("text_add", {
      roomId: socket.roomId,
      payload: { ...payload, timestamp: Date.now() },
    });
  });

  // ── Text object update (broadcast content/position changes) ──
  socket.on("text_update", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }

    // Persist position/content changes in boardObjects
    const existing = room.boardObjects.find(
      (o) => o.type === "text" && o.payload.id === payload.id
    );
    if (existing) {
      if (payload.position) (existing.payload as Record<string, unknown>).position = payload.position;
      if (payload.text !== undefined) (existing.payload as Record<string, unknown>).text = payload.text;
      if (payload.color) (existing.payload as Record<string, unknown>).color = payload.color;
      if (payload.fontSizeRatio) (existing.payload as Record<string, unknown>).fontSizeRatio = payload.fontSizeRatio;
      room.isDirty = true;
    }

    socket.to(socket.roomId).emit("text_update", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Shape add (broadcast to other peers) ─────────────────────
  socket.on("shape_add", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }

    room.boardObjects.push({ type: "shape", payload, timestamp: Date.now() });
    room.redoObjects = []; // Clear redo stack on new action
    room.isDirty = true;
    room.boardCountSinceLastSync++;
    if (room.boardCountSinceLastSync >= 60) {
      import("../services/sync.service.js").then(m => m.saveRoomStateToBackend(room.id));
    }

    socket.to(socket.roomId).emit("shape_add", {
      roomId: socket.roomId,
      payload: { ...payload, timestamp: Date.now() },
    });
  });

  // ── Shape update (broadcast position/size changes) ───────────
  socket.on("shape_update", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }

    // Persist position/size changes in boardObjects
    const existing = room.boardObjects.find(
      (o) => o.type === "shape" && o.payload.id === payload.id
    );
    if (existing) {
      if (payload.position) (existing.payload as Record<string, unknown>).position = payload.position;
      if (payload.widthRatio !== undefined) (existing.payload as Record<string, unknown>).widthRatio = payload.widthRatio;
      if (payload.heightRatio !== undefined) (existing.payload as Record<string, unknown>).heightRatio = payload.heightRatio;
      room.isDirty = true;
    }

    socket.to(socket.roomId).emit("shape_update", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Stroke update (broadcast position/size changes after move) ──
  socket.on("stroke_update", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }

    // Persist position/size changes in boardObjects
    const existing = room.boardObjects.find(
      (o) => o.type === "stroke" && o.payload.id === payload.id
    );
    if (existing) {
      // Store movement offset as position override
      if (payload.position) (existing.payload as Record<string, unknown>).movedPosition = payload.position;
      if (payload.widthRatio !== undefined) (existing.payload as Record<string, unknown>).movedWidthRatio = payload.widthRatio;
      if (payload.heightRatio !== undefined) (existing.payload as Record<string, unknown>).movedHeightRatio = payload.heightRatio;
      room.isDirty = true;
    }

    socket.to(socket.roomId).emit("stroke_update", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── Toggle per-student drawing permission (teacher only) ─────
  socket.on("board_toggle_user_drawing", ({ payload }) => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    const { userId, enabled } = payload;
    if (enabled) {
      room.drawingEnabledUserIds.clear();
      room.drawingEnabledUserIds.add(userId);
    } else {
      room.drawingEnabledUserIds.delete(userId);
    }
    // Notify all participants of their (potentially revoked/granted) drawing state
    for (const [sid, p] of room.participants) {
      io.to(sid).emit("drawing_permission", {
        roomId: socket.roomId,
        payload: { enabled: room.drawingEnabledUserIds.has(p.user.id) },
      });
    }
    // Broadcast updated user list so teacher UI updates
    broadcastRoomUsers(socket.roomId, io);
  });

  // ── Global view lock (teacher only) ─────────────────────────
  socket.on("board_toggle_view_lock", ({ payload }) => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    
    // Using a new parameter on room or extending it dynamically since it's just a runtime broadcast for now
    room.isViewLocked = !!payload.enabled;
    
    io.in(socket.roomId).emit("view_locked_state", {
      roomId: socket.roomId,
      payload: { isLocked: !!payload.enabled },
    });
  });

  // ── Laser pointer relay ─────────────────────────────────────
  socket.on("laser_pointer", ({ payload }) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit("laser_pointer", {
      roomId: socket.roomId,
      payload: {
        userId: socket.userId,
        userName: socket.user?.name,
        ...payload,
      },
    });
  });

  // ── Object removal (Eraser) ──────────────────────────────────
  socket.on("object_remove", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (!isTeacherSocket(socket) && socket.userId) {
      if (!room.drawingEnabledUserIds.has(socket.userId)) return;
    }

    // Find and record deletion in history for Undo
    const index = room.boardObjects.findIndex(o => o.payload.id === payload.id);
    if (index !== -1) {
      const obj = room.boardObjects[index];
      room.boardObjects.splice(index, 1);
      // Push removal marker to history
      room.boardObjects.push({
        type: "removal",
        payload: { original: obj, index: index },
        timestamp: Date.now()
      });
      room.redoObjects = [];
      room.isDirty = true;
    }

    socket.to(socket.roomId).emit("object_remove", {
      roomId: socket.roomId,
      payload
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
    room.redoObjects = [];
    // Broadcast to everyone in the room (including sender via io.in)
    io.in(socket.roomId).emit("clear_canvas", {
      roomId: socket.roomId,
    });
  });

  // ── Undo (teacher only) ─────────────────────────────────────
  socket.on("board_undo", () => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    if (room.boardObjects.length === 0) return;

    const lastAction = room.boardObjects.pop();
    if (!lastAction) return;

    if (lastAction.type === "removal") {
      // Undo-ing a deletion -> Restore at original Z-order index
      const { original, index } = lastAction.payload;
      room.boardObjects.splice(index, 0, original);
      room.redoObjects.push(lastAction);
      
      let event = "";
      if (original.type === "stroke") event = "stroke_add";
      else if (original.type === "text") event = "text_add";
      else if (original.type === "shape") event = "shape_add";

      if (event) {
        io.in(socket.roomId).emit(event, {
          roomId: socket.roomId,
          payload: { ...original.payload, timestamp: Date.now() }
        });
      }
    } else {
      // Undo-ing an addition -> Standard remove
      room.redoObjects.push(lastAction);
      io.in(socket.roomId).emit("object_remove", {
        roomId: socket.roomId,
        payload: { id: lastAction.payload.id }
      });
    }
  });

  // ── Redo (teacher only) ─────────────────────────────────────
  socket.on("board_redo", () => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    if (room.redoObjects.length === 0) return;

    const action = room.redoObjects.pop();
    if (!action) return;

    if (action.type === "removal") {
      // Redo-ing a deletion -> Re-remove
      const originalId = action.payload.original.payload.id;
      const index = room.boardObjects.findIndex(o => o.payload.id === originalId);
      if (index !== -1) room.boardObjects.splice(index, 1);
      room.boardObjects.push(action);
      io.in(socket.roomId).emit("object_remove", {
        roomId: socket.roomId,
        payload: { id: originalId }
      });
    } else {
      // Redo-ing an addition -> Re-add
      action.timestamp = Date.now();
      room.boardObjects.push(action);
      
      let event = "";
      if (action.type === "stroke") event = "stroke_add";
      else if (action.type === "text") event = "text_add";
      else if (action.type === "shape") event = "shape_add";

      if (event) {
        io.in(socket.roomId).emit(event, {
          roomId: socket.roomId,
          payload: { ...action.payload, timestamp: Date.now() }
        });
      }
    }
  });

  // ── Board files & metadata ──────────────────────────────────
  socket.on("board_file_add", ({ payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
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
    io.in(socket.roomId).emit("board_file_add", { roomId: socket.roomId, payload: boardFile });
  });

  socket.on("board_file_remove", ({ payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    room.boardFiles = room.boardFiles.filter(f => f.id !== payload.id);
    io.in(socket.roomId).emit("board_file_remove", { roomId: socket.roomId, payload: { id: payload.id } });
  });

  socket.on("board_file_update", ({ payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    const file = room.boardFiles.find(f => f.id === payload.id);
    if (file) {
      if (payload.position) file.position = payload.position;
      if (payload.scale) file.scale = payload.scale;
    }
    socket.to(socket.roomId).emit("board_file_update", { roomId: socket.roomId, payload });
  });

  socket.on("board_color_change", ({ color, page }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    io.in(socket.roomId).emit("board_color_sync", { roomId: socket.roomId, color, page });
  });

  socket.on("page_update", (data) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    socket.to(socket.roomId).emit("page_update", { roomId: socket.roomId, payload: data.payload });
  });

  socket.on("view_sync", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const isTeacher = isTeacherSocket(socket);
    const isDrawingEnabled = socket.userId && room.drawingEnabledUserIds.has(socket.userId);
    if (!isTeacher && !isDrawingEnabled) return;
    socket.to(socket.roomId).emit("view_sync", { roomId: socket.roomId, payload });
  });

  socket.on("board_request_objects", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const pageNum = payload.page ?? 0;
    // IMPORTANT: Filter out removal actions for new joiners
    const objects = room.boardObjects.filter(obj => obj.type !== "removal" && obj.payload.page === pageNum);
    socket.emit("board_objects_state", { roomId: socket.roomId, payload: objects });
  });
}

// ─── REST routes ──────────────────────────────────────────────

export function registerDrawingRoutes(app: Application) {
  app.get("/load/:roomId", (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ ok: false });
    res.json({ ok: true, snapshot: pageSnapshot(getPage(room, room.currentPageId)) });
  });

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
