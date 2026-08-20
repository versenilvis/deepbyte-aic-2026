<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		PlayIcon,
		PauseIcon,
		ArrowLeft01Icon,
		ArrowRight01Icon,
		Target02Icon
	} from '@hugeicons/core-free-icons';
	import { clipUrl } from '$lib/api';
	import { scrub } from '$lib/scrub.svelte';

	/**
	 * Clip 5s quanh một frame, kèm BỘ ĐẾM FRAME và timeline có vạch chia.
	 *
	 * Quy đổi: clip bắt đầu ở `start = pts_time - seconds/2` (backend tính y hệt và mã
	 * hoá lại nên chính xác tới frame; `-c copy` nhảy keyframe sẽ làm lệch mốc này).
	 *     frame = round((start + video.currentTime) * fps)
	 *
	 * `frame` là STATE riêng, không phải $derived từ currentTime: trình duyệt seek
	 * không phải lúc nào cũng dừng đúng mốc yêu cầu, nên nút lùi/tới frame sẽ như không ăn nếu
	 * để con số phụ thuộc hoàn toàn vào currentTime.
	 */
	let {
		video_id,
		frame_id,
		pts_time,
		fps,
		seconds = 5,
		min,
		max,
		onpick
	}: {
		video_id: string;
		frame_id: number;
		pts_time: number;
		fps: number;
		seconds?: number;
		/** Ràng buộc TRAKE: frame action i phải > frame action i-1. */
		min?: number;
		max?: number;
		onpick?: (frame: number) => void;
	} = $props();

	let el = $state<HTMLVideoElement | null>(null);
	let playing = $state(false);
	let frame = $state(0);

	/**
	 * Mốc clip tính bằng SỐ NGUYÊN FRAME, khớp đúng backend.
	 *
	 * pts_time trong map-keyframes làm tròn 1 chữ số: frame 997 @25fps thật ra ở 39.88s
	 * nhưng CSV ghi 39.9 - lệch nửa frame, đủ gây off-by-one (frame hiện 997 mà ảnh lại
	 * giống 998). Đi từ frame_id thì start rơi đúng biên frame.
	 */
	let nFrames = $derived(Math.round(seconds * fps));
	let firstFrame = $derived(Math.max(0, frame_id - Math.floor(nFrames / 2)));
	let startSec = $derived(firstFrame / fps);
	let lastFrame = $derived(firstFrame + nFrames - 1);
	let loF = $derived(Math.max(firstFrame, min ?? firstFrame));
	let hiF = $derived(Math.min(lastFrame, max ?? lastFrame));
	let span = $derived(Math.max(1, hiF - loF));

	/* Đặt số đếm về frame trung tâm. Việc TUA video do `onloadedmetadata` lo: lúc
	   effect này chạy thì <video> chưa có metadata nên gán currentTime là vô hiệu.
	   Thiếu cú tua đó thì số đếm ghi frame trung tâm còn hình vẫn đứng ở frame ĐẦU
	   clip - lệch tới nửa clip (62 frame ở clip 5s @25fps), đủ để nộp sai. */
	$effect(() => {
		frame = Math.min(hiF, Math.max(loF, frame_id));
	});

	const clamp = (f: number) => Math.min(hiF, Math.max(loF, Math.round(f)));

	function seekTo(f: number) {
		const t = clamp(f);
		frame = t;
		if (el) el.currentTime = Math.max(0, (t - firstFrame) / fps);
	}

	function step(d: number) {
		el?.pause();
		seekTo(frame + d);
	}

	function toggle() {
		if (!el) return;
		playing ? el.pause() : el.play();
	}

	/** Chỉ bám theo video khi ĐANG PHÁT - lúc dừng thì giữ nguyên frame người dùng chọn. */
	function follow() {
		if (el && !el.paused) frame = clamp(firstFrame + el.currentTime * fps);
	}

	// vạch chia: ~10 mốc đều nhau trên timeline
	let ticks = $derived(
		Array.from({ length: 11 }, (_, i) => loF + Math.round((span * i) / 10))
	);

	/** Vị trí frame mà search trả về, để đối chiếu khi đã kéo đi chỗ khác. */
	let origPct = $derived(((clamp(frame_id) - loF) / span) * 100);

	function onTrack(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		el?.pause();
		seekTo(loF + (span * (e.clientX - r.left)) / r.width);
	}

	// Giành quyền dùng phím mũi tên chừng nào clip còn mở.
	$effect(() => {
		scrub.active = true;
		return () => {
			scrub.active = false;
		};
	});

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return; // đang gõ số frame
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			step(e.shiftKey ? -10 : -1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			step(e.shiftKey ? 10 : 1);
		} else if (e.key === ' ') {
			e.preventDefault();
			toggle();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="space-y-2">
	<div class="relative overflow-hidden rounded-xl bg-ink-900">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={el}
			src={clipUrl(video_id, frame_id, seconds)}
			class="max-h-[52vh] w-full object-contain"
			preload="auto"
			controls={false}
			onloadedmetadata={() => seekTo(frame_id)}
			ontimeupdate={follow}
			onseeked={follow}
			onplay={() => (playing = true)}
			onpause={() => (playing = false)}
			onclick={toggle}
		></video>

		<!-- bộ đếm frame: chữ đen nền trắng, cùng tông với nút hành động chính -->
		<div
			class="pointer-events-none absolute top-3 left-3 rounded-lg bg-ink-50 px-3 py-1.5
        font-mono shadow-lg"
		>
			<span class="tabular text-lg font-bold tracking-[-0.02em] text-ink-950">{frame}</span>
			<span class="tabular ml-1.5 text-[11px] text-ink-500">/ {loF}-{hiF}</span>
		</div>
	</div>

	<!-- ── timeline có vạch chia frame ─────────────────────────── -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="relative h-12 cursor-pointer rounded-lg border border-ink-800 bg-ink-900 select-none"
		onpointerdown={(e) => {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			onTrack(e);
		}}
		onpointermove={(e) => e.buttons === 1 && onTrack(e)}
	>
		{#each ticks as f, i}
			{@const pct = ((f - loF) / span) * 100}
			<div class="pointer-events-none absolute top-0 h-full" style="left: {pct}%">
				<div class="h-2.5 w-px bg-ink-700"></div>
				{#if i % 2 === 0}
					<span
						class="tabular absolute top-2.5 -translate-x-1/2 font-mono text-[9px] text-ink-500"
					>
						{f}
					</span>
				{/if}
			</div>
		{/each}

		<!-- frame gốc từ search -->
		<div
			class="pointer-events-none absolute bottom-1 h-3 w-0.5 bg-ink-500"
			style="left: {origPct}%"
			title="Frame search trả về: {frame_id}"
		></div>

		<!-- vị trí hiện tại -->
		<div
			class="pointer-events-none absolute inset-y-0 w-0.5 bg-rank-1"
			style="left: {((frame - loF) / span) * 100}%"
		>
			<div class="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-rank-1"></div>
		</div>
	</div>

	<div class="flex items-center gap-2">
		<button class="btn-secondary size-11 rounded-[9px]" onclick={toggle} title={playing ? 'Tạm dừng' : 'Phát'}>
			<HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={20} strokeWidth={2} />
		</button>

		<div class="flex gap-1">
			<button class="btn-secondary h-11 gap-0.5 rounded-[9px] px-2.5 text-sm" onclick={() => step(-10)} title="Lùi 10 frame">
				<HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2.4} />
				<span class="tabular text-xs font-semibold">10</span>
			</button>
			<button class="btn-secondary size-11 rounded-[9px]" onclick={() => step(-1)} title="Lùi 1 frame">
				<HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2.4} />
			</button>
			<button class="btn-secondary size-11 rounded-[9px]" onclick={() => step(1)} title="Tới 1 frame">
				<HugeiconsIcon icon={ArrowRight01Icon} size={20} strokeWidth={2.4} />
			</button>
			<button class="btn-secondary h-11 gap-0.5 rounded-[9px] px-2.5 text-sm" onclick={() => step(10)} title="Tới 10 frame">
				<span class="tabular text-xs font-semibold">10</span>
				<HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2.4} />
			</button>
		</div>

		<button
			class="btn-ghost size-11 rounded-[9px]"
			onclick={() => seekTo(frame_id)}
			title="Về frame search trả về ({frame_id})"
		>
			<HugeiconsIcon icon={Target02Icon} size={19} strokeWidth={1.9} />
		</button>

		<input
			type="number"
			min={loF}
			max={hiF}
			bind:value={frame}
			onchange={() => seekTo(frame)}
			class="field no-spin tabular h-11 w-24 rounded-[9px] text-center font-mono text-base font-bold"
		/>

		{#if onpick}
			<button class="btn-primary ml-auto h-11 rounded-[9px] px-5 text-[13.5px]" onclick={() => onpick?.(frame)}>
				Chọn {frame}
			</button>
		{/if}
	</div>

	<p class="text-[11px] text-ink-500">
		Clip từ giây {startSec.toFixed(2)} · {fps}fps · {seconds}s = {hiF - loF + 1} frame.
		<kbd>←</kbd> <kbd>→</kbd> đi 1 frame · <kbd>Shift</kbd>+mũi tên đi 10 · <kbd>Space</kbd> phát/dừng.
	</p>
</div>
