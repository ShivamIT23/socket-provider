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
import { AccessToken } from "livekit-server-sdk";
import { rooms } from "../room.js";
import { CFG } from "../config.js";
// ─── Socket handlers ──────────────────────────────────────────
export function registerVideoSocketHandlers(socket) {
    // ── Media state (track on/off broadcast) ────────────────────
    socket.on("media_state", ({ payload }) => {
        if (!socket.roomId || !socket.userId)
            return;
        const p = rooms.get(socket.roomId)?.participants.get(socket.userId);
        if (p)
            p.mediaState = payload;
        socket.to(socket.roomId).emit("media_state", {
            roomId: socket.roomId,
            payload: { userId: socket.userId, ...payload },
        });
    });
    // ── Raise hand ──────────────────────────────────────────────
    socket.on("raise_hand", () => {
        if (!socket.roomId)
            return;
        const room = rooms.get(socket.roomId);
        if (!room?.teacherSocketId)
            return;
        socket.to(room.teacherSocketId).emit("hand_raised", {
            roomId: socket.roomId,
            payload: { userId: socket.userId, name: socket.user?.name },
        });
    });
}
// ─── REST routes ──────────────────────────────────────────────
export function registerVideoRoutes(app) {
    // ── LiveKit token ───────────────────────────────────────────
    app.post("/api/livekit/token", async (req, res) => {
        const { roomId, userId, userName, isTeacher } = req.body;
        if (!roomId || !userId)
            return res.status(400).json({ error: "roomId and userId required" });
        if (!CFG.LIVEKIT_API_KEY || !CFG.LIVEKIT_API_SECRET) {
            return res.status(503).json({ error: "LiveKit not configured" });
        }
        const at = new AccessToken(CFG.LIVEKIT_API_KEY, CFG.LIVEKIT_API_SECRET, {
            identity: userId,
            name: userName,
            ttl: "4h",
        });
        at.addGrant({
            room: roomId,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: false,
            roomAdmin: !!isTeacher,
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
//# sourceMappingURL=video.handler.js.map