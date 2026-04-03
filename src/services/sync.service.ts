/**
 * ─── Backend Sync Service ─────────────────────────────────────
 * Periodically saves dirty room state to backend API.
 * Handles GC of stale rooms & graceful shutdown.
 */

import { rooms } from "../room.js";
import { CFG, log } from "../config.js";
import { stopRoomTimer } from "./timer.service.js";

// ─── Save a single room to the backend ────────────────────────

export async function saveRoomStateToBackend(roomId: string) {
  const room = rooms.get(roomId);
  if (!room?.isDirty) return;
  try {
    const res = await fetch(`${CFG.MAIN_BACKEND_URL}/api/v1/session/internal/save-state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: roomId,
        boardState: {
          pages: room.pages.map(p => ({
            id: p.id,
            elements: Array.from(p.elements.values()),
            backgroundColor: p.backgroundColor,
            appState: p.appState,
          })),
          currentPageId: room.currentPageId,
        },
        chatState: room.chat,
      }),
    });
    if (res.ok) { room.isDirty = false; log.debug(`Synced room ${roomId}`); }
    else log.warn(`Sync failed ${roomId}: ${res.status}`);
  } catch (e: any) {
    log.error(`Sync error ${roomId}:`, e.message);
  }
}

// ─── Background jobs ──────────────────────────────────────────

let syncJob: NodeJS.Timeout;
let gcJob: NodeJS.Timeout;

export function startBackgroundJobs() {
  // Sync dirty rooms every 30s
  syncJob = setInterval(async () => {
    const dirty = [...rooms.values()].filter(r => r.isDirty && r.participants.size > 0);
    await Promise.all(dirty.map(r => saveRoomStateToBackend(r.id)));
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

export async function shutdown(server: { close: (cb: () => void) => void }) {
  log.info("Shutting down...");
  stopBackgroundJobs();
  await Promise.all([...rooms.keys()].map(saveRoomStateToBackend));
  server.close(() => process.exit(0));
}
