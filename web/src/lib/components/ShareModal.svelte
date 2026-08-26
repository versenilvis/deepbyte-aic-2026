<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Alert02Icon } from '@hugeicons/core-free-icons';
	import { getHub, getWho, setHub, setWho, wsGet, wsList, wsPut, type WsItem } from '$lib/api';
	import { ws } from '$lib/store.svelte';

	interface Props {
		/** Nhận về chuỗi JSON đã tải, để trang cha đưa qua luồng gộp có sẵn. */
		onpull: (text: string, name: string) => void;
		onclose: () => void;
	}

	let { onpull, onclose }: Props = $props();

	/**
	 * `hub` là địa chỉ RIÊNG, không phải backend đang tìm kiếm.
	 *
	 * Mỗi người chạy một phiên Kaggle riêng nên backend tìm kiếm của họ khác nhau,
	 * còn chỗ trao đổi thì phải là một máy duy nhất cả đội cùng trỏ tới. Mặc định
	 * lấy backend hiện tại cho tiện, nhưng đội trưởng sẽ đổi thành máy của mình.
	 */
	let hub = $state(getHub());
	let who = $state(getWho());
	let items = $state<WsItem[]>([]);
	let busy = $state(false);
	let msg = $state<string | null>(null);
	let err = $state<string | null>(null);

	function fmtSize(n: number) {
		return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
	}

	function fmtWhen(sec: number) {
		const d = new Date(sec * 1000);
		return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
	}

	async function refresh() {
		busy = true;
		err = null;
		try {
			setHub(hub);
			items = (await wsList(hub)).items;
		} catch (e) {
			err = (e as Error).message;
			items = [];
		} finally {
			busy = false;
		}
	}

	async function push() {
		if (!who.trim()) {
			err = 'Nhập tên của bạn trước - nó là tên bản trên hub.';
			return;
		}
		busy = true;
		err = null;
		msg = null;
		try {
			setHub(hub);
			setWho(who);
			const r = await wsPut(hub, who.trim(), ws.toJSON());
			msg = `Đã đẩy "${who.trim()}" lên hub (${fmtSize(r.size)}).`;
			await refresh();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function pull(name: string) {
		busy = true;
		err = null;
		try {
			const text = await wsGet(hub, name);
			onpull(text, name);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	// nạp danh sách ngay khi mở, khỏi bắt bấm thêm một nút
	$effect(() => {
		if (hub.trim()) refresh();
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
	onclick={onclose}
>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-[14px] border border-ink-800 bg-ink-900 p-5 shadow-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="mb-4 flex items-center justify-between border-b border-ink-800 pb-3">
			<div>
				<h3 class="text-[15px] font-semibold text-ink-50">Chia sẻ workspace</h3>
				<p class="text-[12px] text-ink-400">
					Đẩy bài của bạn lên một máy chung, khỏi gửi file qua tin nhắn
				</p>
			</div>
			<button class="cursor-pointer text-ink-500 hover:text-ink-100" onclick={onclose} title="Đóng">
				<HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.9} />
			</button>
		</div>

		<div class="mb-3 flex flex-wrap items-end gap-2.5">
			<label class="flex min-w-[260px] flex-1 flex-col gap-1">
				<span class="text-[11px] text-ink-500">Địa chỉ hub (máy chung của đội)</span>
				<input class="field h-8 font-mono text-xs" bind:value={hub} onblur={refresh} />
			</label>
			<label class="flex w-32 flex-col gap-1">
				<span class="text-[11px] text-ink-500">Tên của bạn</span>
				<input class="field h-8 font-mono text-xs" placeholder="A" bind:value={who} />
			</label>
			<button class="btn-primary h-8 px-4 text-xs" onclick={push} disabled={busy}>
				Đẩy lên
			</button>
			<button class="btn-secondary h-8 px-3 text-xs" onclick={refresh} disabled={busy}>
				Làm mới
			</button>
		</div>

		<!-- Cảnh báo thật, không phải trang trí: /kaggle/working mất khi phiên kết thúc. -->
		<div class="mb-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11.5px] text-warn">
			<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} class="mt-px shrink-0" />
			<span>
				Dữ liệu trên hub nằm ở <span class="font-mono">/kaggle/working</span>, MẤT khi phiên
				Kaggle kết thúc. Đây là chỗ trao đổi nhanh, không phải nơi lưu trữ - vẫn phải bấm
				"Lưu workspace" để giữ bản trên máy.
			</span>
		</div>

		{#if err}
			<p class="mb-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[12px] text-bad">{err}</p>
		{/if}
		{#if msg}
			<p class="mb-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-[12px] text-ok">{msg}</p>
		{/if}

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if !items.length}
				<p class="py-8 text-center text-xs text-ink-500">
					{busy ? 'Đang tải...' : 'Hub chưa có workspace nào'}
				</p>
			{:else}
				<div class="flex flex-col gap-1.5">
					{#each items as it (it.name)}
						<div class="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-825 px-3 py-2">
							<span class="flex-1 truncate font-mono text-[12.5px] text-ink-100">{it.name}</span>
							<span class="tabular text-[11px] text-ink-500">{fmtSize(it.size)}</span>
							<span class="tabular text-[11px] text-ink-500">{fmtWhen(it.saved_at)}</span>
							<button class="btn-secondary h-7 px-2.5 text-[11px]" onclick={() => pull(it.name)} disabled={busy}>
								Lấy về &amp; gộp
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
