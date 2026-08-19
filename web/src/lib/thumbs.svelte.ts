import { SvelteMap } from 'svelte/reactivity';
import { getBase, getKey } from './api';

/**
 * Kho thumbnail dùng chung. MỌI ảnh nhỏ đi qua đây, không component nào được tự
 * gán `<img src=/image>` nữa.
 *
 * Vì sao phải gom về một chỗ - đo thật trên backend đang chạy:
 *
 *   100 request /image, 6 luồng song song        -> 46/100 trả 429
 *   POST /thumbs bắn CÙNG LÚC với cơn bão đó     -> chính nó cũng 429 sau 0.16s
 *   POST /thumbs chạy một mình, 100 ảnh          -> 8/8 thành công, 1.8-4.9s
 *
 * Cloudflare chặn theo TẦN SUẤT chứ không theo số request đồng thời, nên giảm số
 * luồng không cứu được. Bản cũ để mỗi ô "rơi về" /image khi chưa có batch - mà lúc
 * `$effect` vừa gọi batch thì map còn rỗng, nên 100 ô rơi về /image NGAY LẬP TỨC,
 * song song với chính request batch. 101 request một lúc, rate limiter giết batch
 * trước, rồi map rỗng vĩnh viễn và cả lưới trắng. Cái "dự phòng" ấy chính là bệnh.
 *
 * Ở đây: gom yêu cầu, chia lô nhỏ, tối đa 2 request cùng lúc, thử lại có giãn cách.
 * Chưa có ảnh thì hiện ô giữ chỗ, KHÔNG bắn request lẻ.
 */

/** Một cỡ duy nhất cho cả lưới lẫn danh sách đáp án: backend cache theo (video, n, w),
 *  dùng chung một w thì hai nơi share được cache, đỡ nửa việc cho backend. */
const W = 384;
const CHUNK = 24;
const MAX_INFLIGHT = 2;
const COALESCE_MS = 60;
const TIMEOUT_MS = 30_000;
const MAX_CACHE = 4000;
/** Giãn cách khi thử lại. Cộng thêm nhiễu ngẫu nhiên để nhiều tab không đập cùng nhịp. */
const BACKOFF = [800, 2000, 5000];

function splitKey(k: string): [string, number] {
	const i = k.lastIndexOf('-');
	return [k.slice(0, i), Number(k.slice(i + 1))];
}

class ThumbStore {
	#cache = new SvelteMap<string, string>();
	/** Đang chờ gửi. */
	#want = new Set<string>();
	/** Đang bay. */
	#busy = new Set<string>();
	/** Đã bỏ cuộc (backend không có ảnh, hoặc thử lại hết lượt). Không hỏi lại nữa. */
	#miss = new Set<string>();
	#timer: ReturnType<typeof setTimeout> | null = null;
	#inflight = 0;

	/** Backend cũ chưa có /thumbs -> cho phép quay về <img src=/image> từng ô. */
	legacy = $state(false);
	/** Số ảnh đã bỏ cuộc, để hiện nút thử lại. */
	failed = $state(0);
	loading = $state(false);

	key(video_id: string, n: number): string {
		return `${video_id}-${n}`;
	}

	/** Đọc trong template. Không có tác dụng phụ - việc xếp hàng do want() lo. */
	get(video_id: string, n: number): string | undefined {
		return this.#cache.get(this.key(video_id, n));
	}

	/** Gọi trong $effect khi danh sách ảnh cần hiện thay đổi. */
	want(list: { video_id: string; keyframe_n: number }[]) {
		let added = 0;
		for (const c of list) {
			const k = this.key(c.video_id, c.keyframe_n);
			if (this.#cache.has(k) || this.#busy.has(k) || this.#want.has(k) || this.#miss.has(k))
				continue;
			this.#want.add(k);
			added++;
		}
		if (added) this.#schedule();
	}

	/** Nút "tải lại ảnh": trả những ảnh đã bỏ cuộc về hàng đợi. */
	retry() {
		for (const k of this.#miss) this.#want.add(k);
		this.#miss.clear();
		this.failed = 0;
		this.#schedule();
	}

	#schedule() {
		if (this.#timer !== null) return;
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#flush();
		}, COALESCE_MS);
	}

	#flush() {
		while (this.#want.size && this.#inflight < MAX_INFLIGHT) {
			const batch: string[] = [];
			for (const k of this.#want) {
				batch.push(k);
				if (batch.length >= CHUNK) break;
			}
			for (const k of batch) {
				this.#want.delete(k);
				this.#busy.add(k);
			}
			this.#inflight++;
			this.loading = true;
			void this.#send(batch).finally(() => {
				this.#inflight--;
				this.loading = this.#inflight > 0 || this.#want.size > 0;
				// Còn hàng chờ thì chạy tiếp, không đợi timer.
				if (this.#want.size) this.#flush();
			});
		}
	}

	async #send(batch: string[], attempt = 0): Promise<void> {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
		try {
			const res = await fetch(getBase() + '/thumbs', {
				method: 'POST',
				signal: ctl.signal,
				headers: { 'Content-Type': 'application/json', 'X-AIC-Key': getKey() },
				body: JSON.stringify({ items: batch.map(splitKey), w: W })
			});
			if (res.status === 404) {
				// Backend cũ. Bỏ hẳn đường batch, để component dùng <img src=/image>.
				this.legacy = true;
				for (const k of batch) this.#busy.delete(k);
				return;
			}
			if (!res.ok) throw new Error(String(res.status));
			const data = (await res.json()) as { thumbs?: Record<string, string> };
			for (const [k, b64] of Object.entries(data.thumbs ?? {}))
				this.#put(k, 'data:image/jpeg;base64,' + b64);
			for (const k of batch) {
				this.#busy.delete(k);
				// Backend không trả -> video này không có keyframe. Hỏi lại cũng vô ích.
				if (!this.#cache.has(k)) this.#miss.add(k);
			}
		} catch {
			for (const k of batch) this.#busy.delete(k);
			if (attempt < BACKOFF.length) {
				await new Promise((r) => setTimeout(r, BACKOFF[attempt] + Math.random() * 400));
				for (const k of batch) this.#busy.add(k);
				return this.#send(batch, attempt + 1);
			}
			// Hết lượt: ngừng hỏi để khỏi kéo dài cơn bão. Người dùng bấm "tải lại ảnh".
			for (const k of batch) this.#miss.add(k);
			this.failed += batch.length;
		} finally {
			clearTimeout(timer);
		}
	}

	#put(k: string, uri: string) {
		this.#cache.set(k, uri);
		// SvelteMap giữ thứ tự chèn -> phần tử đầu là cũ nhất.
		while (this.#cache.size > MAX_CACHE) {
			const oldest = this.#cache.keys().next().value;
			if (oldest === undefined) break;
			this.#cache.delete(oldest);
		}
	}
}

export const thumbs = new ThumbStore();
