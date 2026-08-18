import type { Candidate, Prompt, Weights } from './types';

/** Backend chạy trong Kaggle, phơi qua Cloudflare Tunnel.
 * Web ở aicdeepbyte.vercel.app, backend ở aic.verse.id.vn - hai nơi khác nhau,
 * nên CORS phải mở (api_server đã set allow_origins=["*"]). */
export const DEFAULT_BASE = 'https://aic.verse.id.vn';
const KEY = 'aic.backend';
const AUTH = 'aic.key';

export function getBase(): string {
	if (typeof localStorage === 'undefined') return DEFAULT_BASE;
	return localStorage.getItem(KEY) || DEFAULT_BASE;
}

export function setBase(url: string) {
	localStorage.setItem(KEY, url.trim().replace(/\/+$/, ''));
}

/**
 * Key chung của đội, do notebook Kaggle in ra.
 *
 * KHÔNG có giá trị mặc định: đặt mặc định làm `getKey()` luôn trả về chuỗi hợp lệ,
 * nên cổng đăng nhập bị vô hiệu hoá và vào thẳng app mà không hỏi gì.
 * Rỗng = chưa đăng nhập.
 */
export function getKey(): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem(AUTH) || '';
}

export function setKey(k: string) {
	localStorage.setItem(AUTH, k.trim());
}

export interface Health {
	ok: boolean;
	frames: number;
	videos: number;
	signals: Record<string, unknown>;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(getBase() + path, {
		...init,
		headers: { ...(init.headers ?? {}), 'X-AIC-Key': getKey() }
	});
	if (res.status === 401) throw new Error('Sai key hoặc thiếu key (xem key notebook in ra)');
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${path})`);
	return res.json() as Promise<T>;
}

export const health = () => req<Health>('/health');

export interface SearchOut {
	results: Candidate[];
	parsed: Prompt & { reasoning_process?: string; questions?: string[]; events?: string[] };
}

export async function search(
	prompt: Prompt,
	opts: { top_k?: number; rawPrompt?: string; weights?: Weights } = {}
): Promise<SearchOut> {
	const body = {
		prompt: opts.rawPrompt ?? '',
		spatial_context: prompt.spatial_context.filter(Boolean),
		asr_text: prompt.asr_text.filter(Boolean),
		ocr_text: prompt.ocr_text.filter(Boolean),
		top_k: opts.top_k ?? 100,
		weights: opts.weights ?? null
	};
	const r = await req<{ count: number; parsed: any; results: Candidate[] }>('/search', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return { results: r.results, parsed: r.parsed ?? {} };
}

export function imageUrl(video_id: string, keyframe_n: number, w = 512): string {
	return `${getBase()}/image?video_id=${video_id}&n=${keyframe_n}&w=${w}&key=${encodeURIComponent(getKey())}`;
}

/**
 * Đổi số này mỗi khi cách CẮT clip ở backend thay đổi.
 *
 * `/clip` không gửi Cache-Control, chỉ có Last-Modified, nên trình duyệt tự suy ra
 * độ tươi và phát lại mp4 đã tải từ trước - URL cũ và mới giống hệt nhau. Bản v1 vừa
 * lệch 1 frame (mốc tính qua pts_time làm tròn) vừa mất tiếng (`-an`), và người dùng
 * vẫn thấy đúng hai lỗi đó sau khi backend đã sửa xong.
 */
const CLIP_V = 2;

export function clipUrl(video_id: string, frame_id: number, seconds = 5): string {
	return `${getBase()}/clip?video_id=${video_id}&frame_id=${frame_id}&seconds=${seconds}&v=${CLIP_V}&key=${encodeURIComponent(getKey())}`;
}


/**
 * Lấy NHIỀU thumbnail trong MỘT request.
 *
 * Cloudflare giới hạn số request mỗi giây: lưới 100 ảnh = 100 request -> đo thật
 * 36-47% bị 429, kể cả khi chỉ chạy 6 request song song (đây là giới hạn TẦN SUẤT,
 * không phải đồng thời). Gộp lại thì chỉ tốn 1 request.
 *
 * Backend cũ chưa có /thumbs -> trả về map rỗng, phía gọi tự rơi về <img src>.
 */
export async function fetchThumbs(
	items: { video_id: string; keyframe_n: number }[],
	w = 384
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (!items.length) return out;
	try {
		const r = await req<{ thumbs: Record<string, string> }>('/thumbs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ items: items.map((i) => [i.video_id, i.keyframe_n]), w })
		});
		for (const [k, b64] of Object.entries(r.thumbs)) out.set(k, 'data:image/jpeg;base64,' + b64);
	} catch {
		/* backend cũ hoặc lỗi mạng -> để phía gọi dùng <img src> như trước */
	}
	return out;
}
