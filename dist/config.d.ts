/**
 * ─── Configuration & Logger ───────────────────────────────────
 * Centralized config from environment variables.
 */
export declare const CFG: {
    PORT: number;
    MAIN_BACKEND_URL: string;
    LIVEKIT_API_KEY: string;
    LIVEKIT_API_SECRET: string;
    LIVEKIT_WS_URL: string;
    TURN_URLS: string[];
    TURN_USERNAME: string;
    TURN_CREDENTIAL: string;
    MAX_CHAT_HISTORY: number;
    MAX_CHAT_PER_MINUTE: number;
    ROOM_CLEANUP_DELAY_MS: number;
    ROOM_STALE_MS: number;
    SYNC_INTERVAL_MS: number;
    GC_INTERVAL_MS: number;
    INTERNAL_SECRET: string;
};
export declare const log: {
    info: (...a: unknown[]) => void;
    warn: (...a: unknown[]) => void;
    error: (...a: unknown[]) => void;
    debug: (...a: unknown[]) => void | "" | undefined;
};
//# sourceMappingURL=config.d.ts.map