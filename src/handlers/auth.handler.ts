/**
 * ─── Auth Handler ─────────────────────────────────────────────
 * SECTION: Core Connection
 * 
 * Handles socket join (with backend verification) and disconnect.
 * This is the "plumbing" — every other handler depends on this
 * having run first to set socket.roomId / socket.user.
 */

import type { Server } from "socket.io";
import type { Application } from "express";
import cookie from "cookie";
import type { CustomSocket } from "../types.js";
import { rooms, ensureRoom, getPage, pageSnapshot } from "../room.js";
import { CFG, log } from "../config.js";
import { startRoomTimer, stopRoomTimer } from "../services/timer.service.js";
import { saveRoomStateToBackend } from "../services/sync.service.js";

// ─── Broadcast helpers (used within join) ─────────────────────

async function broadcastRoomUsers(roomId: string, io: Server) {
  const room = rooms.get(roomId);
  if (!room) return;
  const all = Array.from(room.participants.values());
  const sockets = await io.in(roomId).fetchSockets() as unknown as CustomSocket[];
  for (const s of sockets) {
    const isStaff = s.user?.isTeacher || s.user?.isCounsellor;
    s.emit("room_users", {
      roomId,
      payload: {
        count: all.length,
        hasTeacher: !!room.ownerUserId,
        users: isStaff ? all.map(p => ({
          user_id: p.user.id, username: p.user.name,
          isMuted: room.mutedUserIds.has(p.user.id),
          mediaState: p.mediaState,
        })) : [],
      },
    });
  }
}

// Re-export for other handlers that need it
export { broadcastRoomUsers };

// ─── Socket handlers ──────────────────────────────────────────

export function registerAuthSocketHandlers(socket: CustomSocket, io: Server) {

  socket.on("join", async ({ roomId, payload }) => {
    socket.roomId = roomId;
    socket.user = payload?.user ?? { id: socket.id, name: "Unknown", isTeacher: false };
    if (!socket.user!.id) socket.user!.id = socket.id;

    // ── Verify against main backend ───────────────────────────
    try {
      const cookies = socket.handshake.headers.cookie
        ? cookie.parse(socket.handshake.headers.cookie) : {};
      const token = cookies.token ?? cookies.accessToken ?? payload?.token;
      const resp = await fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: roomId, token }),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        if (data?.data?.valid) {
          const u = data.data.user;
          socket.user = {
            id: u.id, name: u.name, isTeacher: u.isTeacher,
            isCounsellor: u.isCounsellor, usertype: u.usertype,
          };
        }
      }
    } catch (e: any) {
      log.warn("Auth error:", e.message);
    }

    socket.userId = socket.user!.id;
    const room = ensureRoom(roomId);

    // Cancel cleanup timer
    if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }

    // Duration init
    if (!room.timerStarted && !room.duration && payload?.duration) room.duration = payload.duration;

    // Teacher setup
    if (socket.user!.isTeacher) {
      room.teacherSocketId = socket.id;
      room.ownerUserId = socket.user!.id;
      if (room.duration && !room.timerStarted) startRoomTimer(roomId, io);
    }

    // Counsellor setup
    if (socket.user!.isCounsellor) room.counsellorSocketId = socket.id;

    // Join the Socket.IO room
    socket.join(roomId);
    room.participants.set(socket.user!.id, {
      user: socket.user!, socketId: socket.id,
      mediaState: { audio: false, video: false }, pointer: null,
    });
    socket.chatRate = { count: 0, lastReset: Date.now() };

    log.info(`Join: ${socket.user!.name} teacher=${socket.user!.isTeacher} room=${roomId}`);

    // Notify others
    socket.to(roomId).emit("user_join", { roomId, payload: { user: socket.user } });
    await broadcastRoomUsers(roomId, io);

    // ── Full room state for newcomer ──────────────────────────
    socket.emit("page_state", {
      roomId,
      payload: { pages: room.pages.map(p => ({ id: p.id })), currentPageId: room.currentPageId },
    });
    socket.emit("snapshot", { roomId, payload: pageSnapshot(getPage(room, room.currentPageId)) });

    // Chat state
    if (room.chat.length) socket.emit("chat_history", { roomId, payload: room.chat });
    socket.emit("chat_state", { roomId, payload: { enabled: room.settings.chatEnabled } });
    if (room.mutedUserIds.has(socket.userId!))
      socket.emit("user_muted_status", { roomId, payload: { isMuted: true } });

    // Lock / freeze state
    if (room.isLocked) socket.emit("lock_state", { roomId, payload: { isLocked: true } });
    if (room.isFrozen) socket.emit("frozen_state", { roomId, payload: { isFrozen: true } });

    // Viewport state
    socket.emit("viewport_sync_state", { roomId, payload: { isViewportSynced: room.isViewportSynced } });
    socket.emit("viewport_lock_state", { roomId, payload: { isViewportLocked: room.isViewportLocked, viewport: room.lastViewport } });
    if (room.isViewportSynced && room.lastViewport)
      socket.emit("viewport_update", { roomId, payload: room.lastViewport });

    // Timer sync for late joiners
    if (room.timerStarted && room.startTime && room.duration) {
      const secs = Math.max(0, Math.ceil((room.duration * 60 * 1000 - (Date.now() - room.startTime)) / 1000));
      socket.emit("timer_update", {
        roomId,
        payload: {
          timeLeft: `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`,
          remainingSeconds: secs,
        },
      });
    }
  });

  // ── Disconnect ──────────────────────────────────────────────
  socket.on("disconnect", async (reason) => {
    log.info(`Disconnected: ${socket.id} (${reason})`);
    if (!socket.roomId || !socket.userId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.participants.delete(socket.userId);
    if (room.teacherSocketId === socket.id) room.teacherSocketId = null;
    if (room.counsellorSocketId === socket.id) room.counsellorSocketId = null;

    socket.to(socket.roomId).emit("user_leave", {
      roomId: socket.roomId,
      payload: { userId: socket.userId },
    });
    await broadcastRoomUsers(socket.roomId, io);

    const size = io.sockets.adapter.rooms.get(socket.roomId)?.size ?? 0;
    if (size === 0) {
      await saveRoomStateToBackend(socket.roomId);
      const rid = socket.roomId;
      room.cleanupTimer = setTimeout(() => {
        stopRoomTimer(rid);
        rooms.delete(rid);
        log.info(`Room ${rid} cleaned up`);
      }, CFG.ROOM_CLEANUP_DELAY_MS);
    }
  });
}

// ─── REST routes ──────────────────────────────────────────────

export function registerAuthRoutes(app: Application) {
  app.get("/", (_req, res) => res.send("TutorArc Socket Provider\n"));
}
