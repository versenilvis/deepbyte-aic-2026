<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Alert02Icon,
		Cancel01Icon,
		Image01Icon,
		PlusSignIcon,
		Target02Icon,
		Tick02Icon
	} from '@hugeicons/core-free-icons';
	import { clipInfo, imageUrl, keyframes, type ClipInfo, type Keyframe } from '$lib/api';
	import { thumbs } from '$lib/thumbs.svelte';
	import { ws } from '$lib/store.svelte';
	import { scrub } from '$lib/scrub.svelte';
	import { queuedImage } from '$lib/imgqueue';
	import type { Candidate, Query } from '$lib/types';

	/**
	 * Duyệt thủ công các keyframe lân cận khi tìm kiếm tự động không ra kết quả mong muốn
	 */
	let {
		query,
		onzoom,
		/** Video + frame do Inspector đẩy sang. Đổi giá trị là tự nhảy, khỏi gõ tay. */
		seed = null
	}: {
		query: Query;
		onzoom: (group: Candidate[]) => void;
		seed?: { video_id: string; frame_id: number; at: number } | null;
	} = $props();

	let videoId = $state('');
	let frameInput = $state<number | string>('');
	/** 'frame' = gõ thẳng số frame; 'time' = gõ phút + giây. */
	let mode = $state<'frame' | 'time'>('frame');
	let minInput = $state<number | string>('');
	let secInput = $state<number | string>('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let info = $state<ClipInfo | null>(null);
	/** Keyframe THẬT quanh mốc tâm, lấy từ backend. Không được tự suy ra, xem jump(). */
	let kfWindow = $state<Keyframe[]>([]);
	let searchedFrameId = $state<number | null>(null);

	let cols = $state(5);
	let cursor = $state(0);
	let grid = $state<HTMLDivElement | null>(null);

	// tạo dải 25 keyframe quanh mốc tâm để người dùng rà soát bằng mắt
	/**
	 * Dải keyframe quanh mốc tâm, dựng từ dữ liệu THẬT của backend.
	 *
	 * Bản đầu suy frame_id bằng `center_frame + delta * fps`, tức giả định hai
	 * keyframe cách nhau đúng 1 giây. Sai: L30_V078 có n=31 -> 1848, n=32 -> 1893,
	 * n=33 -> 1917, tức 45 rồi 24 frame. Hậu quả là thumbnail (lấy theo n) và clip
	 * (lấy theo frame_id) trỏ vào hai cảnh khác nhau, càng xa tâm càng lệch.
	 */
	let candidates = $derived.by<Candidate[]>(() => {
		if (!info || info.n == null || !kfWindow.length) return [];
		const fps = info.fps || 25;
		return kfWindow.map((kf) => ({
			rank: 0,
			video_id: info!.video_id,
			frame_id: kf.frame_id,
			keyframe_n: kf.n,
			pts_time: kf.pts_time,
			fps,
			image: `/image?video_id=${info!.video_id}&n=${kf.n}`,
			caption: '',
			speech: '',
			ocr: ''
		}));
	});

	// gửi trước danh sách thumbnail vào kho chia lô để tránh dồn dập request
	$effect(() => {
		if (candidates.length) thumbs.want(candidates);
	});

	function src(c: Candidate): string | null {
		return thumbs.get(c.video_id, c.keyframe_n) ?? (thumbs.legacy ? imageUrl(c.video_id, c.keyframe_n) : null);
	}

	function rankOf(c: Candidate): number | null {
		const i = query.answers.findIndex((a) =>
			a.frames.some((f) => f.video_id === c.video_id && (f.frame_id === c.frame_id || f.keyframe_n === c.keyframe_n))
		);
		return i < 0 ? null : i + 1;
	}

	function toggle(c: Candidate) {
		const i = query.answers.findIndex((a) =>
			a.frames.some((f) => f.video_id === c.video_id && (f.frame_id === c.frame_id || f.keyframe_n === c.keyframe_n))
		);
		if (i >= 0) ws.removeAnswer(query, query.answers[i].id);
		// TRAKE cũng một frame một đáp án: định dạng nộp là mỗi frame một dòng.
		else ws.addAnswer(query, c);
	}

	/** Giây -> "m:ss.s". Đọc "3:14.0" nhanh hơn nhiều so với "194.0s". */
	function mmss(sec: number): string {
		const m = Math.floor(sec / 60);
		const r = sec - m * 60;
		return `${m}:${r.toFixed(1).padStart(4, '0')}`;
	}

	const num = (v: number | string) => {
		const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
		return isNaN(n) ? 0 : n;
	};

	/** Tổng số giây người dùng gõ ở chế độ thời gian. */
	let totalSec = $derived(num(minInput) * 60 + num(secInput));

	let canJump = $derived.by(() => {
		if (!videoId.trim()) return false;
		if (mode === 'time') return minInput !== '' || secInput !== '';
		return frameInput !== '' && frameInput !== null && frameInput !== undefined;
	});

	/* Nhận mốc từ Inspector. Mốc kèm `at` (thời điểm bấm) nên bấm lại CÙNG một
	   frame vẫn kích hoạt - nếu so theo video+frame thì lần bấm thứ hai im lặng. */
	let lastSeed = $state(0);
	$effect(() => {
		if (!seed || seed.at === lastSeed) return;
		lastSeed = seed.at;
		videoId = seed.video_id;
		mode = 'frame';
		frameInput = seed.frame_id;
		jump();
	});

	async function jump() {
		const vid = videoId.trim();

		busy = true;
		error = null;
		info = null;
		kfWindow = [];

		try {
			let fid: number;
			if (mode === 'time') {
				// Cần fps TRƯỚC khi quy đổi được giây sang frame, mà fps thì mỗi video
				// một khác (đã gặp cả 25 lẫn 30). Hỏi một keyframe là đủ, rẻ hơn nhiều
				// so với đoán 25 rồi nhảy sai chỗ.
				const probe = await keyframes(vid, 1, 1);
				fid = Math.round(totalSec * (probe.fps || 25));
			} else {
				fid = typeof frameInput === 'number'
					? frameInput
					: parseInt(String(frameInput).trim(), 10);
			}
			if (isNaN(fid)) {
				error = 'Số không hợp lệ';
				return;
			}
			const res = await clipInfo(vid, fid, 5);
			if (res.n === undefined || res.n === null) {
				error = 'Backend chưa hỗ trợ, cần chạy lại cell api_server trên Kaggle';
				return;
			}
			const centerN = res.n;
			const minN = Math.max(1, centerN - 12);
			// Hỏi backend frame_id thật của từng keyframe trong dải. Bắt buộc, vì
			// khoảng cách giữa hai keyframe không đều nên không suy ra được.
			const kf = await keyframes(vid, minN, centerN + 12);
			info = res;
			kfWindow = kf.keyframes;
			searchedFrameId = fid;
			// đưa con trỏ bàn phím tới đúng ô trung tâm
			cursor = Math.max(0, kf.keyframes.findIndex((k) => k.n === centerN));
		} catch (e) {
			error = (e as Error).message || 'Không tìm thấy video hoặc lỗi kết nối';
		} finally {
			busy = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (scrub.active) return;
		const n = candidates.length;
		if (!n) return;
		const move = {
			ArrowRight: 1,
			ArrowLeft: -1,
			ArrowDown: cols,
			ArrowUp: -cols
		}[e.key];
		if (move !== undefined) {
			e.preventDefault();
			cursor = Math.max(0, Math.min(n - 1, cursor + move));
			grid?.querySelectorAll('[data-tile]')[cursor]?.scrollIntoView({
				block: 'nearest'
			});
			return;
		}
		if (e.key === ' ') {
			e.preventDefault();
			toggle(candidates[cursor]);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			onzoom([candidates[cursor]]);
		}
	}

	function tierRing(rank: number): string {
		if (rank === 1) return 'ring-2 ring-inset ring-rank-1';
		if (rank <= 5) return 'ring-2 ring-inset ring-rank-5';
		if (rank <= 20) return 'ring-2 ring-inset ring-rank-20';
		return 'ring-2 ring-inset ring-rank-far';
	}
</script>

<svelte:window onkeydown={onKey} />

<!-- ── thanh công cụ nhập liệu ─────────────────────────────────── -->
<div class="flex flex-wrap items-center gap-3 border-b border-ink-800 bg-ink-900/40 px-4 py-2.5">
	<div class="flex items-center gap-2">
		<input
			type="text"
			placeholder="Mã video (vd: L30_V078)"
			bind:value={videoId}
			onkeydown={(e) => e.key === 'Enter' && jump()}
			class="field h-8 w-44 font-mono text-xs"
		/>

		<!-- Chọn cách chỉ mốc: số frame hoặc thời gian.
		     Có ô phút riêng vì đọc đề hay ra "phút thứ 3" mà tự nhân 3x60x25 trong đầu
		     thì vừa chậm vừa dễ sai một con số. -->
		<div class="flex overflow-hidden rounded-lg border border-ink-800">
			{#each [['frame', 'frame'], ['time', 'thời gian']] as [m, label] (m)}
				<button
					class="cursor-pointer px-2.5 py-1 text-[11px] transition-colors
					{mode === m ? 'bg-brand text-ink-950' : 'bg-ink-825 text-ink-400 hover:text-ink-200'}"
					onclick={() => (mode = m as 'frame' | 'time')}
				>
					{label}
				</button>
			{/each}
		</div>

		{#if mode === 'frame'}
			<input
				type="number"
				placeholder="Số frame (vd: 1850)"
				bind:value={frameInput}
				onkeydown={(e) => e.key === 'Enter' && jump()}
				class="field no-spin h-8 w-36 font-mono text-xs"
			/>
		{:else}
			<div class="flex items-center gap-1">
				<input
					type="number"
					min="0"
					placeholder="phút"
					bind:value={minInput}
					onkeydown={(e) => e.key === 'Enter' && jump()}
					class="field no-spin h-8 w-16 font-mono text-xs"
				/>
				<span class="font-mono text-xs text-ink-500">:</span>
				<input
					type="number"
					min="0"
					step="0.1"
					placeholder="giây"
					bind:value={secInput}
					onkeydown={(e) => e.key === 'Enter' && jump()}
					class="field no-spin h-8 w-20 font-mono text-xs"
				/>
				<span class="tabular ml-1 font-mono text-[11px] text-ink-500">
					= {totalSec.toFixed(1)}s
				</span>
			</div>
		{/if}

		<button
			class="btn-primary h-8 px-3.5 text-xs"
			onclick={jump}
			disabled={busy || !canJump}
		>
			{#if busy}
				<svg class="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
				</svg>
				<span>Đang nhảy...</span>
			{:else}
				<HugeiconsIcon icon={Target02Icon} size={14} strokeWidth={2.2} />
				<span>Nhảy tới</span>
			{/if}
		</button>
	</div>


	<div class="ml-auto flex items-center gap-5">
		<span class="hidden items-center gap-2 text-[11px] text-ink-500 xl:flex">
			<kbd>↑ ↓ ← →</kbd>
			di chuyển
			<kbd>Space</kbd>
			thêm
			<kbd>Enter</kbd>
			xem to
		</span>

		<label class="flex items-center gap-2 text-xs text-ink-500">
			<HugeiconsIcon icon={Image01Icon} size={15} strokeWidth={1.6} />
			<input type="range" min="3" max="10" bind:value={cols} class="w-24 cursor-pointer accent-brand" />
			<span class="tabular w-4 text-ink-300">{cols}</span>
		</label>
	</div>
</div>

<!-- ── thông báo lỗi hoặc độ lệch keyframe ─────────────────────── -->
{#if error}
	<div class="flex items-center justify-between border-b border-bad/25 bg-bad/10 px-4 py-2 text-xs text-bad">
		<div class="flex items-center gap-2">
			<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} class="shrink-0" />
			<span>{error}</span>
		</div>
		<button class="cursor-pointer text-bad/70 hover:text-bad" onclick={() => (error = null)}>
			<HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.9} />
		</button>
	</div>
{:else if info}
	<!-- Luôn hiện mốc tâm, không chỉ hiện khi lệch: người dùng cần đọc lại được
	     frame và thời gian của ô giữa để đối chiếu với đề bài. -->
	<div
		class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-xs
		{info.gap ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ink-800 bg-ink-900/40 text-ink-400'}">
		{#if info.gap}
			<span class="flex items-center gap-2">
				<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} class="shrink-0" />
				Đã bắt về keyframe gần nhất <strong class="font-mono">{info.center_frame}</strong>,
				bạn gõ <strong class="font-mono">{searchedFrameId}</strong>
				(lệch {Math.abs(info.gap)} frame)
			</span>
		{:else}
			<span>Đúng keyframe <strong class="font-mono">{info.center_frame}</strong></span>
		{/if}
		{#if info.pts_time != null}
			<span class="tabular font-mono">
				{mmss(info.pts_time)} · {info.pts_time.toFixed(2)}s · {info.fps}fps
			</span>
		{/if}
	</div>
{/if}

<!-- ── lưới keyframe xung quanh ────────────────────────────────── -->
<div class="min-h-0 flex-1 overflow-y-auto p-3" bind:this={grid}>
	{#if busy}
		<div class="grid gap-3" style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
			{#each Array(cols * 3) as _, _i}
				<div class="ph ph-{_i % 8} aspect-video animate-pulse rounded-lg opacity-60"></div>
			{/each}
		</div>
	{:else if !candidates.length}
		<div class="flex flex-col items-center gap-3 py-24 text-ink-500">
			<HugeiconsIcon icon={Target02Icon} size={32} strokeWidth={1.3} />
			<p class="text-sm">Nhập mã video và số frame rồi bấm Nhảy tới</p>
			<p class="text-xs text-ink-600">Hệ thống sẽ tự bắt về keyframe gần nhất và hiển thị 25 keyframe xung quanh</p>
		</div>
	{:else}
		<div class="grid gap-3" style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
			{#each candidates as c, i (`${c.video_id}-${c.keyframe_n}`)}
				{@const rank = rankOf(c)}
				{@const isCenter = info?.n != null && c.keyframe_n === info.n}
				<div
					data-tile
					class="group relative rounded-lg transition-all {i === cursor
						? 'ring-2 ring-brand ring-offset-2 ring-offset-ink-950'
						: ''}"
				>
					<button
						class="ph ph-{c.keyframe_n % 8} block w-full cursor-zoom-in overflow-hidden rounded-lg ring-1 ring-inset transition-all {isCenter
							? 'ring-2 ring-brand'
							: rank
								? tierRing(rank)
								: 'ring-ink-800 hover:ring-ink-700'}"
						onclick={() => {
							cursor = i;
							onzoom([c]);
						}}
						title={isCenter ? 'Frame trung tâm · Bấm để xem to' : 'Bấm để xem to'}
					>
						{#if src(c)}
							<img
								use:queuedImage={src(c)!}
								alt=""
								loading="lazy"
								decoding="async"
								class="thumb aspect-video w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]"
							/>
						{:else}
							<div class="aspect-video w-full"></div>
						{/if}
					</button>

					<!-- nhãn keyframe / mốc trung tâm -->
					<span
						class="pointer-events-none absolute top-1.5 left-1.5 flex h-[20px] items-center rounded-md px-1.5 font-mono text-[10px] font-bold shadow-lg {isCenter
							? 'bg-brand text-ink-950 ring-1 ring-ink-950/20'
							: 'bg-ink-950/80 text-ink-300'}"
					>
						{isCenter ? `Tâm · n=${c.keyframe_n}` : `n=${c.keyframe_n}`}
					</span>

					<!-- thứ hạng nếu đã chọn -->
					{#if rank}
						<span
							class="tabular pointer-events-none absolute top-1.5 left-16 flex h-[20px] min-w-[20px] items-center justify-center rounded-md px-1 font-mono text-[11px] font-bold text-ink-950 shadow-lg {rank ===
							1
								? 'bg-rank-1'
								: rank <= 5
									? 'bg-rank-5'
									: 'bg-rank-20'}"
						>
							#{rank}
						</span>
					{/if}

					<!-- nút thêm / bỏ đáp án -->
					<button
						class="absolute top-1.5 right-1.5 flex size-[26px] cursor-pointer items-center justify-center rounded-lg shadow-lg backdrop-blur transition-colors {rank
							? 'bg-ok text-ink-950 hover:bg-bad'
							: 'bg-ink-950/78 text-ink-200 hover:bg-brand hover:text-ink-950'}"
						title={rank ? 'Bỏ khỏi danh sách nộp' : 'Thêm vào danh sách nộp · Space'}
						onclick={(e) => {
							e.stopPropagation();
							cursor = i;
							toggle(c);
						}}
					>
						<HugeiconsIcon icon={rank ? Tick02Icon : PlusSignIcon} size={15} strokeWidth={2.3} />
					</button>

					<!-- thông tin chân ảnh -->
					<div class="mt-1.5 flex items-baseline justify-between px-0.5 text-[11px]">
						<span class="truncate font-mono text-ink-300">
							{c.video_id}
						</span>
						{#if isCenter && info}
							<span class="tabular font-mono font-semibold text-brand">
								f:{info.center_frame}
							</span>
						{:else}
							<span class="tabular font-mono text-ink-500">
								kf:{c.keyframe_n}
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
