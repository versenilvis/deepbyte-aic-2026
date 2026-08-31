import { zipSync, strToU8 } from 'fflate';
import type { Query } from './types';
import { MAX_ANSWERS, validate } from './types';

function cell(v: string | number): string {
	const s = String(v);
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Luôn bọc nháy kép, kể cả khi không bắt buộc. */
function quoted(v: string): string {
	return `"${String(v).replace(/"/g, '""')}"`;
}

export function toCsv(q: Query): string {
	return q.answers
		.slice(0, MAX_ANSWERS)
		.map((a) => {
			const vid = a.frames[0]?.video_id ?? '';
			const ids = a.frames.map((f) => f.frame_id);

			// Q&A: đáp án LUÔN bọc nháy kép, không chỉ khi có dấu phẩy. Bọc thừa thì
			// mọi bộ đọc CSV đều hiểu, còn quên bọc một câu có dấu phẩy là hỏng cả
			// dòng - mà mỗi gói chỉ có 3 lượt nộp.
			if (q.task === 'qa')
				return [cell(vid), cell(ids[0] ?? ''), quoted(a.text ?? '')].join(',');

			// KIS một frame, TRAKE cả chuỗi: `video_id,f1,f2,...` MỘT dòng mỗi đáp án.
			// Nhiều đáp án thì nhiều dòng, kể cả khi trùng video.
			return [vid, ...ids].map(cell).join(',');
		})
		.join('\n');
}

export interface ExportReport {
	ok: boolean;
	problems: Record<string, string[]>;
	files: Record<string, number>;
}

export function check(queries: Query[]): ExportReport {
	const problems: Record<string, string[]> = {};
	const files: Record<string, number> = {};
	for (const q of queries) {
		const errs = validate(q);
		if (errs.length) problems[q.id] = errs;
		files[`${q.id}.csv`] = q.answers.length;
	}
	return { ok: Object.keys(problems).length === 0, problems, files };
}

export function buildZip(queries: Query[]): Blob {
	const entries: Record<string, Uint8Array> = {};
	for (const q of queries) {
		entries[`submission/${q.id}.csv`] = strToU8(toCsv(q));
	}
	return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' });
}

export function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}
