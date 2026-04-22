/**
 * ─── Backend Sync Service ─────────────────────────────────────
 * Periodically saves dirty room state to backend API.
 * Handles GC of stale rooms & graceful shutdown.
 */
import { rooms } from "../room.js";
import { CFG, log } from "../config.js";
import { stopRoomTimer } from "./timer.service.js";
// ─── Save a single room to the backend ────────────────────────
export async function saveRoomStateToBackend(roomId) {
    const room = rooms.get(roomId);
    if (!room?.isDirty || Date.now() < room.nextAllowedSyncTime)
        return;
    try {
        const res = await fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/internal/save-state`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "x-internal-secret": CFG.INTERNAL_SECRET
            },
            body: JSON.stringify({
                sessionId: roomId,
                boardState: room.boardObjects.reduce((acc, obj) => {
                    const p = obj.payload.page || 1;
                    if (!acc[p])
                        acc[p] = [];
                    acc[p].push(obj);
                    return acc;
                }, {}),
                boardFiles: room.boardFiles,
                chatState: room.chat,
            }),
        });
        if (res.ok) {
            room.isDirty = false;
            room.chatCountSinceLastSync = 0;
            room.lastChatSyncTime = Date.now();
            room.syncErrorCount = 0;
            room.nextAllowedSyncTime = 0;
            log.debug(`Synced room ${roomId}`);
        }
        else {
            log.warn(`Sync failed ${roomId}: ${res.status}`);
            room.syncErrorCount++;
            const backoffMs = Math.min(30000 * Math.pow(2, room.syncErrorCount - 1), 600000);
            room.nextAllowedSyncTime = Date.now() + backoffMs;
        }
    }
    catch (e) {
        log.error(`Sync error ${roomId}:`, e instanceof Error ? e.message : String(e));
        room.syncErrorCount++;
        const backoffMs = Math.min(30000 * Math.pow(2, room.syncErrorCount - 1), 600000);
        room.nextAllowedSyncTime = Date.now() + backoffMs;
    }
}
// ─── Background jobs ──────────────────────────────────────────
let syncJob;
let gcJob;
export function startBackgroundJobs() {
    // Sync dirty rooms (board changes every 30s, or chats every 30s/60msg)
    syncJob = setInterval(async () => {
        const CHAT_SYNC_MS = 30 * 1000;
        const now = Date.now();
        const toSync = [...rooms.values()].filter(r => {
            if (r.participants.size === 0 || now < r.nextAllowedSyncTime)
                return false;
            const chatThresholdReached = r.chatCountSinceLastSync >= 60 || (now - r.lastChatSyncTime >= CHAT_SYNC_MS);
            return r.isDirty && (chatThresholdReached || r.chatCountSinceLastSync === 0);
            // Note: we still sync if isDirty is true from board changes, 
            // but we always sync if chat threshold is reached.
        });
        await Promise.all(toSync.map(r => saveRoomStateToBackend(r.id)));
    }, CFG.SYNC_INTERVAL_MS);
    // Garbage collect stale rooms every hour
    gcJob = setInterval(() => {
        const cutoff = Date.now() - CFG.ROOM_STALE_MS;
        for (const [id, room] of rooms) {
            if (room.lastActivity < cutoff) {
                stopRoomTimer(id);
                rooms.delete(id);
                log.info(`GC removed ${id}`);
            }
        }
    }, CFG.GC_INTERVAL_MS);
}
export function stopBackgroundJobs() {
    clearInterval(syncJob);
    clearInterval(gcJob);
}
// ─── Graceful shutdown ────────────────────────────────────────
export async function shutdown(server) {
    log.info("Shutting down...");
    stopBackgroundJobs();
    await Promise.all([...rooms.keys()].map(saveRoomStateToBackend));
    server.close(() => process.exit(0));
}
//# sourceMappingURL=sync.service.js.map