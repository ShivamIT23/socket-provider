/**
 * ─── Chat Handler ─────────────────────────────────────────────
 * SECTION: Chat & Messaging
 *
 * Features:
 *  - Send/receive messages with rate limiting
 *  - Chat history (last 200 messages)
 *  - Mute/unmute individual users
 *  - Toggle chat on/off globally
 *  - Delete individual messages or clear all
 *  - Typing indicators
 */

import type { Server } from "socket.io";
import type { Application } from "express";
import type { CustomSocket, ChatMessage } from "../types.js";
import { rooms, ensureRoom, isTeacherSocket, isTeacherAuth } from "../room.js";
import { CFG } from "../config.js";
import { broadcastRoomUsers } from "./auth.handler.js";

// ─── Socket handlers ──────────────────────────────────────────

export function registerChatSocketHandlers(socket: CustomSocket, io: Server) {

  // ── Send message ────────────────────────────────────────────
  socket.on("chat", async ({ payload }) => {
    if (!socket.roomId || !socket.userId) return;
    const room = ensureRoom(socket.roomId);

    // Guard: individual overrides or global default
    let textAllowed = room.settings.chatEnabled;
    if (room.textEnabledUserIds.has(socket.userId)) textAllowed = true;
    if (room.textDisabledUserIds.has(socket.userId)) textAllowed = false;

    if (payload.message && !textAllowed && !isTeacherSocket(socket)) {
      socket.emit("error", { message: "Text messages are currently disabled for you." });
      return;
    }

    let attachmentsAllowed = room.settings.attachmentsEnabled;
    if (room.attachmentsEnabledUserIds.has(socket.userId)) attachmentsAllowed = true;
    if (room.attachmentsDisabledUserIds.has(socket.userId)) attachmentsAllowed = false;

    if (payload.attachments && !attachmentsAllowed && !isTeacherSocket(socket)) {
      socket.emit("error", { message: "File sharing is currently disabled for you." });
      return;
    }

    // Guard: user muted
    if (room.mutedUserIds.has(socket.userId) && !isTeacherSocket(socket)) {
      socket.emit("error", { message: "You have been muted." });
      return;
    }

    // Rate limiting
    const now = Math.floor(Date.now() / 1000) * 1000;
    if (socket.chatRate && now - socket.chatRate.lastReset > 60_000)
      socket.chatRate = { count: 0, lastReset: now };
    socket.chatRate!.count++;
    if (socket.chatRate!.count > CFG.MAX_CHAT_PER_MINUTE) {
      socket.emit("error", { message: "Rate limit exceeded." });
      return;
    }

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      user: { name: socket.user!.name, isTeacher: !!socket.user!.isTeacher },
      message: String(payload.message).slice(0, 2000),
      attachments: payload.attachments, // future support for photos/files
      timestamp: now,
    };

    room.chat.push(msg);
    if (room.chat.length > CFG.MAX_CHAT_HISTORY)
      room.chat.splice(0, room.chat.length - CFG.MAX_CHAT_HISTORY);
    
    room.isDirty = true;
    room.chatCountSinceLastSync++;

    // Immediate sync if 60 chats reached
    if (room.chatCountSinceLastSync >= 60) {
      import("../services/sync.service.js").then(m => m.saveRoomStateToBackend(room.id));
    }

    io.to(socket.roomId).emit("chat", { roomId: socket.roomId, payload: msg });
  });

  // ── Delete message (teacher only) ───────────────────────────
  socket.on("chat_delete", ({ roomId, payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    room.chat = room.chat.filter(m => m.id !== payload.id);
    room.isDirty = true;
    io.to(roomId).emit("chat_delete", { roomId, payload: { id: payload.id } });
  });

  // ── Clear all messages (teacher only) ───────────────────────
  socket.on("chat_clear", ({ roomId }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    room.chat = [];
    room.isDirty = true;
    io.to(roomId).emit("chat_clear", { roomId, payload: {} });
  });

  // ── Toggle chat on/off (teacher only) ───────────────────────
  socket.on("chat_toggle", ({ roomId, payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    room.settings.chatEnabled = payload.enabled;
    // Clear individual overrides when changing global state
    room.textDisabledUserIds.clear();
    room.textEnabledUserIds.clear();
    io.to(roomId).emit("chat_state", { roomId, payload: { settings: room.settings } });
    broadcastRoomUsers(roomId, io);
  });

  // ── Toggle attachments on/off (teacher only) ─────────────────
  socket.on("chat_toggle_attachments", ({ roomId, payload }) => {
    if (!isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    room.settings.attachmentsEnabled = payload.enabled;
    // Clear individual overrides when changing global state
    room.attachmentsDisabledUserIds.clear();
    room.attachmentsEnabledUserIds.clear();
    io.to(roomId).emit("chat_state", { roomId, payload: { settings: room.settings } });
    broadcastRoomUsers(roomId, io);
  });


  // ── Mute user (teacher only) ────────────────────────────────
  socket.on("chat_mute_user", async ({ roomId, payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    room.mutedUserIds.add(payload.userId);
    const sockets = await io.in(roomId).fetchSockets() as unknown as CustomSocket[];
    sockets.find(s => s.userId === payload.userId)
      ?.emit("user_muted_status", { roomId, payload: { isMuted: true } });
    await broadcastRoomUsers(roomId, io);
  });

  // ── Unmute user (teacher only) ──────────────────────────────
  socket.on("chat_unmute_user", async ({ roomId, payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    room.mutedUserIds.delete(payload.userId);
    const sockets = await io.in(roomId).fetchSockets() as unknown as CustomSocket[];
    sockets.find(s => s.userId === payload.userId)
      ?.emit("user_muted_status", { roomId, payload: { isMuted: false } });
    await broadcastRoomUsers(roomId, io);
  });

  // ── Typing indicator ───────────────────────────────────────
  socket.on("typing", ({ payload }) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit("typing", {
      roomId: socket.roomId,
      payload: { user: socket.user, isTyping: payload.isTyping },
    });
  });

  // ── Toggle user text (teacher only) ─────────────────────────
  socket.on("chat_toggle_user_text", async ({ roomId, payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    if (!payload.enabled) {
      room.textDisabledUserIds.add(payload.userId);
      room.textEnabledUserIds.delete(payload.userId);
    } else {
      room.textEnabledUserIds.add(payload.userId);
      room.textDisabledUserIds.delete(payload.userId);
    }
    await broadcastRoomUsers(roomId, io);
  });

  // ── Toggle user attachments (teacher only) ──────────────────
  socket.on("chat_toggle_user_attachments", async ({ roomId, payload }) => {
    if (!socket.roomId || !isTeacherSocket(socket)) return;
    const room = ensureRoom(roomId);
    if (!payload.enabled) {
      room.attachmentsDisabledUserIds.add(payload.userId);
      room.attachmentsEnabledUserIds.delete(payload.userId);
    } else {
      room.attachmentsEnabledUserIds.add(payload.userId);
      room.attachmentsDisabledUserIds.delete(payload.userId);
    }
    await broadcastRoomUsers(roomId, io);
  });
}

// ─── REST routes ──────────────────────────────────────────────

export function registerChatRoutes(app: Application, io: Server) {
  // Toggle chat
  app.post("/api/room/:roomId/chat/toggle", (req, res) => {
    const { roomId } = req.params;
    if (!isTeacherAuth(roomId, req.body.userId)) return res.status(403).json({ error: "Unauthorized" });
    const room = ensureRoom(roomId);
    room.settings.chatEnabled = req.body.enabled;
    io.to(roomId).emit("chat_state", { roomId, payload: { enabled: room.settings.chatEnabled } });
    res.json({ ok: true });
  });
}
