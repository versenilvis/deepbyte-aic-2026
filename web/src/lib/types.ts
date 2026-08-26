export type Task = "kis" | "qa" | "trake";

export interface FrameRef {
    video_id: string;
    frame_id: number;
    keyframe_n: number;
    pts_time: number;
	/** Cần để quy đổi thời gian video <-> số frame khi xem clip 5s. */
	fps?: number;
}

export interface Candidate extends FrameRef {
    rank: number;
    image: string;
    group?: number;
    /** Task 1/2: điểm đã trộn (0.4*base + 0.6*chain). Task 3: chính là chain. */
    score?: number;
    /** Chỉ có ở task 1/2. */
    base_score?: number;
    chain_score?: number;
    orig_frame_idx?: number;
    caption: string;
    speech: string;
    ocr: string;
}

export interface Answer {
    id: string;
    frames: FrameRef[];
    text?: string;
    note?: string;
}

export interface Prompt {
    spatial_context: string[];
    asr_text: string[];
    ocr_text: string[];
}

export interface Weights {
    visual: number;
    speech: number;
    ocr: number;
}

export const WEIGHT_PRESETS: Record<string, Weights> = {
    "cân bằng": { visual: 1, speech: 1, ocr: 1 },
    "thiên hình ảnh": { visual: 2, speech: 0.5, ocr: 0.5 },
    "thiên lời nói": { visual: 0.5, speech: 2, ocr: 0.5 },
    "thiên chữ": { visual: 0.5, speech: 0.5, ocr: 2 },
};

export interface Query {
    id: string;
    task: Task;
    brief: string;
    prompt: Prompt;
    n_events?: number;
    weights?: Weights;
    answers: Answer[];
    candidates: Candidate[];
    searchedAt?: number;
}

export const MAX_ANSWERS = 100;
export const MAX_ANSWER_CHARS = 100;

export const RANK_TIERS = [1, 5, 20, 50, 100] as const;

export function tierOf(rank1: number): number {
    for (const t of RANK_TIERS) if (rank1 <= t) return t;
    return Infinity;
}

/** Mã task cho backend: 1 = KIS, 2 = Q&A, 3 = TRAKE. */
export const TASK_TYPE: Record<Task, number> = { kis: 1, qa: 2, trake: 3 };

export function taskOf(queryId: string): Task {
    const s = queryId.trim().toLowerCase().split("-").pop();
    if (s === "kis" || s === "qa" || s === "trake") return s;
    throw new Error(
        `Không nhận ra task từ '${queryId}': tên phải kết thúc bằng -kis, -qa hoặc -trake`,
    );
}

export function validate(q: Query): string[] {
    const errs: string[] = [];
    if (q.answers.length > MAX_ANSWERS)
        errs.push(`${q.answers.length} đáp án, tối đa ${MAX_ANSWERS}`);

    q.answers.forEach((a, i) => {
        const at = `#${i + 1}`;
        if (q.task === "trake") {
            // n_events tự suy từ số action LLM tách được; chưa search thì bỏ qua.
            if (!q.n_events) return;
            else if (a.frames.length !== q.n_events)
                errs.push(
                    `${at}: ${a.frames.length} frame, cần đúng ${q.n_events}`,
                );
            const ids = a.frames.map((f) => f.frame_id);
            if (ids.some((v, k) => k > 0 && v < ids[k - 1]))
                errs.push(`${at}: frame chưa theo thứ tự thời gian`);
            if (new Set(a.frames.map((f) => f.video_id)).size > 1)
                errs.push(`${at}: các frame phải cùng 1 video`);
        } else if (a.frames.length !== 1) {
            errs.push(`${at}: ${q.task} chỉ được 1 frame`);
        }
        if (q.task === "qa") {
            if (!a.text?.trim()) errs.push(`${at}: thiếu answer`);
            else if (a.text.length > MAX_ANSWER_CHARS)
                errs.push(
                    `${at}: answer ${a.text.length} ký tự, tối đa ${MAX_ANSWER_CHARS}`,
                );
        }
    });
    return errs;
}
