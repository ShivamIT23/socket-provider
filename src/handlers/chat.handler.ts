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

    // Guard: chat disabled
    if (!room.settings.chatEnabled && !isTeacherSocket(socket)) return;

    // Guard: user muted
    if (room.mutedUserIds.has(socket.userId) && !isTeacherSocket(socket)) {
      socket.emit("error", { message: "You have been muted." });
      return;
    }

    // Rate limiting
    const now = Date.now();
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
    io.to(roomId).emit("chat_state", { roomId, payload: { enabled: room.settings.chatEnabled } });
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
