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
export declare function registerDrawingSocketHandlers(socket: CustomSocket, io: Server): void;
export declare function registerDrawingRoutes(app: Application): void;
//# sourceMappingURL=drawing.handler-vcxt.d.ts.map