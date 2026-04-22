/**
 * ═══════════════════════════════════════════════════════════════
 * TutorArc Collaboration Server — Entry Point
 * ═══════════════════════════════════════════════════════════════
 *
 * This file just WIRES the modular handlers together.
 * All feature logic lives in its own handler file:
 *
 *   handlers/
 *   ├── auth.handler.ts       → Join, disconnect, user verification
 *   ├── chat.handler.ts       → Messaging, mute, rate limiting
 *   ├── drawing.handler.ts    → Excalidraw CRDT sync, pointer
 *   ├── viewport.handler.ts   → Follow-me, lock, fit-to-content
 *   ├── controls.handler.ts   → Lock, freeze, pages, timer, end session
 *   └── video.handler.ts      → LiveKit token, media state, ICE
 *
 *   services/
 *   ├── timer.service.ts      → Room countdown timer
 *   └── sync.service.ts       → Backend sync, GC, graceful shutdown
 */
import express from "express";
import https from "http";
import { Server } from "socket.io";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
dotenv.config();
import { CFG, log } from "./config.js";
// ── Services ──────────────────────────────────────────────────
import { startBackgroundJobs, shutdown } from "./services/sync.service.js";
// ── Handlers (Socket) ─────────────────────────────────────────
import { registerAuthSocketHandlers, registerAuthRoutes } from "./handlers/auth.handler.js";
import { registerChatSocketHandlers, registerChatRoutes } from "./handlers/chat.handler.js";
import { registerDrawingSocketHandlers, registerDrawingRoutes } from "./handlers/drawing.handler.js";
import { registerViewportSocketHandlers, registerViewportRoutes } from "./handlers/viewport.handler.js";
import { registerControlsRoutes } from "./handlers/controls.handler.js";
import { registerVideoSocketHandlers, registerVideoRoutes } from "./handlers/video.handler.js";
// ═════════════════════════════════════════════════════════════
// 1. Express + HTTP + Socket.IO
// ═════════════════════════════════════════════════════════════
const app = express();
app.use(cors());
app.use(bodyParser.json());
const server = https.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 5 * 1024 * 1024,
});
// ═════════════════════════════════════════════════════════════
// 2. Register REST routes (one line per feature)
// ═════════════════════════════════════════════════════════════
registerAuthRoutes(app); // GET /
registerChatRoutes(app, io); // POST /api/room/:id/chat/*
registerDrawingRoutes(app); // GET/POST /load/:id, /save/:id
registerViewportRoutes(app, io); // POST /api/room/:id/viewport/*
registerControlsRoutes(app, io); // POST /api/room/:id/lock|freeze|end|page/*
registerVideoRoutes(app); // POST /api/livekit/token, GET /api/ice-config
// ═════════════════════════════════════════════════════════════
// 3. Register Socket.IO handlers (one line per feature)
// ═════════════════════════════════════════════════════════════
io.on("connection", (socket) => {
    log.info("Connected:", socket.id);
    registerAuthSocketHandlers(socket, io); // join, disconnect
    registerChatSocketHandlers(socket, io); // chat, mute, typing
    registerDrawingSocketHandlers(socket, io); // elements_update, pointer
    registerViewportSocketHandlers(socket, io); // viewport sync/lock/fit
    registerVideoSocketHandlers(socket); // media_state, raise_hand
});
// ═════════════════════════════════════════════════════════════
// 4. Background jobs & startup
// ═════════════════════════════════════════════════════════════
startBackgroundJobs();
process.on("SIGTERM", () => shutdown(server));
process.on("SIGINT", () => shutdown(server));
server.listen(CFG.PORT, "127.0.0.1", () => log.info(`Running on port ${CFG.PORT}`));
//# sourceMappingURL=index.js.map