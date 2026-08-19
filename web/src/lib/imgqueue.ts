/**
 * Hàng đợi tải ảnh, giới hạn số request đồng thời.
 *
 * Vì sao cần: trình duyệt dùng HTTP/2 nên bắn cả 100 request ảnh CÙNG LÚC (HTTP/1.1
 * thì tự xếp hàng 6 cái một). Cloudflare thấy 100 request/giây từ một IP thì trả 429
 * - đo thật: 36/100 ảnh hỏng.
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
/** Ảnh có thể đã giải mã xong trước khi kịp gắn onload (cache trình duyệt). */
function markLoaded(node: HTMLImageElement) {
	node.classList.add('is-loaded');
}

export function queuedImage(node: HTMLImageElement, url: string) {
	let cancelled = false;
	let retried = false;

	function show(u: string) {
		node.onload = () => markLoaded(node);
		node.onerror = null;
		node.src = u;
		if (node.complete && node.naturalWidth > 0) markLoaded(node);
	}

	function load(u: string) {
		// data: URI KHÔNG đi ra mạng -> không có gì để xếp hàng.
		//
		// Quan trọng hơn: ảnh `loading="lazy"` nằm ngoài khung nhìn thì trình duyệt
		// hoãn tải, nên `onload` không bao giờ chạy và `done()` không được gọi. Xếp
		// hàng chúng thì 6 chỗ bị chiếm VĨNH VIỄN và mọi ảnh phía sau đứng im - đo
		// thật: lưới 100 ô chỉ 50 ô được gán src, 50 ô còn lại trắng mãi.
		if (u.startsWith('data:')) return show(u);

		queue.push(() => {
			if (cancelled) return done();
			// Chốt chặn: lazy-load ngoài khung nhìn có thể không bắn onload/onerror
			// bao giờ. Không có cái này thì một ô như vậy giữ chỗ tới hết phiên.
			let freed = false;
			const free = () => {
				if (freed) return;
				freed = true;
				clearTimeout(watchdog);
				done();
			};
			const watchdog = setTimeout(free, 15000);

			node.onload = () => {
				markLoaded(node);
				free();
			};
			node.onerror = () => {
				free();
				// 429 do dồn cục -> thử lại một lần sau khi hàng đợi thoáng
				if (!retried && !cancelled) {
					retried = true;
					setTimeout(() => load(u + '&r=1'), 900);
				}
			};
			node.src = u;
			if (node.complete && node.naturalWidth > 0) {
				markLoaded(node);
				free();
			}
		});
		next();
	}

	load(url);

	return {
		update(u: string) {
			retried = false;
			// Ảnh khác -> ẩn lại, để ô giữ chỗ che trong lúc tải thay vì loé ảnh cũ.
			node.classList.remove('is-loaded');
			load(u);
		},
		destroy() {
			cancelled = true;
		}
	};
}
