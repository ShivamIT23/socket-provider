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
  log.info(`Broadcasting users for room ${roomId}: Count = ${all.length}`);

  const data = {
    roomId,
    payload: {
      count: all.length,
      hasTeacher: !!room.ownerUserId,
      users: all.map(p => {
        let textAllowed = room.settings.chatEnabled;
        if (room.textEnabledUserIds.has(p.user.id)) textAllowed = true;
        if (room.textDisabledUserIds.has(p.user.id)) textAllowed = false;

        let attachmentsAllowed = room.settings.attachmentsEnabled;
        if (room.attachmentsEnabledUserIds.has(p.user.id)) attachmentsAllowed = true;
        if (room.attachmentsDisabledUserIds.has(p.user.id)) attachmentsAllowed = false;

        return {
          user_id: p.user.id,
          username: p.user.name,
          socket_id: p.socketId,
          isMuted: room.mutedUserIds.has(p.user.id),
          textEnabled: textAllowed,
          attachmentsEnabled: attachmentsAllowed,
          mediaState: p.mediaState,
        };
      }),
    },
  };

  io.to(roomId).emit("room_users", data);
  return data;
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
        headers: { 
          "Content-Type": "application/json",
          "x-internal-secret": CFG.INTERNAL_SECRET
        },
        body: JSON.stringify({ sessionId: roomId, token }),
      });
      if (resp.ok) {
        const u: any = await resp.json();
        // The API returns the user object directly now
        if (u && u.id) {
          const currentVisitorId = socket.user?.visitorId;
          socket.user = {
            id: u.id, 
            name: u.name || socket.user?.name || "Verified User", 
            isTeacher: u.role === 'teacher' || u.isTeacher,
            isCounsellor: u.isCounsellor, 
            usertype: u.usertype,
            visitorId: currentVisitorId, // Always preserve the visitorId from frontend
          };
          log.info(`Verified user: ${socket.user?.name} (visitorId: ${socket.user?.visitorId})`);
        }
      }
    } catch (e: any) {
      log.warn("Auth error:", e.message);
    }

    socket.userId = socket.user!.id;
    const room = ensureRoom(roomId);

    // ── DUPLICATE / RECONNECTION CHECK ────────────────────────
    // Check if this USER ID already has an active session in the room
    const existing = Array.from(room.participants.values()).find(p => p.user.id === socket.userId);
    const nameDuplicate = Array.from(room.participants.values()).find(p => 
      p.user.name.toLowerCase() === socket.user!.name.toLowerCase() && p.user.id !== socket.userId
    );

    if (nameDuplicate) {
      log.warn(`Join rejected: Name conflict for ${socket.user!.name}`);
      socket.emit("error", { message: "Someone else is already using this name in the room." });
      socket.disconnect();
      return;
    }

    // Optional: Log duplicate user presence (not rejection)
    if (existing) {
      log.info(`Multiple sessions for user ${socket.user!.name} (${socket.userId})`);
    }
    // ──────────────────────────────────────────────────────────

    // Update DB presence (isActive = 1) is already done at StudentGate, 
    // but we ensure it here if desired. 
    // For now we trust verifyStudent/StudentGate.

    // Cancel cleanup timer
    if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }

    // Duration init
    if (!room.timerStarted && !room.duration && payload?.duration) room.duration = payload.duration;

    // Teacher setup
    if (socket.user!.isTeacher) {
      room.teacherSocketId = socket.id;
      room.ownerUserId = socket.user!.id;
      if (room.duration && !room.timerStarted) startRoomTimer(roomId, io);

      // Update Teacher Presence in DB
      fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/${roomId}/presence`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-internal-secret": CFG.INTERNAL_SECRET
        },
        body: JSON.stringify({ present: true, role: 'teacher' }),
      }).catch(e => log.error("Teacher presence update failed:", e.message));
    }

    // Counsellor setup
    if (socket.user!.isCounsellor) room.counsellorSocketId = socket.id;

    // Join the Socket.IO room
    socket.join(roomId);
    room.participants.set(socket.id, {
      user: socket.user!, socketId: socket.id,
      mediaState: { audio: false, video: false }, pointer: null,
      joinedAt: Date.now(),
    });

    // ── DB PRESENCE UPDATE (isActive = 1) ─────────────────────
    if (socket.user?.visitorId) {
      fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/visitor/presence`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-internal-secret": CFG.INTERNAL_SECRET
        },
        body: JSON.stringify({ visitorId: socket.user.visitorId, isActive: true }),
      }).catch(e => log.error("Presence join update failed:", e.message));
    }
    // ──────────────────────────────────────────────────────────
    socket.chatRate = { count: 0, lastReset: Date.now() };

    log.info(`Join: ${socket.user!.name} | Role: ${socket.user!.isTeacher ? 'Teacher' : 'Student'} | VisitorID: ${socket.user?.visitorId} | Room: ${roomId}`);

    // Notify others AND send direct state to this newcomer to avoid race conditions
    socket.to(roomId).emit("user_join", { roomId, payload: { user: socket.user } });
    const usersData = await broadcastRoomUsers(roomId, io);
    socket.emit("room_users", usersData); // Targeted send to ensure newcomer sees correct count


    // ── Full room state for newcomer ──────────────────────────
    socket.emit("page_state", {
      roomId,
      payload: { pages: room.pages.map(p => ({ id: p.id })), currentPageId: room.currentPageId },
    });
    socket.emit("snapshot", { roomId, payload: pageSnapshot(getPage(room, room.currentPageId)) });

    // Chat state & local history (cached in RAM)
    socket.emit("chat_state", { roomId, payload: { settings: room.settings } });
    if (room.chat.length > 0) {
      socket.emit("chat_history", { roomId, payload: room.chat });
    }
    if (room.mutedUserIds.has(socket.userId!))
      socket.emit("user_muted_status", { roomId, payload: { isMuted: true } });

    // Lock / freeze state
    if (room.isLocked) socket.emit("lock_state", { roomId, payload: { isLocked: true } });
    if (room.isFrozen) socket.emit("frozen_state", { roomId, payload: { isFrozen: true } });

    // Board files state for newcomers
    if (room.boardFiles.length > 0) {
      socket.emit("board_files_state", { roomId, payload: room.boardFiles });
    }

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
    log.info(`Disconnected: ${socket.id} (room: ${socket.roomId}, user: ${socket.userId}, reason: ${reason})`);
    if (!socket.roomId || !socket.userId) {
      log.warn(`Missing roomId or userId on disconnect for socket ${socket.id}`);
      return;
    }
    const room = rooms.get(socket.roomId);
    if (!room) {
      log.warn(`Room ${socket.roomId} not found on disconnect for socket ${socket.id}`);
      return;
    }

    log.info(`Removing participant ${socket.id} from room ${socket.roomId}. Previous count: ${room.participants.size}`);
    room.participants.delete(socket.id);
    if (room.teacherSocketId === socket.id) {
       room.teacherSocketId = null;
       // Update Teacher Presence in DB (set to absent)
       fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/${socket.roomId}/presence`, {
         method: "POST",
         headers: { 
           "Content-Type": "application/json",
           "x-internal-secret": CFG.INTERNAL_SECRET
         },
         body: JSON.stringify({ present: false, role: 'teacher' }),
       }).catch(e => log.error("Teacher presence cleanup failed:", e.message));
    }
    if (room.counsellorSocketId === socket.id) room.counsellorSocketId = null;

    // ── DB PRESENCE UPDATE (isActive = 0) ─────────────────────
    if (socket.user?.visitorId) {
      log.info(`Updating DB presence for visitorId: ${socket.user.visitorId}`);
      fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/visitor/presence`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-internal-secret": CFG.INTERNAL_SECRET
        },
        body: JSON.stringify({ visitorId: socket.user.visitorId, isActive: false }),
      }).then(res => {
        if (!res.ok) log.error(`Presence update failed for visitor ${socket.user?.visitorId}: Status ${res.status}`);
        else log.info(`Presence update success for visitor ${socket.user?.visitorId}`);
      }).catch(e => log.error("Presence sync failed:", e.message));
    } else {
      log.warn(`No visitorId found for disconnecting user: ${socket.user?.name}`);
    }
    // ──────────────────────────────────────────────────────────

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
