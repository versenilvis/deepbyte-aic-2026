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
	import { clipInfo, imageUrl, type ClipInfo } from '$lib/api';
	import { thumbs } from '$lib/thumbs.svelte';
	import { ws } from '$lib/store.svelte';
	import { scrub } from '$lib/scrub.svelte';
	import { queuedImage } from '$lib/imgqueue';
	import type { Candidate, Query } from '$lib/types';

	/**
	 * Duyệt thủ công các keyframe lân cận khi tìm kiếm tự động không ra kết quả mong muốn
	 */
	let { query, onzoom }: { query: Query; onzoom: (group: Candidate[]) => void } = $props();

	let videoId = $state('');
	let frameInput = $state<number | string>('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let info = $state<ClipInfo | null>(null);
	let searchedFrameId = $state<number | null>(null);

	let cols = $state(5);
	let cursor = $state(0);
	let target = $state<string | null>(null);
	let grid = $state<HTMLDivElement | null>(null);

	// tạo dải 25 keyframe quanh mốc tâm để người dùng rà soát bằng mắt
	let candidates = $derived.by<Candidate[]>(() => {
		if (!info || info.n == null) return [];
		const centerN = info.n;
		const minN = Math.max(1, centerN - 12);
		const maxN = centerN + 12;
		const fps = info.fps || 25;

		const list: Candidate[] = [];
		for (let k = minN; k <= maxN; k++) {
			const isCenter = k === centerN;
			const delta = k - centerN;
			const frameId = isCenter ? info.center_frame : Math.round(info.center_frame + delta * fps);
			const pts = info.pts_time != null ? Math.max(0, info.pts_time + delta) : frameId / fps;

			list.push({
				rank: 0,
				video_id: info.video_id,
				frame_id: frameId,
				keyframe_n: k,
				pts_time: pts,
				fps,
				image: `/image?video_id=${info.video_id}&n=${k}`,
				caption: '',
				speech: '',
				ocr: ''
			});
		}
		return list;
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
		else if (query.task === 'trake' && target) ws.appendFrame(query, target, c);
		else ws.addAnswer(query, c);
	}

	async function jump() {
		const vid = videoId.trim();
		const fid = typeof frameInput === 'number' ? frameInput : parseInt(String(frameInput).trim(), 10);
		if (!vid || isNaN(fid)) return;

		busy = true;
		error = null;
		info = null;

		try {
			const res = await clipInfo(vid, fid, 5);
			if (res.n === undefined || res.n === null) {
				error = 'Backend chưa hỗ trợ, cần chạy lại cell api_server trên Kaggle';
				return;
			}
			info = res;
			searchedFrameId = fid;
			// đưa con trỏ bàn phím tới đúng ô trung tâm
			const centerN = res.n;
			const minN = Math.max(1, centerN - 12);
			cursor = centerN - minN;
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

		<input
			type="number"
			placeholder="Số frame (vd: 1850)"
			bind:value={frameInput}
			onkeydown={(e) => e.key === 'Enter' && jump()}
			class="field no-spin h-8 w-36 font-mono text-xs"
		/>

		<button
			class="btn-primary h-8 px-3.5 text-xs"
			onclick={jump}
			disabled={busy || !videoId.trim() || frameInput === '' || frameInput === null || frameInput === undefined}
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

	{#if query.task === 'trake'}
		<select
			class="cursor-pointer rounded-lg border border-ink-800 bg-ink-825 px-2.5 py-1 text-xs text-ink-200 hover:border-ink-700"
			bind:value={target}
		>
			<option value={null}>tạo đáp án mới</option>
			{#each query.answers as a, i (a.id)}
				<option value={a.id}>
					gắn vào #{i + 1} ({a.frames.length}/{query.n_events})
				</option>
			{/each}
		</select>
	{/if}

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
{:else if info && info.gap !== undefined && info.gap !== 0}
	<div class="flex items-center gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn">
		<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} class="shrink-0" />
		<span>
			Đã bắt về keyframe gần nhất <strong class="font-mono">{info.center_frame}</strong>, bạn gõ <strong class="font-mono">{searchedFrameId}</strong> (lệch {Math.abs(info.gap)} frame).
		</span>
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
