/**
 * ─── Backend Sync Service ─────────────────────────────────────
 * Periodically saves dirty room state to backend API.
 * Handles GC of stale rooms & graceful shutdown.
 */
export declare function saveRoomStateToBackend(roomId: string): Promise<void>;
export declare function startBackgroundJobs(): void;
export declare function stopBackgroundJobs(): void;
export declare function shutdown(server: {
    close: (cb: () => void) => void;
}): Promise<void>;
//# sourceMappingURL=sync.service.d.ts.map