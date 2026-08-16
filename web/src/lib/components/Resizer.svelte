<script lang="ts">
	import { ws } from '$lib/store.svelte';

	let {
		side,
		min = 150,
		max = 560
	}: { side: 'left' | 'right'; min?: number; max?: number } = $props();

	let dragging = $state(false);

	function start(e: PointerEvent) {
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function move(e: PointerEvent) {
		if (!dragging) return;
		// cột phải kéo ngược chiều: rộng ra khi chuột đi sang trái
		const w = side === 'left' ? e.clientX : window.innerWidth - e.clientX;
		const clamped = Math.min(max, Math.max(min, w));
		if (side === 'left') ws.leftW = clamped;
		else ws.rightW = clamped;
	}

	function end() {
		if (!dragging) return;
		dragging = false;
		ws.save();
	}
</script>

<!-- vùng bắt chuột rộng 5px nhưng vạch nhìn thấy chỉ 1px -->
<div
	role="separator"
	aria-orientation="vertical"
	class="group relative z-10 w-[5px] shrink-0 cursor-col-resize select-none"
	onpointerdown={start}
	onpointermove={move}
	onpointerup={end}
	onpointercancel={end}
	ondblclick={() => {
		if (side === 'left') ws.leftW = 200;
		else ws.rightW = 256;
		ws.save();
	}}
	title="Kéo để đổi bề rộng · bấm đúp để về mặc định"
>
	<div
		class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors
      {dragging ? 'bg-ink-300' : 'bg-ink-800 group-hover:bg-ink-700'}"
	></div>
</div>
