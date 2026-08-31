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
	import {
		ALL_VIDEO_FOLDERS,
		TASK_TYPE,
		WEIGHT_PRESETS,
		type Query,
		type Weights
	} from '$lib/types';

	let { query }: { query: Query } = $props();

	let topK = $state(100);
	let manual = $state(false);
	let parsed = $state<any>(null);
	let showCfg = $state(false);
	let showRegions = $state(false);

	let w = $derived.by<Weights>(() => query.weights ?? { visual: 1, speech: 1, ocr: 1 });

	function setW(k: keyof Weights, v: number) {
		query.weights = { ...w, [k]: v };
		ws.save();
	}

	function preset(name: string) {
		query.weights = { ...WEIGHT_PRESETS[name] };
		ws.save();
	}

	function toggleRegion(folder: string) {
		const curr = new Set(query.search_regions ?? []);
		if (curr.has(folder)) {
			curr.delete(folder);
		} else {
			curr.add(folder);
		}
		query.search_regions = Array.from(curr);
		ws.save();
	}

	function selectAllRegions() {
		query.search_regions = [...ALL_VIDEO_FOLDERS];
		ws.save();
	}

	function clearAllRegions() {
		query.search_regions = [];
		ws.save();
	}

	function toggleGroup(prefixes: string[]) {
		const matched = ALL_VIDEO_FOLDERS.filter((f) => prefixes.some((p) => f.includes(p)));
		const curr = new Set(query.search_regions ?? []);
		const allIn = matched.every((f) => curr.has(f));
		if (allIn) {
			matched.forEach((f) => curr.delete(f));
		} else {
			matched.forEach((f) => curr.add(f));
		}
		query.search_regions = Array.from(curr);
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
				rawPrompt: manual ? undefined : query.brief,
				task_type: TASK_TYPE[query.task],
				search_regions: query.search_regions
			});
			query.candidates = out.results;
			// Số events do LLM tách ra, không bắt người dùng đoán.
			const n = (out.parsed as any)?.actions?.length;
			if (query.task === 'trake' && n > 1) query.n_events = n;
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

<div class="border-b border-ink-800 bg-ink-900 p-4">
	<!-- search input area -->
	<div class="flex items-start gap-3">
		<div class="relative flex-1">
			<textarea
				class="field h-[76px] w-full resize-none rounded-[10px] bg-ink-925 p-3 text-sm leading-relaxed"
				placeholder="Gõ đề bài bằng tiếng Việt (ví dụ: tìm cảnh bản tin thời sự người dẫn chương trình nói về nắng nóng)..."
				bind:value={query.brief}
				onchange={() => ws.save()}
				onkeydown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && run()}
			></textarea>
			<div class="absolute right-2.5 bottom-2 flex items-center gap-1.5">
				<kbd>⌘/Ctrl + Enter</kbd>
			</div>
		</div>

		<button
			class="btn-primary h-[76px] w-32 shrink-0 flex-col gap-1.5 rounded-[10px] px-4 text-[13px]"
			onclick={run}
			disabled={ws.busy || (!manual && !query.brief.trim())}
		>
			{#if ws.busy}
				<svg class="size-5 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
				</svg>
				<span class="text-xs">Đang tìm...</span>
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
				class="rounded-lg border border-task-trake/34 bg-task-trake/8 px-2.5 py-1 text-[11px] text-task-trake"
				title="Số events do LLM tách từ prompt - không cần nhập tay"
			>
				<span class="tabular font-semibold">{query.n_events}</span> events
			</span>
		{/if}

		<div class="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-825 px-2 py-1">
			<span class="text-[11px] text-ink-500">Top-k</span>
			<select
				class="cursor-pointer rounded bg-ink-850 px-1.5 py-0.5 font-mono text-xs text-ink-100"
				bind:value={topK}
			>
				<option value={50}>50</option>
				<option value={100}>100</option>
				<option value={200}>200</option>
			</select>
		</div>

		<label class="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-800 bg-ink-825 px-2.5 py-1 text-ink-300 transition-colors hover:border-ink-700">
			<input type="checkbox" bind:checked={manual} class="size-3.5 rounded accent-brand" />
			<span class="text-[11px]">Chỉnh tay</span>
		</label>

		<button
			class="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 transition-colors {showCfg
				? 'border-brand/45 bg-brand/10 text-brand-hi'
				: 'border-ink-800 bg-ink-825 text-ink-400 hover:border-ink-700 hover:text-ink-200'}"
			onclick={() => (showCfg = !showCfg)}
		>
			<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"></path>
			</svg>
			<span class="text-[11px]">Trọng số</span>
			<span class="tabular font-mono text-[11px]">{w.visual.toFixed(1)} / {w.speech.toFixed(1)} / {w.ocr.toFixed(1)}</span>
		</button>

		<button
			class="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 transition-colors {showRegions
				? 'border-brand/45 bg-brand/10 text-brand-hi'
				: query.search_regions && query.search_regions.length > 0 && query.search_regions.length < ALL_VIDEO_FOLDERS.length
				? 'border-brand/40 bg-brand/10 text-brand-hi'
				: 'border-ink-800 bg-ink-825 text-ink-400 hover:border-ink-700 hover:text-ink-200'}"
			onclick={() => (showRegions = !showRegions)}
			title="Giới hạn vùng thư mục cần tìm kiếm"
		>
			<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
			</svg>
			<span class="text-[11px]">Thư mục</span>
			{#if query.search_regions && query.search_regions.length > 0 && query.search_regions.length < ALL_VIDEO_FOLDERS.length}
				<span class="tabular font-mono text-[11px] font-semibold text-brand-hi">
					{query.search_regions.length}/{ALL_VIDEO_FOLDERS.length}
				</span>
			{:else}
				<span class="tabular text-[11px] text-ink-500">Tất cả</span>
			{/if}
		</button>

		{#if query.candidates.length}
			<div class="ml-auto flex items-center gap-2">
				<button
					class="btn-secondary h-7 py-1 text-[11px]"
					onclick={() => ws.populateTopK(query, 5)}
					title="Thêm nhanh 5 kết quả đầu vào danh sách nộp"
				>
					+ Chọn top 5
				</button>
				<span class="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 font-mono text-[11px] font-medium text-brand-hi">
					{query.candidates.length} kết quả
				</span>
			</div>
		{/if}
	</div>

	<!-- regions selection drawer -->
	{#if showRegions}
		<div class="mt-3 rounded-[10px] border border-ink-800 bg-ink-925 p-3">
			<div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<span class="label-xs text-ink-400">Giới hạn thư mục:</span>
					<span class="text-[11px] {query.search_regions && query.search_regions.length > 0 && query.search_regions.length < ALL_VIDEO_FOLDERS.length ? 'text-brand-hi font-medium' : 'text-ink-500'}">
						{query.search_regions && query.search_regions.length > 0 && query.search_regions.length < ALL_VIDEO_FOLDERS.length
							? `Đang chọn ${query.search_regions.length}/${ALL_VIDEO_FOLDERS.length} thư mục`
							: 'Đang tìm toàn bộ (14 thư mục)'}
					</span>
				</div>
				<div class="flex items-center gap-1.5">
					<button
						class="cursor-pointer rounded border border-ink-800 bg-ink-850 px-2 py-0.5 text-[11px] text-ink-300 transition-colors hover:border-brand/40 hover:text-brand-hi"
						onclick={selectAllRegions}
					>
						Chọn tất cả
					</button>
					<button
						class="cursor-pointer rounded border border-ink-800 bg-ink-850 px-2 py-0.5 text-[11px] text-ink-300 transition-colors hover:border-brand/40 hover:text-brand-hi"
						onclick={clearAllRegions}
					>
						Toàn bộ (bỏ lọc)
					</button>
				</div>
			</div>

			<!-- Quick group selectors -->
			<div class="mb-3 flex flex-wrap items-center gap-1.5">
				<span class="text-[10px] uppercase font-medium text-ink-500">Nhóm nhanh:</span>
				{#each [
					{ label: 'L21 - L25', prefixes: ['L21', 'L22', 'L23', 'L24', 'L25'] },
					{ label: 'L26 (a-e)', prefixes: ['L26'] },
					{ label: 'L27 - L30', prefixes: ['L27', 'L28', 'L29', 'L30'] }
				] as grp}
					<button
						class="cursor-pointer rounded border border-ink-800 bg-ink-900 px-2 py-0.5 text-[10.5px] text-ink-300 transition-colors hover:border-brand/40 hover:text-brand-hi"
						onclick={() => toggleGroup(grp.prefixes)}
					>
						{grp.label}
					</button>
				{/each}
			</div>

			<!-- Checkbox chips grid -->
			<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">
				{#each ALL_VIDEO_FOLDERS as folder}
					{@const active = (query.search_regions ?? []).includes(folder)}
					<button
						class="flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-all {active
							? 'border-brand/50 bg-brand/15 text-brand-hi shadow-sm shadow-brand/10'
							: 'border-ink-800 bg-ink-900 text-ink-400 hover:border-ink-700 hover:text-ink-200'}"
						onclick={() => toggleRegion(folder)}
					>
						<span class="font-mono text-[11px] truncate">{folder.replace('Videos_', '')}</span>
						<span class="size-3.5 flex items-center justify-center rounded border {active ? 'border-brand bg-brand text-ink-950' : 'border-ink-700 bg-ink-950'}">
							{#if active}
								<svg class="size-2.5 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							{/if}
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- weights equalizer drawer -->
	{#if showCfg}
		<div class="mt-3 rounded-[10px] border border-ink-800 bg-ink-925 p-3">
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<span class="label-xs">Mẫu trọng số</span>
				{#each Object.keys(WEIGHT_PRESETS) as name}
					<button
						class="cursor-pointer rounded-md border border-ink-800 bg-ink-850 px-2.5 py-1 text-[11px] font-medium text-ink-300 transition-colors hover:border-brand/50 hover:bg-brand/10 hover:text-brand-hi"
						onclick={() => preset(name)}
					>
						{name}
					</button>
				{/each}
			</div>

			<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
				{#each [
					{ key: 'visual', label: 'Hình ảnh (CLIP)', color: 'accent-brand', text: 'text-brand' },
					{ key: 'speech', label: 'Lời nói (ASR)', color: 'accent-task-qa', text: 'text-task-qa' },
					{ key: 'ocr', label: 'Chữ màn hình (OCR)', color: 'accent-rank-1', text: 'text-rank-1' }
				] as item}
					<div class="rounded-lg border border-ink-800 bg-ink-900 p-2.5">
						<div class="mb-1.5 flex items-center justify-between text-xs">
							<span class="text-[11.5px] font-medium {item.text}">{item.label}</span>
							<span class="tabular font-mono font-semibold {w[item.key as keyof Weights] === 0 ? 'text-bad' : 'text-ink-50'}">
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
				{ label: 'Nhìn thấy (Visual)', key: 'spatial_context', color: 'text-brand' },
				{ label: 'Nghe thấy (Speech)', key: 'asr_text', color: 'text-task-qa' },
				{ label: 'Chữ xuất hiện (OCR)', key: 'ocr_text', color: 'text-rank-1' }
			] as item}
				<div class="rounded-lg border border-ink-800 bg-ink-900 p-2.5">
					<div class="mb-2 flex items-center gap-1.5">
						<span class="text-[9.5px] font-semibold tracking-[0.13em] {item.color} uppercase">{item.label}</span>
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
						<div class="min-h-7 rounded-md border border-ink-800 bg-ink-925 px-2 py-1.5 text-xs text-ink-300">
							{#if (query.prompt as any)[item.key]?.length}
								<div class="flex flex-wrap gap-1">
									{#each (query.prompt as any)[item.key] as token}
										<span class="rounded-[5px] bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-200">
											{token}
										</span>
									{/each}
								</div>
							{:else}
								<span class="text-ink-700 italic">Không có dữ liệu</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if parsed?.reasoning_process}
			<details class="mt-2 text-xs">
				<summary class="cursor-pointer font-medium text-ink-500 transition-colors hover:text-ink-300">
					Xem suy luận của LLM
				</summary>
				<div class="mt-1.5 rounded-lg border border-ink-800 bg-ink-925 p-2.5 text-[11px] leading-relaxed text-ink-400">
					{parsed.reasoning_process}
				</div>
			</details>
		{/if}
	{/if}
</div>
