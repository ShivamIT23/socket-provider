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
import type { CustomSocket } from "../types.js";
export declare function registerVideoSocketHandlers(socket: CustomSocket): void;
export declare function registerVideoRoutes(app: Application): void;
//# sourceMappingURL=video.handler.d.ts.map