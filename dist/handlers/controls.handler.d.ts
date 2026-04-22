/**
 * ─── Controls Handler ─────────────────────────────────────────
 * SECTION: Session Controls (Lock, Freeze, Pages, Timer)
 *
 * Features:
 *  - Lock canvas (students can't draw)
 *  - Freeze canvas (nobody can draw, fit-to-screen)
 *  - Page management (add, switch, delete pages)
 *  - Background color per page
 *  - Session duration / timer control
 *  - End session (disconnect all, cleanup)
 */
import type { Server } from "socket.io";
import type { Application } from "express";
export declare function registerControlsRoutes(app: Application, io: Server): void;
//# sourceMappingURL=controls.handler.d.ts.map