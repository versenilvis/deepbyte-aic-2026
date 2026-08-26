import type { Answer, Query, Task } from './types';
import { MAX_ANSWERS, taskOf } from './types';

export type ConflictResolution = 'current' | 'incoming' | 'combine';

export interface QueryConflict {
	id: string;
	task: Task;
	current: Query;
	incoming: Query;
	choice: ConflictResolution;
}

export interface MergePlan {
	newQueries: Query[];
	conflicts: QueryConflict[];
	unmodified: Query[];
}

export interface MergeSummary {
	addedCount: number;
	keptCount: number;
	replacedCount: number;
	combinedCount: number;
	totalCount: number;
	addedIds: string[];
	replacedIds: string[];
	keptIds: string[];
	combinedIds: string[];
}

// chuẩn hoá và ép kiểu an toàn cho một truy vấn để tránh lỗi runtime khi file json bị thiếu trường
function sanitizeQuery(raw: unknown, index: number): Query {
	const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const id =
		typeof item.id === 'string' && item.id.trim()
			? item.id.trim().toLowerCase()
			: `query-${index + 1}-kis`;

	let task: Task;
	if (item.task === 'kis' || item.task === 'qa' || item.task === 'trake') {
		task = item.task;
	} else {
		try {
			task = taskOf(id);
		} catch {
			task = 'kis';
		}
	}

	const brief = typeof item.brief === 'string' ? item.brief : '';
	const rawPrompt =
		item.prompt && typeof item.prompt === 'object' ? (item.prompt as Record<string, unknown>) : {};
	const prompt = {
		spatial_context: Array.isArray(rawPrompt.spatial_context)
			? rawPrompt.spatial_context.map(String)
			: ['', ''],
		asr_text: Array.isArray(rawPrompt.asr_text) ? rawPrompt.asr_text.map(String) : [''],
		ocr_text: Array.isArray(rawPrompt.ocr_text) ? rawPrompt.ocr_text.map(String) : ['']
	};

	const rawWeights =
		item.weights && typeof item.weights === 'object'
			? (item.weights as Record<string, unknown>)
			: {};
	const weights = {
		visual: typeof rawWeights.visual === 'number' ? rawWeights.visual : 1,
		speech: typeof rawWeights.speech === 'number' ? rawWeights.speech : 1,
		ocr: typeof rawWeights.ocr === 'number' ? rawWeights.ocr : 1
	};

	const answers: Answer[] = Array.isArray(item.answers)
		? item.answers.map((a: unknown) => {
				const ans = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
				return {
					id: typeof ans.id === 'string' && ans.id ? ans.id : crypto.randomUUID(),
					frames: Array.isArray(ans.frames) ? ans.frames : [],
					text: typeof ans.text === 'string' ? ans.text : undefined,
					note: typeof ans.note === 'string' ? ans.note : undefined
				};
			})
		: [];

	const candidates = Array.isArray(item.candidates) ? item.candidates : [];

	return {
		id,
		task,
		brief,
		prompt,
		n_events: typeof item.n_events === 'number' ? item.n_events : undefined,
		weights,
		answers,
		candidates,
		searchedAt: typeof item.searchedAt === 'number' ? item.searchedAt : undefined
	};
}

// phân tích nội dung chuỗi json thành danh sách truy vấn đã qua chuẩn hoá
export function parseWorkspaceJson(rawText: string): Query[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		throw new Error('Tệp tải lên không phải định dạng JSON hợp lệ');
	}

	let queryList: unknown[] = [];
	if (Array.isArray(parsed)) {
		queryList = parsed;
	} else if (
		parsed &&
		typeof parsed === 'object' &&
		'queries' in parsed &&
		Array.isArray((parsed as { queries: unknown[] }).queries)
	) {
		queryList = (parsed as { queries: unknown[] }).queries;
	} else {
		throw new Error('Tệp JSON không chứa danh sách truy vấn hợp lệ');
	}

	return queryList.map((item, idx) => sanitizeQuery(item, idx));
}

/** Một dòng trong danh sách chọn: câu này lấy về thì chuyện gì xảy ra. */
export interface PickRow {
	id: string;
	task: Task;
	brief: string;
	/** Số đáp án bên nạp vào. */
	incomingAnswers: number;
	/** Số đáp án đang có của mình. null = mình chưa có câu này. */
	currentAnswers: number | null;
	/** Lấy về sẽ ĐÈ MẤT đáp án của mình. Mặc định KHÔNG tích sẵn. */
	overwrites: boolean;
}

export function buildPickList(currentQueries: Query[], incomingQueries: Query[]): PickRow[] {
	const cur = new Map(currentQueries.map((q) => [q.id.toLowerCase(), q]));
	return incomingQueries.map((inc) => {
		const mine = cur.get(inc.id.toLowerCase());
		const currentAnswers = mine ? mine.answers.length : null;
		return {
			id: inc.id,
			task: inc.task,
			brief: inc.brief,
			incomingAnswers: inc.answers.length,
			currentAnswers,
			overwrites: (currentAnswers ?? 0) > 0
		};
	});
}

/**
 * Lấy về đúng những câu đã tích, giữ nguyên phần còn lại.
 *
 * Một quyết định duy nhất mỗi dòng: lấy hay không. Bản trước bắt chọn ba chiều
 * (giữ / thay / ghép) cho từng câu, trong khi việc thật chỉ là "lấy câu 12 của bạn
 * về xem" - phức tạp không đổi lấy được gì.
 */
export function applyPicked(
	currentQueries: Query[],
	incomingQueries: Query[],
	pickedIds: Set<string>
): Query[] {
	const byId = new Map(currentQueries.map((q) => [q.id.toLowerCase(), q]));
	for (const inc of incomingQueries) {
		if (pickedIds.has(inc.id.toLowerCase())) byId.set(inc.id.toLowerCase(), inc);
	}
	// xếp lại theo số thứ tự câu cho dễ nhìn
	return [...byId.values()].sort((a, b) => {
		const na = Number(a.id.match(/-(\d+)-(?:kis|qa|trake)$/)?.[1] ?? NaN);
		const nb = Number(b.id.match(/-(\d+)-(?:kis|qa|trake)$/)?.[1] ?? NaN);
		if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
		return a.id.localeCompare(b.id);
	});
}
