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

    const lastObj = room.boardObjects.pop();
    if (lastObj) {
      room.redoObjects.push(lastObj);
      io.in(socket.roomId).emit("object_remove", {
        roomId: socket.roomId,
        payload: { id: lastObj.payload.id }
      });
    }
  });

  // ── Redo (teacher only) ─────────────────────────────────────
  socket.on("board_redo", () => {
    if (!socket.roomId) return;
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    if (room.redoObjects.length === 0) return;

    const obj = room.redoObjects.pop();
    if (obj) {
      obj.timestamp = Date.now();
      room.boardObjects.push(obj);
      // Re-emit based on type
      let event = "";
      if (obj.type === "stroke") event = "stroke_add";
      else if (obj.type === "text") event = "text_add";
      else if (obj.type === "shape") event = "shape_add";

      if (event) {
        io.in(socket.roomId).emit(event, {
          roomId: socket.roomId,
          payload: obj.payload
        });
      }
    }
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
    socket.to(socket.roomId).emit("page_update", {
      roomId: socket.roomId,
      payload,
    });
  });

  // ── View Sync (teacher + drawing-enabled students) ─────────────
  socket.on("view_sync", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    // Allow teacher OR drawing-enabled students to broadcast scroll
    const isTeacher = isTeacherSocket(socket);
    const isDrawingEnabled = socket.userId && room.drawingEnabledUserIds.has(socket.userId);
    if (!isTeacher && !isDrawingEnabled) return;
    socket.to(socket.roomId).emit("view_sync", {
      roomId: socket.roomId,
      payload,
    });
  });
  // ── Request objects for a specific page ─────────────────────
  socket.on("board_request_objects", ({ payload }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const pageNum = payload.page ?? 0;
    
    const objects = room.boardObjects.filter(obj => obj.payload.page === pageNum);
    if (objects.length > 0) {
      socket.emit("board_objects_state", { roomId: socket.roomId, payload: objects });
    }
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
