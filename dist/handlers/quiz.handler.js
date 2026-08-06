import { ensureRoom, isTeacherSocket } from "../room.js";
import crypto from "crypto";
export function registerQuizSocketHandlers(socket, io) {
    const broadcastQuizState = (roomId, room) => {
        io.to(roomId).emit("quiz_update", {
            roomId,
            payload: room.currentQuiz || null,
        });
    };
    // ── Create or start quiz (teacher only) ──────────────────
    socket.on("quiz_create", ({ payload }) => {
        if (!socket.roomId || !isTeacherSocket(socket))
            return;
        const room = ensureRoom(socket.roomId);
        if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
            socket.emit("error", { message: "Quiz requires at least one question." });
            return;
        }
        // Set old quiz inactive
        if (room.currentQuiz) {
            room.currentQuiz.isActive = false;
        }
        const newQuiz = {
            id: crypto.randomUUID(),
            questions: payload.questions.map((q) => ({
                id: crypto.randomUUID(),
                question: q.question.trim(),
                options: q.options.map((optText) => ({
                    id: crypto.randomUUID(),
                    text: optText.trim(),
                    votes: [],
                })),
                correctOption: q.correctOption,
            })),
            isActive: true,
            createdAt: Date.now(),
            submittedUsers: [],
        };
        room.currentQuiz = newQuiz;
        room.isDirty = true;
        broadcastQuizState(socket.roomId, room);
    });
    // ── Submit quiz (student only) ────────────────────────────
    socket.on("quiz_submit", ({ payload }) => {
        if (!socket.roomId || !socket.userId)
            return;
        const room = ensureRoom(socket.roomId);
        if (!room.currentQuiz || !room.currentQuiz.isActive) {
            socket.emit("error", { message: "No active quiz to submit." });
            return;
        }
        const voterId = socket.user?.visitorId ? String(socket.user.visitorId) : socket.userId;
        // Check if student has already submitted
        const hasAlreadySubmitted = room.currentQuiz.submittedUsers.includes(voterId);
        if (hasAlreadySubmitted) {
            socket.emit("error", { message: "You have already submitted this quiz." });
            return;
        }
        // Mark as submitted
        room.currentQuiz.submittedUsers.push(voterId);
        // Record votes
        if (payload && Array.isArray(payload.answers)) {
            payload.answers.forEach((ans) => {
                const q = room.currentQuiz?.questions.find((quest) => quest.id === ans.questionId);
                if (q) {
                    const opt = q.options.find((o) => o.id === ans.optionId);
                    if (opt && !opt.votes.includes(voterId)) {
                        opt.votes.push(voterId);
                    }
                }
            });
        }
        room.isDirty = true;
        broadcastQuizState(socket.roomId, room);
    });
    // ── End quiz (teacher only) ─────────────────────────────────
    socket.on("quiz_end", () => {
        if (!socket.roomId || !isTeacherSocket(socket))
            return;
        const room = ensureRoom(socket.roomId);
        if (room.currentQuiz && room.currentQuiz.isActive) {
            room.currentQuiz.isActive = false;
            room.isDirty = true;
            broadcastQuizState(socket.roomId, room);
        }
    });
    // ── Delete quiz (teacher only) ──────────────────────────────
    socket.on("quiz_delete", () => {
        if (!socket.roomId || !isTeacherSocket(socket))
            return;
        const room = ensureRoom(socket.roomId);
        room.currentQuiz = null;
        room.isDirty = true;
        broadcastQuizState(socket.roomId, room);
    });
    // ── Share quiz link to chat (teacher only) ────────────────────
    socket.on("quiz_share_link", ({ payload }) => {
        if (!socket.roomId || !isTeacherSocket(socket))
            return;
        const room = ensureRoom(socket.roomId);
        const msg = {
            id: crypto.randomUUID(),
            user: {
                name: socket.user?.name || "Teacher",
                isTeacher: true,
                ...(socket.user?.visitorId !== undefined ? { visitorId: socket.user.visitorId } : {}),
                ...(socket.userId !== undefined ? { id: socket.userId } : {})
            },
            ...(socket.userId !== undefined ? { senderId: socket.userId } : {}),
            recipient: "everyone",
            message: `📝 Quiz: ${payload.quizTitle}`,
            quizShare: {
                shareToken: payload.shareToken,
                quizTitle: payload.quizTitle
            },
            timestamp: Date.now(),
        };
        room.chat.push(msg);
        room.isDirty = true;
        io.to(socket.roomId).emit("chat", {
            roomId: socket.roomId,
            payload: msg
        });
    });
}
//# sourceMappingURL=quiz.handler.js.map