/**
 * ─── Viewport Handler ─────────────────────────────────────────
 * SECTION: Viewport Synchronization
 *
 * Features:
 *  - "Follow me" — students auto-follow teacher's scroll/zoom
 *  - Viewport lock — students can't scroll away
 *  - Fit to content — zoom everyone to see all drawings
 *  - All controls are teacher-only
 */

import type { Server } from "socket.io";
import type { Application } from "express";
import type { CustomSocket, ViewportState } from "../types.js";
import { rooms, ensureRoom, isTeacherSocket, isTeacherAuth } from "../room.js";

// ─── Socket handlers ──────────────────────────────────────────

export function registerViewportSocketHandlers(socket: CustomSocket, io: Server) {

  // ── Teacher scrolls → students follow ───────────────────────
  socket.on("viewport_update", ({ payload }: { payload: ViewportState }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    room.lastViewport = payload;
    if (!room.isViewportSynced) return;
    socket.to(socket.roomId).emit("viewport_update", { roomId: socket.roomId, payload });
  });

  // ── Toggle follow-me mode ──────────────────────────────────
  socket.on("viewport_sync_toggle", ({ payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    room.isViewportSynced = payload.isViewportSynced;
    io.to(socket.roomId).emit("viewport_sync_state", {
      roomId: socket.roomId,
      payload: { isViewportSynced: room.isViewportSynced },
    });
    if (room.isViewportSynced && room.lastViewport) {
      io.to(socket.roomId).emit("viewport_update", {
        roomId: socket.roomId,
        payload: room.lastViewport,
      });
    }
  });

  // ── Toggle viewport lock ───────────────────────────────────
  socket.on("viewport_lock_toggle", ({ payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(socket.roomId);
    room.isViewportLocked = payload.isViewportLocked;
    if (payload.viewport) room.lastViewport = payload.viewport;
    io.to(socket.roomId).emit("viewport_lock_state", {
      roomId: socket.roomId,
      payload: { isViewportLocked: room.isViewportLocked, viewport: room.lastViewport },
    });
  });

  // ── Fit to content ─────────────────────────────────────────
  socket.on("fit_to_content", ({ payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    io.to(socket.roomId).emit("fit_to_content", {
      roomId: socket.roomId,
      payload: { fitToViewport: payload?.fitToViewport ?? false },
    });
  });
}

// ─── REST routes ──────────────────────────────────────────────

export function registerViewportRoutes(app: Application, io: Server) {
  // Toggle viewport sync via REST
  app.post("/api/room/:roomId/viewport/sync", (req, res) => {
    const { roomId } = req.params;
    if (!isTeacherAuth(roomId, req.body.userId)) return res.status(403).json({ error: "Unauthorized" });
    const room = ensureRoom(roomId);
    room.isViewportSynced = req.body.isViewportSynced;
    io.to(roomId).emit("viewport_sync_state", {
      roomId,
      payload: { isViewportSynced: room.isViewportSynced },
    });
    if (room.isViewportSynced && room.lastViewport) {
      io.to(roomId).emit("viewport_update", { roomId, payload: room.lastViewport });
    }
    res.json({ ok: true, isViewportSynced: room.isViewportSynced });
  });

  // Toggle viewport lock via REST
  app.post("/api/room/:roomId/viewport/lock", (req, res) => {
    const { roomId } = req.params;
    if (!isTeacherAuth(roomId, req.body.userId)) return res.status(403).json({ error: "Unauthorized" });
    const room = ensureRoom(roomId);
    room.isViewportLocked = req.body.isViewportLocked;
    io.to(roomId).emit("viewport_lock_state", {
      roomId,
      payload: { isViewportLocked: room.isViewportLocked, viewport: room.lastViewport },
    });
    res.json({ ok: true });
  });
}
