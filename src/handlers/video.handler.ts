/**
 * ─── Video Handler ────────────────────────────────────────────
 * SECTION: Video Conferencing (LiveKit)
 *
 * Features:
 *  - LiveKit JWT token generation
 *  - ICE/TURN config endpoint (fallback WebRTC)
 *  - Media state broadcast (audio/video on/off)
 *  - Raise hand notification
 */


import type { Application } from "express";
import { AccessToken } from "livekit-server-sdk";
import type { CustomSocket } from "../types.js";
import { rooms } from "../room.js";
import { CFG } from "../config.js";

// ─── Socket handlers ──────────────────────────────────────────

export function registerVideoSocketHandlers(socket: CustomSocket) {

  // ── Media state (track on/off broadcast) ────────────────────
  socket.on("media_state", ({ payload }) => {
    if (!socket.roomId || !socket.userId) return;
    const p = rooms.get(socket.roomId)?.participants.get(socket.userId);
    if (p) p.mediaState = payload;
    socket.to(socket.roomId).emit("media_state", {
      roomId: socket.roomId,
      payload: { userId: socket.userId, ...payload },
    });
  });

  // ── Raise hand ──────────────────────────────────────────────
  socket.on("raise_hand", () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room?.teacherSocketId) return;
    socket.to(room.teacherSocketId).emit("hand_raised", {
      roomId: socket.roomId,
      payload: { userId: socket.userId, name: socket.user?.name },
    });
  });

  // ── YouTube Video Sync ──────────────────────────────────────
  socket.on("yt_sync", ({ roomId, payload }) => {
    const targetRoomId = roomId || socket.roomId;
    if (!targetRoomId || !socket.userId) return;
    const room = rooms.get(targetRoomId);
    if (!room) return;

    const isTeacher = socket.user?.isTeacher || room.ownerUserId === socket.userId;
    if (!isTeacher) return;

    room.youtubeState = {
      videoId: payload.videoId,
      playStatus: payload.playStatus,
      currentTime: payload.currentTime,
      lastUpdated: Date.now(),
    };

    socket.to(targetRoomId).emit("yt_sync", {
      roomId: targetRoomId,
      payload: room.youtubeState,
    });
  });

  socket.on("yt_close", ({ roomId }) => {
    const targetRoomId = roomId || socket.roomId;
    if (!targetRoomId || !socket.userId) return;
    const room = rooms.get(targetRoomId);
    if (!room) return;

    const isTeacher = socket.user?.isTeacher || room.ownerUserId === socket.userId;
    if (!isTeacher) return;

    delete room.youtubeState;

    socket.to(targetRoomId).emit("yt_close", {
      roomId: targetRoomId,
    });
  });
}

// ─── REST routes ──────────────────────────────────────────────

export function registerVideoRoutes(app: Application) {

  // ── LiveKit token ───────────────────────────────────────────
  app.post("/api/livekit/token", async (req, res) => {
    const { roomId, userId, userName, isTeacher } = req.body;
    if (!roomId || !userId) return res.status(400).json({ error: "roomId and userId required" });
    if (!CFG.LIVEKIT_API_KEY || !CFG.LIVEKIT_API_SECRET) {
      return res.status(503).json({ error: "LiveKit not configured" });
    }

    console.log(`[LiveKit Token] Generating token using API_KEY: ${CFG.LIVEKIT_API_KEY}`);

    const at = new AccessToken(CFG.LIVEKIT_API_KEY, CFG.LIVEKIT_API_SECRET, {
      identity: userId,
      name: userName,
      ttl: "4h",
    });

    const isTeacherRole = Boolean(isTeacher);

    at.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: isTeacherRole,      // ONLY Teacher can publish audio + video tracks
      canSubscribe: true,            // Everyone can subscribe/receive tracks
      canPublishData: isTeacherRole,
      roomAdmin: isTeacherRole,
    });

    res.json({ token: await at.toJwt(), wsUrl: CFG.LIVEKIT_WS_URL });
  });

  // ── ICE config (fallback WebRTC, not LiveKit) ───────────────
  app.get("/api/ice-config", (_req, res) => {
    res.json({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        ...(CFG.TURN_URLS.length ? [{
          urls: CFG.TURN_URLS,
          username: CFG.TURN_USERNAME,
          credential: CFG.TURN_CREDENTIAL,
        }] : []),
      ],
    });
  });
}
