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

// so sánh hai danh sách truy vấn để phân loại câu mới, câu giữ nguyên và câu bị trùng id
export function buildMergePlan(currentQueries: Query[], incomingQueries: Query[]): MergePlan {
	const currentMap = new Map<string, Query>();
	for (const q of currentQueries) {
		currentMap.set(q.id.toLowerCase(), q);
	}

	const incomingMap = new Map<string, Query>();
	for (const q of incomingQueries) {
		incomingMap.set(q.id.toLowerCase(), q);
	}

	const newQueries: Query[] = [];
	const conflicts: QueryConflict[] = [];
	const unmodified: Query[] = [];

	for (const [id, incoming] of incomingMap.entries()) {
		const current = currentMap.get(id);
		if (!current) {
			newQueries.push(incoming);
			continue;
		}

		// Đội chia việc theo dải câu (A làm 1-12, B làm 13-18...) nhưng ai cũng có đủ
		// 25 câu trong workspace, nên MỌI id đều trùng. Nếu coi tất cả là xung đột thì
		// đội trưởng phải duyệt 25 dòng mà 24 dòng chẳng có gì để chọn.
		// Chỉ một bên có đáp án -> lấy bên đó, không hỏi. Cả hai cùng có -> mới là
		// xung đột thật, vì lúc đó bỏ bên nào cũng là mất việc của một người.
		const hasCurrent = current.answers.length > 0;
		const hasIncoming = incoming.answers.length > 0;

		if (hasCurrent && hasIncoming) {
			conflicts.push({
				id,
				task: incoming.task || current.task,
				current,
				incoming,
				choice: incoming.answers.length > current.answers.length ? 'incoming' : 'current'
			});
		} else if (hasIncoming) {
			newQueries.push(incoming);
		} else {
			// bên nạp vào rỗng -> giữ nguyên bản hiện có, kể cả khi cả hai đều rỗng
			unmodified.push(current);
		}
	}

	for (const [id, current] of currentMap.entries()) {
		if (!incomingMap.has(id)) unmodified.push(current);
	}

	return { newQueries, conflicts, unmodified };
}

// tạo khóa nhận diện duy nhất cho đáp án để lọc trùng khi ghép kết quả
function answerKey(a: Answer, task: Task): string {
	const frameStr = a.frames.map((f) => `${f.video_id}:${f.frame_id}`).join('|');
	return task === 'qa' ? `${frameStr}#${a.text ?? ''}` : frameStr;
}

// kết hợp các đáp án không trùng lặp giữa hai bản của cùng một câu hỏi
export function combineQueryAnswers(target: Query, source: Query): Query {
	const mergedAnswers: Answer[] = [...target.answers];
	const seen = new Set(target.answers.map((a) => answerKey(a, target.task)));

	for (const ans of source.answers) {
		const key = answerKey(ans, target.task);
		if (!seen.has(key) && mergedAnswers.length < MAX_ANSWERS) {
			seen.add(key);
			mergedAnswers.push({ ...ans, id: crypto.randomUUID() });
		}
	}

	return {
		...target,
		brief: target.brief || source.brief,
		prompt: target.prompt.spatial_context.some(Boolean) ? target.prompt : source.prompt,
		candidates: target.candidates.length ? target.candidates : source.candidates,
		answers: mergedAnswers
	};
}

// thực thi việc gộp dựa theo cấu hình lựa chọn của người dùng cho từng câu xung đột
export function executeMerge(
	currentQueries: Query[],
	incomingQueries: Query[],
	conflictChoices: Record<string, ConflictResolution>
): { mergedQueries: Query[]; summary: MergeSummary } {
	const plan = buildMergePlan(currentQueries, incomingQueries);
	const resultMap = new Map<string, Query>();

	const addedIds: string[] = [];
	const replacedIds: string[] = [];
	const keptIds: string[] = [];
	const combinedIds: string[] = [];

	// giữ nguyên các câu chỉ có ở workspace hiện tại
	for (const q of plan.unmodified) {
		resultMap.set(q.id.toLowerCase(), q);
		keptIds.push(q.id);
	}

	// thêm toàn bộ các câu mới từ tệp nạp vào
	for (const q of plan.newQueries) {
		resultMap.set(q.id.toLowerCase(), q);
		addedIds.push(q.id);
	}

	// xử lý từng câu bị xung đột theo quyết định của người dùng
	for (const conflict of plan.conflicts) {
		const idKey = conflict.id.toLowerCase();
		const choice = conflictChoices[idKey] ?? conflict.choice;

		if (choice === 'incoming') {
			resultMap.set(idKey, conflict.incoming);
			replacedIds.push(conflict.id);
		} else if (choice === 'combine') {
			const combined = combineQueryAnswers(conflict.current, conflict.incoming);
			resultMap.set(idKey, combined);
			combinedIds.push(conflict.id);
		} else {
			resultMap.set(idKey, conflict.current);
			keptIds.push(conflict.id);
		}
	}

	// sắp xếp lại danh sách truy vấn theo thứ tự số tăng dần để giao diện hiển thị gọn gàng
	const mergedQueries = Array.from(resultMap.values()).sort((a, b) => {
		const numA = Number(a.id.match(/query-(\d+)-/)?.[1] ?? NaN);
		const numB = Number(b.id.match(/query-(\d+)-/)?.[1] ?? NaN);
		if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
			return numA - numB;
		}
		return a.id.localeCompare(b.id);
	});

	const summary: MergeSummary = {
		addedCount: addedIds.length,
		keptCount: keptIds.length,
		replacedCount: replacedIds.length,
		combinedCount: combinedIds.length,
		totalCount: mergedQueries.length,
		addedIds,
		replacedIds,
		keptIds,
		combinedIds
	};

	return { mergedQueries, summary };
}
