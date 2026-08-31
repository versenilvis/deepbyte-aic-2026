<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Alert02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
	import { frameUrl, imageUrl, videoUrl } from '$lib/api';
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
		onjump,
		onpick
	}: {
		query: Query;
		/** Task 1/2: 1 phần tử. Task 3: n phần tử cùng group, đúng thứ tự action. */
		items: Candidate[];
		onclose: () => void;
		/** Mở tab "Nhảy tới frame" với đúng video + frame đang xem. */
		onjump?: (video_id: string, frame_id: number) => void;
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
	/** Frame đang xem ở chế độ cả video. Dữ liệu là CFR bắt đầu từ 0 (frame_resolver
	 *  đã đo: timestamp_sec == frame_idx / fps trên mọi video) nên quy đổi thẳng từ
	 *  currentTime là chính xác, không cần mốc bù như clip 5s. */
	let fullFrame = $state(0);
	/** Frame vừa bấm chọn - dùng để nháy xác nhận, người dùng cần thấy là đã ăn. */
	let justPicked = $state<number | null>(null);
	let pickTimer: ReturnType<typeof setTimeout> | undefined;

	function pickFrame(f: number) {
		picked[active] = f;
		justPicked = f;
		clearTimeout(pickTimer);
		pickTimer = setTimeout(() => (justPicked = null), 1400);
	}
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
					<div class="relative">
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={videoUrl(cur.video_id, cur.pts_time)}
							controls
							autoplay
							preload="metadata"
							ontimeupdate={(e) =>
								(fullFrame = Math.round(e.currentTarget.currentTime * (cur!.fps ?? 25)))}
							onseeked={(e) =>
								(fullFrame = Math.round(e.currentTarget.currentTime * (cur!.fps ?? 25)))}
							class="max-h-[62vh] w-full rounded-xl bg-ink-950 object-contain"
						></video>

						<!-- Bộ đếm frame. KHÔNG kèm nút lùi/tới từng frame như clip 5s: video
						     đầy đủ dài hàng chục nghìn frame, mỗi lần nhích một frame trình
						     duyệt phải giải mã lại từ keyframe gần nhất nên giật. Cần chính
						     xác tới frame thì chuyển sang Clip 5s. -->
						<div class="pointer-events-none absolute top-3 left-3 rounded-lg bg-ink-50 px-3 py-1.5 font-mono shadow-lg">
							<span class="tabular text-lg font-bold tracking-[-0.02em] text-ink-950">{fullFrame}</span>
							<span class="tabular ml-1.5 text-[11px] text-ink-500">{mmss(fullFrame / (cur.fps ?? 25))}</span>
						</div>

						{#if onpick}
							<button
								class="absolute right-3 bottom-16 flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors
								{justPicked === fullFrame
									? 'bg-ok text-ink-950'
									: 'bg-brand text-ink-950 hover:brightness-110'}"
								onclick={() => pickFrame(fullFrame)}>
								{#if justPicked === fullFrame}
									<HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.4} />
									Đã chọn {fullFrame}
								{:else}
									Chọn frame {fullFrame}
								{/if}
							</button>
						{/if}
					</div>
				{/key}
			{:else}
				<div class="ph ph-{cur.keyframe_n % 8} flex max-h-[62vh] min-h-64 items-center justify-center overflow-hidden rounded-xl">
					<!-- Ảnh của ĐÚNG frame đang chọn, không phải keyframe. Dùng keyframe thì
					     ô xem trước bên danh sách đáp án (đã lấy theo frame_id) và ảnh ở đây
					     là hai cảnh khác nhau, cùng mang một số frame - nhìn là loạn. -->
					<img
						src={frameUrl(cur.video_id, picked[active] ?? cur.frame_id, 1280)}
						onerror={(e) => {
							// Backend cũ chưa có /frame -> rơi về ảnh keyframe.
							const el = e.currentTarget as HTMLImageElement;
							const fb = imageUrl(cur!.video_id, cur!.keyframe_n, 1280);
							if (el.src !== fb) el.src = fb;
						}}
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

					{#if onjump}
						<!-- Mang đúng video + frame đang xem sang tab "Nhảy tới frame".
						     Ở chế độ cả video thì lấy frame đang phát, hai chế độ kia lấy
						     frame đã chọn - luôn là con số người dùng đang nhìn thấy. -->
						<button
							class="btn-secondary h-8 px-3 text-[11.5px]"
							onclick={() =>
								onjump?.(
									cur!.video_id,
									mode === 'full' ? fullFrame : (picked[active] ?? cur!.frame_id)
								)}
							title="Mở tab Nhảy tới frame tại đúng chỗ này">
							Nhảy tới frame
						</button>
					{/if}

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
