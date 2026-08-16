import { zipSync, strToU8 } from 'fflate';
import type { Query } from './types';
import { MAX_ANSWERS, validate } from './types';

function cell(v: string | number): string {
	const s = String(v);
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(q: Query): string {
	return q.answers
		.slice(0, MAX_ANSWERS)
		.map((a) => {
			const ids = a.frames.map((f) => f.frame_id);
			const row =
				q.task === 'qa'
					? [a.frames[0]?.video_id ?? '', ids[0] ?? '', a.text ?? '']
					: [a.frames[0]?.video_id ?? '', ...ids];
			return row.map(cell).join(',');
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
