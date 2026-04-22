/**
 * ─── Timer Service ────────────────────────────────────────────
 * Manages room countdown timers (start, stop, tick → broadcast).
 */
import { rooms } from "../room.js";
import { log } from "../config.js";
export function startRoomTimer(roomId, io) {
    const room = rooms.get(roomId);
    if (!room?.duration || room.timerStarted)
        return;
    room.timerStarted = true;
    room.startTime = Date.now();
    const durationMs = room.duration * 60 * 1000;
    room.timerInterval = setInterval(() => {
        const secs = Math.max(0, Math.ceil((durationMs - (Date.now() - room.startTime)) / 1000));
        const timeLeft = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
        io.to(roomId).emit("timer_update", {
            roomId,
            payload: { timeLeft, remainingSeconds: secs },
        });
        if (secs <= 0) {
            stopRoomTimer(roomId);
            io.to(roomId).emit("timer_expired", { roomId });
        }
    }, 1000);
    log.info(`Timer started for room ${roomId}: ${room.duration} min`);
}
export function stopRoomTimer(roomId) {
    const room = rooms.get(roomId);
    if (!room?.timerInterval)
        return;
    clearInterval(room.timerInterval);
    room.timerInterval = null;
}
//# sourceMappingURL=timer.service.js.map