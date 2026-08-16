<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Image01Icon, Video01Icon, Alert02Icon } from '@hugeicons/core-free-icons';
	import { imageUrl } from '$lib/api';
	import FrameScrubber from './FrameScrubber.svelte';
	import type { Candidate, Query } from '$lib/types';

	/**
	 * Xem chi tiết một kết quả.
	 *
	 * Task 1/2: một frame, một clip 5s.
	 * Task 3  : n action -> n tab, mỗi tab một clip 5s riêng và bộ đếm frame riêng.
	 *           Ràng buộc: frame action i luôn phải NHỎ HƠN frame action i+1.
	 */
	let {
		query,
		items,
		onclose,
		onpick
	}: {
		query: Query;
		/** Task 1/2: 1 phần tử. Task 3: n phần tử cùng group, đúng thứ tự action. */
		items: Candidate[];
		onclose: () => void;
		onpick?: (frames: number[]) => void;
	} = $props();

	let active = $state(0);
	let mode = $state<'image' | 'video'>('image');
	/** frame đang chọn cho từng action, khởi tạo từ kết quả search. */
	let picked = $state<number[]>([]);

	$effect(() => {
		picked = items.map((c) => c.frame_id);
		active = 0;
	});

	let cur = $derived(items[active]);
	let isTrake = $derived(items.length > 1);

	// ràng buộc đơn điệu: action i phải nằm giữa action i-1 và action i+1
	let lo = $derived(active > 0 ? picked[active - 1] + 1 : undefined);
	let hi = $derived(active < items.length - 1 ? picked[active + 1] - 1 : undefined);

	let broken = $derived(picked.some((f, i) => i > 0 && f <= picked[i - 1]));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/92 p-4" onclick={onclose}>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="flex max-h-[96vh] w-full max-w-4xl flex-col gap-2.5"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- ── tab action (chỉ TRAKE) ─────────────────────────────── -->
		{#if isTrake}
			<div class="flex items-center gap-1.5">
				{#each items as it, i (i)}
					<button
						class="btn h-9 px-4 text-sm {i === active
							? 'bg-ink-100 text-ink-950'
							: 'border border-ink-800 bg-ink-900 text-ink-300 hover:bg-ink-850'}"
						onclick={() => (active = i)}
					>
						Action {i + 1}
						<span class="tabular ml-1 opacity-70">{picked[i] ?? it.frame_id}</span>
					</button>
				{/each}

				<button class="btn-ghost ml-auto size-9" onclick={onclose}>
					<HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
				</button>
			</div>

			{#if broken}
				<p class="flex items-center gap-1.5 rounded-md bg-bad/10 px-3 py-2 text-xs text-bad">
					<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={1.8} />
					Frame phải tăng dần theo thứ tự action — hiện đang sai thứ tự.
				</p>
			{/if}
		{/if}

		{#if cur}
			<!-- ── ảnh / clip ───────────────────────────────────────── -->
			{#if mode === 'video'}
				<FrameScrubber
					video_id={cur.video_id}
					frame_id={cur.frame_id}
					pts_time={cur.pts_time}
					fps={cur.fps ?? 25}
					min={lo}
					max={hi}
					onpick={(f) => (picked[active] = f)}
				/>
			{:else}
				<img
					src={imageUrl(cur.video_id, cur.keyframe_n, 1280)}
					alt=""
					class="max-h-[62vh] w-full rounded-lg bg-ink-900 object-contain"
				/>
			{/if}

			<!-- ── thông tin + hành động ────────────────────────────── -->
			<div class="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-ink-900 p-3 text-xs">
				<div class="flex flex-wrap items-center gap-3">
					<span class="font-mono text-ink-200">
						{cur.video_id} · frame <span class="tabular font-bold text-rank-1">{picked[active] ?? cur.frame_id}</span>
						· {cur.pts_time.toFixed(1)}s · {cur.fps ?? 25}fps
					</span>

					<button class="btn-primary h-9 px-3" onclick={() => (mode = mode === 'video' ? 'image' : 'video')}>
						<HugeiconsIcon icon={mode === 'video' ? Image01Icon : Video01Icon} size={14} strokeWidth={1.7} />
						{mode === 'video' ? 'Xem ảnh' : 'Clip 5s + đếm frame'}
					</button>

					{#if onpick}
						<button
							class="btn-primary ml-auto h-9 px-5 text-sm"
							disabled={broken}
							onclick={() => onpick?.([...picked])}
						>
							{isTrake ? `Thêm đáp án (${items.length} frame)` : 'Thêm vào danh sách nộp'}
						</button>
					{/if}

					{#if !isTrake}
						<button class="btn-ghost size-9" onclick={onclose}>
							<HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
						</button>
					{/if}
				</div>

				{#if cur.caption}<p class="text-ink-300"><span class="text-ink-500">caption</span> {cur.caption}</p>{/if}
				{#if cur.speech}<p class="text-ink-300"><span class="text-ink-500">speech</span> {cur.speech}</p>{/if}
				{#if cur.ocr}<p class="text-ink-300"><span class="text-ink-500">ocr</span> {cur.ocr}</p>{/if}
			</div>
		{/if}
	</div>
</div>
