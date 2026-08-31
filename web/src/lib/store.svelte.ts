import type { Answer, Candidate, FrameRef, Query, Task } from './types';
import { MAX_ANSWERS, taskOf } from './types';

const KEY = 'aic.workspace.v1';

function emptyQuery(id: string, task: Task): Query {
	return {
		id,
		task,
		brief: '',
		prompt: { spatial_context: ['', ''], asr_text: [''], ocr_text: [''] },
		n_events: undefined,
		weights: { visual: 1, speech: 1, ocr: 1 },
		answers: [],
		candidates: []
	};
}

class Workspace {
	queries = $state<Query[]>([]);
	activeId = $state<string | null>(null);
	busy = $state(false);
	/** Bề rộng 2 cột, kéo được. Lưu localStorage để mở lại giữ nguyên. */
	leftW = $state(236);
	rightW = $state(292);
	error = $state<string | null>(null);

	get active(): Query | null {
		return this.queries.find((q) => q.id === this.activeId) ?? null;
	}

	load() {
		try {
			const raw = localStorage.getItem(KEY);
			if (!raw) return;
			const d = JSON.parse(raw);
			this.queries = d.queries ?? [];
			this.activeId = d.activeId ?? this.queries[0]?.id ?? null;
			if (d.leftW) this.leftW = d.leftW;
			if (d.rightW) this.rightW = d.rightW;
		} catch {
			// ignore corrupt storage
		}
	}

	save() {
		try {
			const slim = this.queries.map((q) => ({ ...q, candidates: q.candidates.slice(0, 100) }));
			localStorage.setItem(
				KEY,
				JSON.stringify({ queries: slim, activeId: this.activeId, leftW: this.leftW, rightW: this.rightW })
			);
		} catch (e) {
			this.error = 'Không lưu được vào localStorage (có thể đã đầy). Export ra file để giữ.';
		}
	}

	/** `brief` phải gán TRƯỚC khi push: sau khi push thì object đã bị $state bọc
	 *  proxy, gán vào tham chiếu thô không bắn tín hiệu nên giao diện không cập nhật. */
	addQuery(id: string, customTask?: Task, brief = ""): Query | null {
		const clean = id.trim().toLowerCase();
		if (!clean || this.queries.some((q) => q.id === clean)) return null;
		let task: Task;
		if (customTask) {
			task = customTask;
		} else {
			try {
				task = taskOf(clean);
			} catch (e) {
				this.error = (e as Error).message;
				return null;
			}
		}
		const q = emptyQuery(clean, task);
		if (brief) q.brief = brief;
		this.queries.push(q);
		this.activeId = q.id;
		this.save();
		return q;
	}

	removeQuery(id: string) {
		this.queries = this.queries.filter((q) => q.id !== id);
		if (this.activeId === id) this.activeId = this.queries[0]?.id ?? null;
		this.save();
	}

	duplicateQuery(id: string) {
		const orig = this.queries.find((q) => q.id === id);
		if (!orig) return;
		const newId = `${orig.id}-copy`;
		let uniqueId = newId;
		let idx = 1;
		while (this.queries.some((q) => q.id === uniqueId)) {
			uniqueId = `${newId}-${idx++}`;
		}
		const cloned: Query = {
			...JSON.parse(JSON.stringify(orig)),
			id: uniqueId
		};
		this.queries.push(cloned);
		this.activeId = cloned.id;
		this.save();
	}

	// ---------------------------------------------------------------- answers
    /**
     * Thêm đáp án từ Inspector với frame ĐÃ CHỈNH trong khoảng clip 5s.
     * TRAKE: `group` = n candidate cùng nhóm, `frames` = n frame theo thứ tự action.
     */
    addAnswerFrames(q: Query, group: Candidate[], frames: number[]) {
        if (q.answers.length >= MAX_ANSWERS) {
            this.error = `Đã đủ ${MAX_ANSWERS} đáp án.`;
            return;
        }
        const refs = group.map((c, i) => ({ ...toRef(c), frame_id: frames[i] ?? c.frame_id }));
        q.answers.push({ id: crypto.randomUUID(), frames: refs });
        this.save();
    }

	/** Trả về id đáp án vừa tạo, để TRAKE nối frame tiếp theo vào đúng chuỗi đó. */
	addAnswer(q: Query, c: Candidate): string | null {
		if (q.answers.length >= MAX_ANSWERS) {
			this.error = `Đã đủ ${MAX_ANSWERS} đáp án, không nộp thêm được`;
			return null;
		}
		const id = crypto.randomUUID();
		q.answers.push({ id, frames: [toRef(c)] });
		this.save();
		return id;
	}

	toggleAnswer(q: Query, c: Candidate) {
		const existingIndex = q.answers.findIndex((a) =>
			a.frames.some((f) => f.video_id === c.video_id && f.frame_id === c.frame_id)
		);
		if (existingIndex >= 0) {
			q.answers.splice(existingIndex, 1);
			this.save();
		} else {
			this.addAnswer(q, c);
		}
	}

	/**
	 * Nối frame vào một chuỗi TRAKE. Trả về id chuỗi thực sự nhận frame.
	 *
	 * Frame KHÁC VIDEO thì tách sang chuỗi mới thay vì nối bừa: một dòng nộp chỉ có
	 * MỘT `video_id` đứng đầu, nhét frame video khác vào là ra dòng sai mà không có
	 * dấu hiệu gì trên giao diện.
	 */
	/**
	 * Thêm một frame vào đáp án TRAKE.
	 *
	 * `mode`:
	 *   null    - TỰ GOM THEO VIDEO: nối vào chuỗi đang có của cùng video, chưa có
	 *             thì tạo mới. Đây là việc muốn làm trong hầu hết trường hợp.
	 *   "new"   - luôn tạo chuỗi mới, dùng khi cần HAI chuỗi từ CÙNG một video.
	 *   <id>    - ép nối vào đúng chuỗi đó.
	 *
	 * Bản trước cho `target` bám theo lần bấm cuối, nên bấm A, A, B, A thì lần cuối
	 * `target` đang ở B, khác video nên tách chuỗi mới - video A bị xé làm hai dòng.
	 * Gom theo video thì thứ tự bấm không còn ảnh hưởng gì.
	 */
	addTrakeFrame(q: Query, c: Candidate, mode: string | null): string | null {
		let a =
			mode === 'new'
				? undefined
				: mode
					? q.answers.find((x) => x.id === mode)
					: q.answers.find((x) => x.frames[0]?.video_id === c.video_id);

		// Ép nối vào một chuỗi khác video thì không nối được: một dòng nộp chỉ có MỘT
		// video_id đứng đầu.
		if (a && a.frames[0] && a.frames[0].video_id !== c.video_id) a = undefined;

		if (!a) return this.addAnswer(q, c);
		a.frames.push(toRef(c));
		a.frames.sort((p, r) => p.frame_id - r.frame_id);
		this.save();
		return a.id;
	}

	removeAnswer(q: Query, id: string) {
		q.answers = q.answers.filter((a) => a.id !== id);
		this.save();
	}

	/** Xóa 1 frame ra khỏi answer TRAKE. Nếu còn 0 frame thì xóa luôn cả answer. */
	removeFrame(q: Query, answerId: string, frameId: number) {
		const a = q.answers.find((x) => x.id === answerId);
		if (!a) return;
		a.frames = a.frames.filter((f) => f.frame_id !== frameId);
		if (a.frames.length === 0) q.answers = q.answers.filter((x) => x.id !== answerId);
		this.save();
	}

	clearAnswers(q: Query) {
		q.answers = [];
		this.save();
	}

	populateTopK(q: Query, k = 5) {
		const toAdd = q.candidates.slice(0, k);
		for (const c of toAdd) {
			if (!this.isPicked(q, c) && q.answers.length < MAX_ANSWERS) {
				q.answers.push({ id: crypto.randomUUID(), frames: [toRef(c)] });
			}
		}
		this.save();
	}

	move(q: Query, from: number, to: number) {
		if (to < 0 || to >= q.answers.length || from === to) return;
		const [a] = q.answers.splice(from, 1);
		q.answers.splice(to, 0, a);
		this.save();
	}

	promote(q: Query, index: number) {
		this.move(q, index, 0);
	}

	isPicked(q: Query, c: Candidate): boolean {
		return q.answers.some((a) => a.frames.some((f) => f.video_id === c.video_id && f.frame_id === c.frame_id));
	}

	// ---------------------------------------------------------------- import/export
	toJSON(): string {
		return JSON.stringify({ version: 1, savedAt: Date.now(), queries: this.queries }, null, 2);
	}

	// cập nhật danh sách câu hỏi sau khi gộp và lưu lại vào localstorage
	applyMerged(queries: Query[]) {
		this.queries = queries;
		if (!this.queries.some((q) => q.id === this.activeId)) {
			this.activeId = this.queries[0]?.id ?? null;
		}
		this.save();
	}
}

function toRef(c: Candidate): FrameRef {
	return { video_id: c.video_id, frame_id: c.frame_id, keyframe_n: c.keyframe_n, pts_time: c.pts_time, fps: c.fps };
}

export const ws = new Workspace();
export type { Answer, Query };
