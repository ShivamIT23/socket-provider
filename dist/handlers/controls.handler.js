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
import { rooms, ensureRoom, createPage, getPage, pageSnapshot, isTeacherAuth, } from "../room.js";
import { stopRoomTimer } from "../services/timer.service.js";
import { saveRoomStateToBackend } from "../services/sync.service.js";
import { CFG, log } from "../config.js";
// ─── Helpers ──────────────────────────────────────────────────
function broadcastPageState(roomId, io) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    io.to(roomId).emit("page_state", {
        roomId,
        payload: { pages: room.pages.map(p => ({ id: p.id })), currentPageId: room.currentPageId },
    });
}
function requireTeacher(roomId, userId, res) {
    if (!isTeacherAuth(roomId, userId)) {
        res.status(403).json({ error: "Unauthorized" });
        return null;
    }
    return ensureRoom(roomId);
}
// ─── REST routes ──────────────────────────────────────────────
export function registerControlsRoutes(app, io) {
    // ── Lock canvas ─────────────────────────────────────────────
    app.post("/api/room/:roomId/lock", (req, res) => {
        const room = requireTeacher(req.params.roomId, req.body.userId, res);
        if (!room)
            return;
        room.isLocked = req.body.isLocked;
        io.to(req.params.roomId).emit("lock_state", {
            roomId: req.params.roomId,
            payload: { isLocked: room.isLocked },
        });
        res.json({ ok: true });
    });
    // ── Freeze canvas ───────────────────────────────────────────
    app.post("/api/room/:roomId/freeze", (req, res) => {
        const room = requireTeacher(req.params.roomId, req.body.userId, res);
        if (!room)
            return;
        room.isFrozen = req.body.isFrozen;
        io.to(req.params.roomId).emit("frozen_state", {
            roomId: req.params.roomId,
            payload: { isFrozen: room.isFrozen },
        });
        res.json({ ok: true });
    });
    // ── End session ─────────────────────────────────────────────
    app.post("/api/room/:roomId/end", async (req, res) => {
        const { roomId } = req.params;
        const room = requireTeacher(roomId, req.body.userId, res);
        if (!room)
            return;
        // Notify main backend that class is ended
        try {
            await fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/${roomId}/end`, {
                method: "POST",
                headers: { "x-internal-secret": CFG.INTERNAL_SECRET }
            });
        }
        catch (e) {
            log.error(`Failed to notify main backend of session end for ${roomId}:`, e);
        }
        io.to(roomId).emit("session_ended", { roomId });
        io.in(roomId).disconnectSockets(true);
        stopRoomTimer(roomId);
        await saveRoomStateToBackend(roomId);
        rooms.delete(roomId);
        res.json({ ok: true });
    });
    // ── Duration ────────────────────────────────────────────────
    app.get("/api/duration/:roomId", (req, res) => {
        const room = rooms.get(req.params.roomId);
        res.json({ duration: room?.duration ?? null });
    });
    app.post("/api/duration/:roomId", (req, res) => {
        const room = ensureRoom(req.params.roomId);
        if (room.timerStarted)
            return res.status(400).json({ error: "Timer already started" });
        room.duration = req.body.duration;
        res.json({ success: true, duration: room.duration });
    });
    // ── Page: Add ───────────────────────────────────────────────
    app.post("/api/room/:roomId/page/add", (req, res) => {
        const room = requireTeacher(req.params.roomId, req.body.userId, res);
        if (!room)
            return;
        const page = createPage();
        room.pages.push(page);
        room.currentPageId = page.id;
        room.isDirty = true;
        broadcastPageState(req.params.roomId, io);
        io.to(req.params.roomId).emit("snapshot", {
            roomId: req.params.roomId,
            payload: pageSnapshot(page),
        });
        res.json({ ok: true, pageId: page.id });
    });
    // ── Page: Switch ────────────────────────────────────────────
    app.post("/api/room/:roomId/page/set", (req, res) => {
        const room = requireTeacher(req.params.roomId, req.body.userId, res);
        if (!room)
            return;
        const page = getPage(room, req.body.pageId);
        room.currentPageId = page.id;
        broadcastPageState(req.params.roomId, io);
        io.to(req.params.roomId).emit("snapshot", {
            roomId: req.params.roomId,
            payload: pageSnapshot(page),
        });
        res.json({ ok: true, pageId: page.id });
    });
    // ── Page: Delete ────────────────────────────────────────────
    app.post("/api/room/:roomId/page/delete", (req, res) => {
        const room = requireTeacher(req.params.roomId, req.body.userId, res);
        if (!room)
            return;
        const { pageId } = req.body;
        const idx = room.pages.findIndex(p => p.id === pageId);
        if (idx === -1)
            return res.status(404).json({ error: "Page not found" });
        if (room.pages.length <= 1)
            return res.status(400).json({ error: "Cannot delete last page" });
        room.pages.splice(idx, 1);
        if (room.currentPageId === pageId)
            room.currentPageId = room.pages[Math.max(0, idx - 1)].id;
        room.isDirty = true;
        io.to(req.params.roomId).emit("delete_page", {
            roomId: req.params.roomId,
            payload: { pageId },
        });
        broadcastPageState(req.params.roomId, io);
        io.to(req.params.roomId).emit("snapshot", {
            roomId: req.params.roomId,
            payload: pageSnapshot(getPage(room, room.currentPageId)),
        });
        res.json({ ok: true });
    });
    // ── Page: Background color ──────────────────────────────────
    app.post("/api/room/:roomId/page/background", (req, res) => {
        const room = ensureRoom(req.params.roomId);
        const page = getPage(room, req.body.pageId || room.currentPageId);
        page.backgroundColor = req.body.backgroundColor;
        room.isDirty = true;
        io.to(req.params.roomId).emit("background_change", {
            roomId: req.params.roomId,
            payload: { backgroundColor: page.backgroundColor, pageId: page.id },
        });
        res.json({ ok: true });
    });
}
//# sourceMappingURL=controls.handler.js.map