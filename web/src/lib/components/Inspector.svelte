<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Alert02Icon } from '@hugeicons/core-free-icons';
	import { imageUrl, videoUrl } from '$lib/api';
	import FrameScrubber from './FrameScrubber.svelte';
	import { ws } from '$lib/store.svelte';
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

	/** Giây -> "m:ss.s". Đọc "2:58.2" nhanh hơn "178.2s" khi đối chiếu với trình phát. */
	function mmss(sec: number): string {
		const m = Math.floor(sec / 60);
		const r = sec - m * 60;
		return `${m}:${r.toFixed(1).padStart(4, '0')}`;
	}

	let active = $state(0);
	/** 'video' = clip 5s co bo dem frame. 'full' = ca video goc. */
	let mode = $state<'image' | 'video' | 'full'>('image');
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

	let existingAnswer = $derived.by(() => {
		if (!items.length || !query.answers.length) return null;
		if (isTrake) {
			return (
				query.answers.find(
					(a) =>
						a.frames.length === items.length &&
						a.frames.every(
							(f, idx) =>
								f.video_id === items[idx]?.video_id &&
								f.frame_id === (picked[idx] ?? items[idx]?.frame_id)
						)
				) ?? null
			);
		} else {
			const curFrameId = picked[0] ?? cur?.frame_id;
			if (!cur) return null;
			return (
				query.answers.find((a) =>
					a.frames.some((f) => f.video_id === cur.video_id && f.frame_id === curFrameId)
				) ?? null
			);
		}
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/95 p-4 backdrop-blur-sm" onclick={onclose}>
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
						class="btn h-[34px] px-3.5 text-[12.5px] {i === active
							? 'bg-brand font-semibold text-ink-950'
							: 'border border-ink-800 bg-ink-850 text-ink-300 hover:border-ink-700 hover:text-ink-100'}"
						onclick={() => (active = i)}
					>
						Action {i + 1}
						<span class="tabular ml-1 font-mono text-[11.5px] font-semibold opacity-65">{picked[i] ?? it.frame_id}</span>
					</button>
				{/each}

				<button class="btn-ghost ml-auto size-[34px]" onclick={onclose}>
					<HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
				</button>
			</div>

			{#if broken}
				<p class="flex items-center gap-1.5 rounded-lg border border-bad/25 bg-bad/8 px-3 py-2 text-xs text-bad">
					<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={1.8} />
					Frame phải tăng dần theo thứ tự action - hiện đang sai thứ tự.
				</p>
			{/if}
		{/if}

		{#if cur}
			<!-- ── ảnh / clip ───────────────────────────────────────── -->
			{#if mode === 'video'}
				<FrameScrubber
					video_id={cur.video_id}
					frame_id={cur.frame_id}
					keyframe_n={cur.keyframe_n}
					pts_time={cur.pts_time}
					fps={cur.fps ?? 25}
					min={lo}
					max={hi}
					onpick={(f) => (picked[active] = f)}
				/>
			{:else if mode === 'full'}
				<!-- Video goc, tua duoc. `#t=` bat trinh duyet nhay thang toi giay cua
				     frame dang xem. Backend chi tra file kem header Range nen mo tuc thi,
				     khong cho ffmpeg dung clip nhu nhanh 'video'. -->
				{#key `${cur.video_id}-${cur.frame_id}`}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						src={videoUrl(cur.video_id, cur.pts_time)}
						controls
						autoplay
						preload="metadata"
						class="max-h-[62vh] w-full rounded-xl bg-ink-950 object-contain"
					></video>
				{/key}
			{:else}
				<div class="ph ph-{cur.keyframe_n % 8} flex max-h-[62vh] min-h-64 items-center justify-center overflow-hidden rounded-xl">
					<img
						src={imageUrl(cur.video_id, cur.keyframe_n, 1280)}
						alt=""
						onload={(e) => e.currentTarget.classList.add('is-loaded')}
						class="thumb max-h-[62vh] w-full object-contain"
					/>
				</div>
			{/if}

			<!-- ── thông tin + hành động ────────────────────────────── -->
			<div class="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-[10px] border border-ink-800 bg-ink-900 p-3 text-xs">
				<div class="flex flex-wrap items-center gap-3">
					<span class="font-mono text-ink-200">
						{cur.video_id} · frame <span class="tabular font-bold text-rank-1">{picked[active] ?? cur.frame_id}</span>
						· {mmss(cur.pts_time)} · {cur.pts_time.toFixed(1)}s · {cur.fps ?? 25}fps
					</span>

					<div class="flex overflow-hidden rounded-lg border border-ink-800">
						{#each [['image', 'Ảnh'], ['video', 'Clip 5s'], ['full', 'Cả video']] as [m, label] (m)}
							<button
								class="cursor-pointer px-2.5 py-1.5 text-[11px] transition-colors
								{mode === m ? 'bg-brand text-ink-950' : 'bg-ink-825 text-ink-400 hover:text-ink-200'}"
								onclick={() => (mode = m as 'image' | 'video' | 'full')}>
								{label}
							</button>
						{/each}
					</div>

					{#if existingAnswer}
						<button
							class="btn h-[34px] border border-bad/40 bg-bad/12 px-4 text-[12.5px] font-medium text-bad transition-colors hover:bg-bad hover:text-ink-950 ml-auto flex items-center gap-1.5"
							onclick={() => {
								ws.removeAnswer(query, existingAnswer!.id);
								onclose();
							}}
						>
							<HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2} />
							<span>Xóa khỏi danh sách nộp</span>
						</button>
					{:else if onpick}
						<button
							class="btn-primary ml-auto h-[34px] px-5 text-[12.5px]"
							disabled={broken}
							onclick={() => onpick?.([...picked])}
						>
							{isTrake ? `Thêm đáp án (${items.length} frame)` : 'Thêm vào danh sách nộp'}
						</button>
					{/if}

					{#if !isTrake}
						<button class="btn-ghost size-8" onclick={onclose}>
							<HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
						</button>
					{/if}
				</div>

				<!-- Base = khung này khớp truy vấn đến đâu. Chain = cả video này khớp
				     đến đâu. Base cao mà chain thấp nghĩa là một khung ăn may trong một
				     video chẳng liên quan - đáng nghi. -->
				{#if cur.base_score != null || cur.chain_score != null}
					<div class="flex flex-wrap gap-1.5 text-[11px]">
						{#if cur.base_score != null}
							<span class="tabular rounded-md border border-ink-800 px-1.5 py-0.5 font-mono text-ink-200">
								base {cur.base_score.toFixed(4)}
							</span>
						{/if}
						{#if cur.chain_score != null}
							<span class="tabular rounded-md border border-ink-800 px-1.5 py-0.5 font-mono text-ink-200">
								chain {cur.chain_score.toFixed(4)}
							</span>
						{/if}
						{#if cur.score != null}
							<span class="tabular rounded-md border border-ink-800 px-1.5 py-0.5 font-mono text-ink-500">
								tổng {cur.score.toFixed(4)}
							</span>
						{/if}
					</div>
				{/if}

				{#if cur.caption}<p class="leading-relaxed text-ink-300"><span class="text-ink-500">caption</span> {cur.caption}</p>{/if}
				{#if cur.speech}<p class="leading-relaxed text-ink-300"><span class="text-ink-500">speech</span> {cur.speech}</p>{/if}
				{#if cur.ocr}<p class="leading-relaxed text-ink-300"><span class="text-ink-500">ocr</span> {cur.ocr}</p>{/if}
			</div>
		{/if}
	</div>
</div>
