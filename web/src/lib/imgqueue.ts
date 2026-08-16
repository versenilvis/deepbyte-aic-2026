/**
 * Hàng đợi tải ảnh, giới hạn số request đồng thời.
 *
 * Vì sao cần: trình duyệt dùng HTTP/2 nên bắn cả 100 request ảnh CÙNG LÚC (HTTP/1.1
 * thì tự xếp hàng 6 cái một). Cloudflare thấy 100 request/giây từ một IP thì trả 429
 * — đo thật: 36/100 ảnh hỏng.
 *
 * Cách làm: không gán thẳng `src`, mà xếp hàng qua semaphore. Ảnh vẫn lazy-load, vẫn
 * dùng cache trình duyệt, chỉ khác là không dồn cục.
 */

const MAX_PARALLEL = 6;

let running = 0;
const queue: (() => void)[] = [];

function next() {
	if (running >= MAX_PARALLEL) return;
	const job = queue.shift();
	if (!job) return;
	running++;
	job();
}

function done() {
	running--;
	next();
}

/**
 * Dùng làm `use:queuedImage={url}` trên thẻ <img>.
 * Đổi url thì tự xếp hàng lại.
 */
export function queuedImage(node: HTMLImageElement, url: string) {
	let cancelled = false;
	let retried = false;

	function load(u: string) {
		queue.push(() => {
			if (cancelled) return done();
			node.onload = () => done();
			node.onerror = () => {
				done();
				// 429 do dồn cục -> thử lại một lần sau khi hàng đợi thoáng
				if (!retried && !cancelled) {
					retried = true;
					setTimeout(() => load(u + '&r=1'), 900);
				}
			};
			node.src = u;
		});
		next();
	}

	load(url);

	return {
		update(u: string) {
			retried = false;
			load(u);
		},
		destroy() {
			cancelled = true;
		}
	};
}
