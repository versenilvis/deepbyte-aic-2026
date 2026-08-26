<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Alert02Icon } from '@hugeicons/core-free-icons';
	import type { Query, Task } from '$lib/types';
	import { applyPicked, buildPickList, type PickRow } from '$lib/merge';

	interface Props {
		currentQueries: Query[];
		incomingQueries: Query[];
		/** Tên nguồn, để người dùng biết đang lấy của ai. */
		fromName?: string;
		onapply: (mergedQueries: Query[]) => void;
		onclose: () => void;
	}

	let { currentQueries, incomingQueries, fromName = '', onapply, onclose }: Props = $props();

	let rows = $derived<PickRow[]>(buildPickList(currentQueries, incomingQueries));
	let filter = $state('');

	/**
	 * Tích sẵn những dòng KHÔNG làm mất gì: câu mình chưa có, hoặc mình chưa chọn
	 * đáp án nào. Dòng sẽ đè mất đáp án của mình thì để trống - người dùng phải chủ
	 * động tích, không thể lỡ tay mất một buổi làm việc.
	 */
	let picked = $state<Set<string>>(new Set());
	let inited = $state('');
	$effect(() => {
		const key = incomingQueries.map((q) => q.id).join(',');
		if (key === inited) return;
		inited = key;
		picked = new Set(rows.filter((r) => !r.overwrites && r.incomingAnswers > 0).map((r) => r.id.toLowerCase()));
	});

	let shown = $derived(
		rows.filter((r) => !filter.trim() || r.id.includes(filter.trim().toLowerCase()))
	);

	function toggle(id: string) {
		const next = new Set(picked);
		const k = id.toLowerCase();
		next.has(k) ? next.delete(k) : next.add(k);
		picked = next;
	}

	const taskStyle: Record<Task, string> = {
		kis: 'border-task-kis/40 bg-task-kis/7 text-task-kis',
		qa: 'border-task-qa/40 bg-task-qa/7 text-task-qa',
		trake: 'border-task-trake/40 bg-task-trake/7 text-task-trake'
	};

	let overwriteCount = $derived(rows.filter((r) => r.overwrites && picked.has(r.id.toLowerCase())).length);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
	onclick={onclose}
>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[14px] border border-ink-800 bg-ink-900 p-5 shadow-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="mb-3 flex items-center justify-between border-b border-ink-800 pb-3">
			<div>
				<h3 class="text-[15px] font-semibold text-ink-50">
					Lấy câu về{fromName ? ` từ "${fromName}"` : ''}
				</h3>
				<p class="text-[12px] text-ink-400">Tích câu nào thì lấy câu đó, phần còn lại giữ nguyên</p>
			</div>
			<button class="cursor-pointer text-ink-500 hover:text-ink-100" onclick={onclose} title="Đóng">
				<HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.9} />
			</button>
		</div>

		<div class="mb-2.5 flex items-center gap-2">
			<input class="field h-8 flex-1 font-mono text-xs" placeholder="Lọc theo mã câu, vd: p1-12" bind:value={filter} />
			<button class="btn-secondary h-8 px-3 text-xs" onclick={() => (picked = new Set(shown.map((r) => r.id.toLowerCase())))}>
				Chọn hết
			</button>
			<button class="btn-secondary h-8 px-3 text-xs" onclick={() => (picked = new Set())}>Bỏ hết</button>
		</div>

		<div class="min-h-0 flex-1 space-y-1 overflow-y-auto">
			{#each shown as r (r.id)}
				{@const on = picked.has(r.id.toLowerCase())}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors
					{on ? 'border-brand/50 bg-brand/8' : 'border-ink-800 bg-ink-825 hover:border-ink-700'}"
					onclick={() => toggle(r.id)}
				>
					<input type="checkbox" checked={on} tabindex="-1" class="size-3.5 rounded accent-brand" />
					<span class="rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase {taskStyle[r.task]}">
						{r.task}
					</span>
					<span class="flex-1 truncate font-mono text-[12.5px] text-ink-100">{r.id}</span>

					{#if r.currentAnswers === null}
						<span class="text-[11px] text-ok">mới</span>
					{:else if r.overwrites}
						<span class="flex items-center gap-1 text-[11px] text-warn">
							<HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={2} />
							đè mất {r.currentAnswers} đáp án của bạn
						</span>
					{/if}
					<span class="tabular w-16 text-right text-[11px] text-ink-500">{r.incomingAnswers} đáp án</span>
				</div>
			{/each}
			{#if !shown.length}
				<p class="py-8 text-center text-xs text-ink-500">Không có câu nào khớp</p>
			{/if}
		</div>

		<div class="mt-3 flex items-center justify-between border-t border-ink-800 pt-3">
			<p class="text-[12px] text-ink-400">
				Lấy <span class="font-semibold text-brand-hi">{picked.size}</span> câu
				{#if overwriteCount}
					<span class="text-warn">· {overwriteCount} câu sẽ đè mất bài của bạn</span>
				{/if}
			</p>
			<div class="flex gap-2">
				<button class="btn-secondary h-8 px-4 text-xs" onclick={onclose}>Huỷ bỏ</button>
				<button
					class="btn-primary h-8 px-5 text-xs"
					disabled={!picked.size}
					onclick={() => onapply(applyPicked(currentQueries, incomingQueries, picked))}
				>
					Xác nhận
				</button>
			</div>
		</div>
	</div>
</div>
