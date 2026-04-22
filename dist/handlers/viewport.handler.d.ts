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
import type { CustomSocket } from "../types.js";
export declare function registerViewportSocketHandlers(socket: CustomSocket, io: Server): void;
export declare function registerViewportRoutes(app: Application, io: Server): void;
//# sourceMappingURL=viewport.handler.d.ts.map