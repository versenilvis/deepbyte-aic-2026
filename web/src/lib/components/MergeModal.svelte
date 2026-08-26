<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Cancel01Icon,
		CheckmarkCircle02Icon,
		Alert02Icon,
		ArrowRight01Icon
	} from '@hugeicons/core-free-icons';
	import type { Query, Task } from '$lib/types';
	import {
		buildMergePlan,
		executeMerge,
		type ConflictResolution,
		type MergePlan,
		type MergeSummary
	} from '$lib/merge';

	interface Props {
		currentQueries: Query[];
		incomingQueries: Query[];
		onapply: (mergedQueries: Query[]) => void;
		onclose: () => void;
	}

	let { currentQueries, incomingQueries, onapply, onclose }: Props = $props();

	let plan = $derived<MergePlan>(buildMergePlan(currentQueries, incomingQueries));

	let choices = $state<Record<string, ConflictResolution>>({});
	let filterText = $state('');
	let summaryResult = $state<MergeSummary | null>(null);

	const taskStyle: Record<Task, string> = {
		kis: 'border-task-kis/40 bg-task-kis/7 text-task-kis',
		qa: 'border-task-qa/40 bg-task-qa/7 text-task-qa',
		trake: 'border-task-trake/40 bg-task-trake/7 text-task-trake'
	};

	// khởi tạo lựa chọn mặc định khi kế hoạch gộp thay đổi
	$effect(() => {
		const initChoices: Record<string, ConflictResolution> = {};
		for (const conflict of plan.conflicts) {
			const idKey = conflict.id.toLowerCase();
			if (!choices[idKey]) {
				// ưu tiên chọn bên có nhiều đáp án hơn làm giá trị mặc định cho người dùng
				initChoices[idKey] =
					conflict.incoming.answers.length > conflict.current.answers.length
						? 'incoming'
						: 'current';
			} else {
				initChoices[idKey] = choices[idKey];
			}
		}
		choices = initChoices;
	});

	let filteredConflicts = $derived(
		plan.conflicts.filter((c) => {
			if (!filterText.trim()) return true;
			const term = filterText.toLowerCase();
			return (
				c.id.toLowerCase().includes(term) ||
				c.current.brief.toLowerCase().includes(term) ||
				c.incoming.brief.toLowerCase().includes(term)
			);
		})
	);

	// đặt cùng một lựa chọn cho tất cả các câu bị trùng id
	function setAllChoices(choice: ConflictResolution) {
		const next: Record<string, ConflictResolution> = {};
		for (const c of plan.conflicts) {
			next[c.id.toLowerCase()] = choice;
		}
		choices = next;
	}

	// tự động chọn bên nào có nhiều đáp án hơn cho từng câu hỏi
	function autoPickMostAnswers() {
		const next: Record<string, ConflictResolution> = {};
		for (const c of plan.conflicts) {
			next[c.id.toLowerCase()] =
				c.incoming.answers.length > c.current.answers.length ? 'incoming' : 'current';
		}
		choices = next;
	}

	let keptConflictCount = $derived(
		plan.conflicts.filter((c) => (choices[c.id.toLowerCase()] ?? c.choice) === 'current').length
	);

	let replacedConflictCount = $derived(
		plan.conflicts.filter((c) => (choices[c.id.toLowerCase()] ?? c.choice) === 'incoming').length
	);

	let combinedConflictCount = $derived(
		plan.conflicts.filter((c) => (choices[c.id.toLowerCase()] ?? c.choice) === 'combine').length
	);

	let totalResultCount = $derived(
		plan.unmodified.length + plan.newQueries.length + plan.conflicts.length
	);

	// tiến hành gộp dữ liệu và hiển thị bảng tổng kết kết quả
	function handleConfirmMerge() {
		const { mergedQueries, summary } = executeMerge(currentQueries, incomingQueries, choices);
		onapply(mergedQueries);
		summaryResult = summary;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
	onclick={onclose}
>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-[14px] border border-ink-800 bg-ink-900 p-5 shadow-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		{#if !summaryResult}
			<!-- ===== HEADER ===== -->
			<div class="mb-4 flex items-center justify-between border-b border-ink-800 pb-3">
				<div class="flex items-center gap-2.5">
					<div class="flex size-8 items-center justify-center rounded-lg bg-brand/16 text-brand">
						<svg
							class="size-4.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="18" cy="18" r="3"></circle>
							<circle cx="6" cy="6" r="3"></circle>
							<circle cx="6" cy="18" r="3"></circle>
							<path d="M6 9v6"></path>
							<path d="M9 6h4a5 5 0 0 1 5 5v4"></path>
						</svg>
					</div>
					<div>
						<h3 class="text-[15px] font-semibold text-ink-50">Gộp dữ liệu Workspace</h3>
						<p class="text-[12px] text-ink-400">
							Trộn câu hỏi và đáp án từ tệp JSON của đồng đội vào không gian làm việc hiện tại
						</p>
					</div>
				</div>
				<button class="cursor-pointer text-ink-500 hover:text-ink-100" onclick={onclose} title="Đóng">
					<HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.9} />
				</button>
			</div>

			<!-- ===== THÔNG SỐ TỔNG QUAN ===== -->
			<div class="mb-3.5 grid grid-cols-3 gap-2.5">
				<div class="flex items-center justify-between rounded-lg border border-ok/25 bg-ok/8 px-3 py-2">
					<span class="text-xs text-ink-300">Thêm mới (chưa có)</span>
					<span class="font-mono text-sm font-semibold text-ok">+{plan.newQueries.length}</span>
				</div>
				<div
					class="flex items-center justify-between rounded-lg border px-3 py-2 {plan.conflicts.length
						? 'border-warn/30 bg-warn/8'
						: 'border-ink-800 bg-ink-825'}"
				>
					<span class="text-xs text-ink-300">Trùng ID (cần đối chiếu)</span>
					<span
						class="font-mono text-sm font-semibold {plan.conflicts.length
							? 'text-warn'
							: 'text-ink-400'}"
					>
						{plan.conflicts.length}
					</span>
				</div>
				<div class="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-825 px-3 py-2">
					<span class="text-xs text-ink-300">Hiện tại không đổi</span>
					<span class="font-mono text-sm font-semibold text-ink-100">{plan.unmodified.length}</span>
				</div>
			</div>

			<!-- ===== THANH CÔNG CỤ XỬ LÝ NHANH KHI CÓ XUNG ĐỘT ===== -->
			{#if plan.conflicts.length > 0}
				<div
					class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-850 px-3 py-2 text-xs"
				>
					<div class="flex items-center gap-1.5 text-ink-300">
						<HugeiconsIcon icon={Alert02Icon} size={14} class="text-warn" strokeWidth={2} />
						<span>Chọn nhanh cho {plan.conflicts.length} câu trùng:</span>
					</div>
					<div class="flex flex-wrap items-center gap-1.5">
						<button
							class="btn-secondary h-7 px-2.5 text-[11px] hover:border-brand hover:text-brand"
							onclick={autoPickMostAnswers}
							title="Tự động chọn bên có số lượng đáp án nhiều hơn"
						>
							Ưu tiên bên nhiều đáp án
						</button>
						<button
							class="btn-secondary h-7 px-2 text-[11px]"
							onclick={() => setAllChoices('current')}
							title="Giữ nguyên tất cả câu hiện tại trong workspace"
						>
							Tất cả: Giữ hiện tại
						</button>
						<button
							class="btn-secondary h-7 px-2 text-[11px]"
							onclick={() => setAllChoices('incoming')}
							title="Dùng bản mới từ file nạp cho tất cả các câu trùng"
						>
							Tất cả: Dùng bản nạp
						</button>
						<button
							class="btn-secondary h-7 px-2 text-[11px]"
							onclick={() => setAllChoices('combine')}
							title="Gộp chung các đáp án của cả hai bên lại với nhau"
						>
							Tất cả: Ghép đáp án
						</button>
					</div>
				</div>
			{/if}

			<!-- ===== NỘI DUNG CUỘN ĐỐI CHIẾU ===== -->
			<div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
				{#if plan.conflicts.length > 0}
					<div class="space-y-2.5">
						<div class="flex items-center justify-between">
							<span class="label-xs text-ink-400">Bảng đối chiếu câu trùng ID ({plan.conflicts.length})</span>
							{#if plan.conflicts.length > 4}
								<input
									class="field h-7 w-48 py-1 font-mono text-[11px]"
									placeholder="Lọc mã câu hỏi..."
									bind:value={filterText}
								/>
							{/if}
						</div>

						<div class="space-y-2">
							{#each filteredConflicts as conflict (conflict.id)}
								{@const curChoice = choices[conflict.id.toLowerCase()] ?? conflict.choice}
								{@const curAns = conflict.current.answers.length}
								{@const incAns = conflict.incoming.answers.length}
								<div class="rounded-xl border border-ink-800 bg-ink-825/80 p-3 transition-colors">
									<!-- hàng tiêu đề câu -->
									<div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
										<div class="flex items-center gap-2">
											<span
												class="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase {taskStyle[
													conflict.task
												]}"
											>
												{conflict.task}
											</span>
											<span class="font-mono text-xs font-semibold text-ink-50">
												{conflict.id}
											</span>
										</div>

										<!-- nhãn so sánh đáp án -->
										{#if incAns > curAns}
											<span class="rounded bg-brand/12 px-2 py-0.5 font-mono text-[10.5px] text-brand">
												Bản nạp nhiều hơn (+{incAns - curAns} đáp án)
											</span>
										{:else if curAns > incAns}
											<span class="rounded bg-ink-700/50 px-2 py-0.5 font-mono text-[10.5px] text-ink-300">
												Bản hiện tại nhiều hơn (+{curAns - incAns} đáp án)
											</span>
										{:else}
											<span class="rounded bg-ink-800 px-2 py-0.5 font-mono text-[10.5px] text-ink-400">
												Cả hai bên có {curAns} đáp án
											</span>
										{/if}
									</div>

									<!-- 2 cột so sánh chi tiết -->
									<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<!-- Cột Hiện tại -->
										<div
											class="flex flex-col justify-between rounded-lg border p-2.5 transition-colors {curChoice ===
											'current'
												? 'border-brand/60 bg-brand/8'
												: 'border-ink-800 bg-ink-850/60'}"
										>
											<div>
												<div class="flex items-center justify-between">
													<span class="text-[11px] font-medium text-ink-300">Bản hiện tại</span>
													<span
														class="tabular font-mono text-xs font-semibold {curAns > 0
															? 'text-ok'
															: 'text-ink-500'}"
													>
														{curAns} đáp án
													</span>
												</div>
												<p class="mt-1 line-clamp-2 text-[11px] text-ink-400">
													{conflict.current.brief.trim() ||
														(conflict.current.candidates.length
															? `${conflict.current.candidates.length} kết quả tìm kiếm`
															: 'Chưa có mô tả')}
												</p>
											</div>

											<button
												class="mt-2.5 flex h-7.5 w-full items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors {curChoice ===
												'current'
													? 'border-brand bg-brand font-semibold text-ink-950'
													: 'border-ink-700 bg-ink-800 text-ink-300 hover:border-ink-600 hover:text-ink-100'}"
												onclick={() => (choices[conflict.id.toLowerCase()] = 'current')}
											>
												{#if curChoice === 'current'}
													<HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={2.4} />
												{/if}
												<span>Giữ bản hiện tại ({curAns})</span>
											</button>
										</div>

										<!-- Cột Bản nạp vào -->
										<div
											class="flex flex-col justify-between rounded-lg border p-2.5 transition-colors {curChoice ===
											'incoming'
												? 'border-brand/60 bg-brand/8'
												: 'border-ink-800 bg-ink-850/60'}"
										>
											<div>
												<div class="flex items-center justify-between">
													<span class="text-[11px] font-medium text-ink-300">Bản nạp vào</span>
													<span
														class="tabular font-mono text-xs font-semibold {incAns > 0
															? 'text-ok'
															: 'text-ink-500'}"
													>
														{incAns} đáp án
													</span>
												</div>
												<p class="mt-1 line-clamp-2 text-[11px] text-ink-400">
													{conflict.incoming.brief.trim() ||
														(conflict.incoming.candidates.length
															? `${conflict.incoming.candidates.length} kết quả tìm kiếm`
															: 'Chưa có mô tả')}
												</p>
											</div>

											<button
												class="mt-2.5 flex h-7.5 w-full items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors {curChoice ===
												'incoming'
													? 'border-brand bg-brand font-semibold text-ink-950'
													: 'border-ink-700 bg-ink-800 text-ink-300 hover:border-ink-600 hover:text-ink-100'}"
												onclick={() => (choices[conflict.id.toLowerCase()] = 'incoming')}
											>
												{#if curChoice === 'incoming'}
													<HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={2.4} />
												{/if}
												<span>Dùng bản nạp ({incAns})</span>
											</button>
										</div>
									</div>

									<!-- Tuỳ chọn ghép chung nếu cả hai đều có đáp án -->
									<div class="mt-2 flex justify-end">
										<button
											class="flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] transition-colors {curChoice ===
											'combine'
												? 'border border-brand/50 bg-brand/12 font-medium text-brand'
												: 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'}"
											onclick={() => (choices[conflict.id.toLowerCase()] = 'combine')}
										>
											<span>Ghép đáp án không trùng của cả hai bên</span>
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- ===== DANH SÁCH CÂU THÊM MỚI ===== -->
				{#if plan.newQueries.length > 0}
					<div class="rounded-xl border border-ink-800 bg-ink-825/50 p-3">
						<div class="mb-2 flex items-center justify-between">
							<span class="label-xs text-ok">Tự động thêm mới ({plan.newQueries.length} câu)</span>
							<span class="text-[11px] text-ink-400">Không bị trùng, sẽ được thêm vào workspace</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each plan.newQueries as nq}
								<span
									class="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2 py-1 font-mono text-[11px] text-ink-200"
								>
									<span class="uppercase text-[9px] {taskStyle[nq.task]} px-1 rounded">
										{nq.task}
									</span>
									<span>{nq.id}</span>
									{#if nq.answers.length}
										<span class="text-[10px] text-ok">({nq.answers.length} ans)</span>
									{/if}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if plan.conflicts.length === 0 && plan.newQueries.length === 0}
					<div class="rounded-xl border border-ink-800 bg-ink-825 p-6 text-center text-xs text-ink-400">
						Tất cả các câu trong tệp nạp vào đều trùng khớp hoàn toàn với workspace hiện tại.
					</div>
				{/if}
			</div>

			<!-- ===== FOOTER ===== -->
			<div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-3">
				<div class="flex flex-wrap items-center gap-2 text-xs text-ink-400">
					<span>Dự kiến:</span>
					{#if plan.newQueries.length > 0}
						<span class="text-ok font-medium">+{plan.newQueries.length} mới</span>
						<span>·</span>
					{/if}
					<span>{plan.unmodified.length + keptConflictCount} giữ nguyên</span>
					{#if replacedConflictCount > 0}
						<span>·</span>
						<span class="text-brand font-medium">{replacedConflictCount} thay thế</span>
					{/if}
					{#if combinedConflictCount > 0}
						<span>·</span>
						<span class="text-brand-hi font-medium">{combinedConflictCount} ghép chung</span>
					{/if}
					<span>(Tổng: {totalResultCount} câu)</span>
				</div>

				<div class="flex items-center gap-2">
					<button class="btn-secondary h-8.5" onclick={onclose}>Huỷ bỏ</button>
					<button class="btn-primary h-8.5" onclick={handleConfirmMerge}>
						<span>Xác nhận gộp</span>
						<HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2.2} />
					</button>
				</div>
			</div>
		{:else}
			<!-- ===== MÀN HÌNH TỔNG KẾT SAU KHI GỘP ===== -->
			<div class="space-y-4 py-2">
				<div class="flex items-center gap-3">
					<div class="flex size-10 items-center justify-center rounded-xl bg-ok/16 text-ok">
						<HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={2.4} />
					</div>
					<div>
						<h3 class="text-base font-semibold text-ink-50">Gộp workspace thành công</h3>
						<p class="text-xs text-ink-400">
							Dữ liệu đã được trộn vào workspace và lưu an toàn vào bộ nhớ trình duyệt
						</p>
					</div>
				</div>

				<!-- Các thẻ thống kê kết quả -->
				<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
					<div class="rounded-lg border border-ok/25 bg-ok/8 p-3 text-center">
						<div class="text-[11px] text-ink-300">Thêm mới</div>
						<div class="mt-1 font-mono text-xl font-bold text-ok">
							+{summaryResult.addedCount}
						</div>
					</div>
					<div class="rounded-lg border border-ink-800 bg-ink-825 p-3 text-center">
						<div class="text-[11px] text-ink-300">Giữ bản hiện tại</div>
						<div class="mt-1 font-mono text-xl font-bold text-ink-100">
							{summaryResult.keptCount}
						</div>
					</div>
					<div class="rounded-lg border border-brand/25 bg-brand/8 p-3 text-center">
						<div class="text-[11px] text-ink-300">Thay bằng bản nạp</div>
						<div class="mt-1 font-mono text-xl font-bold text-brand">
							{summaryResult.replacedCount}
						</div>
					</div>
					<div class="rounded-lg border border-ink-800 bg-ink-825 p-3 text-center">
						<div class="text-[11px] text-ink-300">Tổng truy vấn</div>
						<div class="mt-1 font-mono text-xl font-bold text-ink-50">
							{summaryResult.totalCount}
						</div>
					</div>
				</div>

				<!-- Danh sách chi tiết các mã câu đã gộp -->
				<div class="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-ink-800 bg-ink-825/60 p-3 text-xs">
					{#if summaryResult.addedIds.length > 0}
						<div>
							<span class="font-semibold text-ok">Câu đã thêm mới ({summaryResult.addedIds.length}): </span>
							<span class="font-mono text-ink-300">{summaryResult.addedIds.join(', ')}</span>
						</div>
					{/if}

					{#if summaryResult.replacedIds.length > 0}
						<div>
							<span class="font-semibold text-brand">Câu đã thay thế ({summaryResult.replacedIds.length}): </span>
							<span class="font-mono text-ink-300">{summaryResult.replacedIds.join(', ')}</span>
						</div>
					{/if}

					{#if summaryResult.combinedIds.length > 0}
						<div>
							<span class="font-semibold text-brand-hi">Câu đã ghép đáp án ({summaryResult.combinedIds.length}): </span>
							<span class="font-mono text-ink-300">{summaryResult.combinedIds.join(', ')}</span>
						</div>
					{/if}

					{#if summaryResult.keptIds.length > 0}
						<div>
							<span class="font-semibold text-ink-400">Câu giữ nguyên ({summaryResult.keptIds.length}): </span>
							<span class="font-mono text-ink-400">{summaryResult.keptIds.join(', ')}</span>
						</div>
					{/if}
				</div>

				<div class="flex justify-end pt-2">
					<button class="btn-primary h-9 px-5" onclick={onclose}>
						Hoàn tất
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
