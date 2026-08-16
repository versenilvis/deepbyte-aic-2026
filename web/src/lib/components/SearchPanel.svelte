<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Alert02Icon,
		EyeIcon,
		Loading03Icon,
		Mic01Icon,
		Search01Icon,
		SlidersHorizontalIcon,
		TextFontIcon
	} from '@hugeicons/core-free-icons';
	import { search } from '$lib/api';
	import { ws } from '$lib/store.svelte';
	import { WEIGHT_PRESETS, type Query, type Weights } from '$lib/types';

	let { query }: { query: Query } = $props();

	let topK = $state(100);
	let manual = $state(false);
	let parsed = $state<any>(null);
	let showCfg = $state(false);

	let w = $derived.by<Weights>(() => query.weights ?? { visual: 1, speech: 1, ocr: 1 });

	function setW(k: keyof Weights, v: number) {
		query.weights = { ...w, [k]: v };
		ws.save();
	}

	function preset(name: string) {
		query.weights = { ...WEIGHT_PRESETS[name] };
		ws.save();
	}

	async function run() {
		if (ws.busy) return;
		ws.busy = true;
		ws.error = null;
		try {
			const out = await search(query.prompt, {
				top_k: topK,
				weights: w,
				rawPrompt: manual ? undefined : query.brief
			});
			query.candidates = out.results;
			// Số events do LLM tách ra, không bắt người dùng đoán.
			const n = (out.parsed as any)?.actions?.length;
			if (query.task === "trake" && n > 1) query.n_events = n;
			parsed = out.parsed;
			if (!manual && parsed) {
				query.prompt = {
					spatial_context: parsed.spatial_context ?? [],
					asr_text: parsed.asr_text ?? [],
					ocr_text: parsed.ocr_text ?? []
				};
			}
			query.searchedAt = Date.now();
			ws.save();
		} catch (e) {
			ws.error = `Search không thành công: ${(e as Error).message}`;
		} finally {
			ws.busy = false;
		}
	}
</script>

<div class="border-b border-slate-800/80 bg-[#161616] p-4">
	<!-- search input area -->
	<div class="flex items-start gap-3">
		<div class="relative flex-1">
			<textarea
				class="field h-20 w-full resize-none rounded-xl border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
				placeholder="Gõ đề bài bằng tiếng Việt (ví dụ: tìm cảnh bản tin thời sự người dẫn chương trình nói về nắng nóng)..."
				bind:value={query.brief}
				onchange={() => ws.save()}
				onkeydown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && run()}
			></textarea>
			<div class="absolute right-3 bottom-2 flex items-center gap-1.5 text-[10px] text-slate-500">
				<kbd class="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-[9px]">⌘/Ctrl+Enter</kbd>
			</div>
		</div>

		<button
			class="cursor-pointer btn-primary h-20 w-32 shrink-0 flex-col rounded-xl px-4 text-sm font-bold shadow-indigo-500/25"
			onclick={run}
			disabled={ws.busy || (!manual && !query.brief.trim())}
		>
			{#if ws.busy}
				<svg class="size-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
				</svg>
				<span class="text-xs font-medium">Đang tìm...</span>
			{:else}
				<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
				</svg>
				<span>Tìm kiếm</span>
			{/if}
		</button>
	</div>

	<!-- toolbar options -->
	<div class="mt-3 flex flex-wrap items-center gap-3 text-xs">
		{#if query.task === 'trake' && query.n_events}
			<span
				class="rounded-lg border border-ink-800 bg-ink-900 px-2 py-1 text-[11px] text-ink-300"
				title="Số events do LLM tách từ prompt — không cần nhập tay"
			>
				<span class="tabular font-semibold text-rank-1">{query.n_events}</span> events
			</span>
		{/if}

		<div class="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-1">
			<span class="text-[11px] text-slate-400">Top-k</span>
			<select
				class="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-200"
				bind:value={topK}
			>
				<option value={50}>50</option>
				<option value={100}>100</option>
				<option value={200}>200</option>
			</select>
		</div>

		<label class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-slate-300 transition-colors hover:bg-slate-800">
			<input type="checkbox" bind:checked={manual} class="size-3.5 rounded accent-indigo-500" />
			<span class="text-[11px]">Chỉnh tay</span>
		</label>

		<button
			class="cursor-pointer flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition-all {showCfg
				? 'border-indigo-500/50 bg-indigo-950/30 text-indigo-300'
				: 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200'}"
			onclick={() => (showCfg = !showCfg)}
		>
			<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"></path>
			</svg>
			<span class="text-[11px]">Trọng số ({w.visual}/{w.speech}/{w.ocr})</span>
		</button>

		{#if query.candidates.length}
			<div class="ml-auto flex items-center gap-2">
				<button
					class="cursor-pointer btn-secondary py-1 text-[11px]"
					onclick={() => ws.populateTopK(query, 5)}
					title="Thêm nhanh 5 kết quả đầu vào danh sách nộp"
				>
					+ Chọn top 5
				</button>
				<span class="rounded-full bg-slate-800/80 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-300">
					{query.candidates.length} kết quả
				</span>
			</div>
		{/if}
	</div>

	<!-- weights equalizer drawer -->
	{#if showCfg}
		<div class="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 shadow-inner">
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<span class="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Mẫu trọng số:</span>
				{#each Object.keys(WEIGHT_PRESETS) as name}
					<button
						class="cursor-pointer rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500/50 hover:bg-slate-800 hover:text-white"
						onclick={() => preset(name)}
					>
						{name}
					</button>
				{/each}
			</div>

			<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
				{#each [
					{ key: 'visual', label: 'Hình ảnh (CLIP)', color: 'accent-indigo-500', text: 'text-indigo-400' },
					{ key: 'speech', label: 'Lời nói (ASR)', color: 'accent-emerald-500', text: 'text-emerald-400' },
					{ key: 'ocr', label: 'Chữ màn hình (OCR)', color: 'accent-amber-500', text: 'text-amber-400' }
				] as item}
					<div class="rounded-lg border border-slate-800/60 bg-slate-900/50 p-2.5">
						<div class="mb-1.5 flex items-center justify-between text-xs">
							<span class="font-medium {item.text}">{item.label}</span>
							<span class="font-mono font-bold {w[item.key as keyof Weights] === 0 ? 'text-rose-400' : 'text-slate-200'}">
								{w[item.key as keyof Weights].toFixed(1)}
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="2"
							step="0.1"
							value={w[item.key as keyof Weights]}
							oninput={(e) => setW(item.key as keyof Weights, +e.currentTarget.value)}
							class="w-full {item.color}"
						/>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- extracted cues display -->
	{#if parsed || manual}
		<div class="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
			{#each [
				{ label: 'Nhìn thấy (Visual)', key: 'spatial_context', icon: '', color: 'text-indigo-400' },
				{ label: 'Nghe thấy (Speech)', key: 'asr_text', icon: '', color: 'text-emerald-400' },
				{ label: 'Chữ xuất hiện (OCR)', key: 'ocr_text', icon: '', color: 'text-amber-400' }
			] as item}
				<div class="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5">
					<div class="mb-1 flex items-center gap-1.5">
						<span class="text-xs">{item.icon}</span>
						<span class="text-[10px] font-bold tracking-wider {item.color} uppercase">{item.label}</span>
					</div>

					{#if manual}
						<input
							class="field py-1 text-xs"
							value={(query.prompt as any)[item.key].join(' | ')}
							onchange={(e) => {
								(query.prompt as any)[item.key] = e.currentTarget.value
									.split('|')
									.map((s) => s.trim())
									.filter(Boolean);
								ws.save();
							}}
						/>
					{:else}
						<div class="min-h-7 rounded border border-slate-800/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
							{#if (query.prompt as any)[item.key]?.length}
								<div class="flex flex-wrap gap-1">
									{#each (query.prompt as any)[item.key] as token}
										<span class="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200">
											{token}
										</span>
									{/each}
								</div>
							{:else}
								<span class="text-slate-600 italic">Không có dữ liệu</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if parsed?.reasoning_process}
			<details class="mt-2 text-xs">
				<summary class="cursor-pointer font-medium text-slate-500 transition-colors hover:text-slate-300">
					Xem suy luận của LLM
				</summary>
				<div class="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] leading-relaxed text-slate-400">
					{parsed.reasoning_process}
				</div>
			</details>
		{/if}
	{/if}
</div>
