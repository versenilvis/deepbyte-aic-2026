<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Alert02Icon } from '@hugeicons/core-free-icons';
	import { TEAM, wsGet, wsList, wsPut, type WsItem } from '$lib/api';
	import { ws } from '$lib/store.svelte';

	interface Props {
		/** Nhận về chuỗi JSON đã tải, để trang cha mở bảng chọn câu. */
		onpull: (text: string, name: string) => void;
		onclose: () => void;
	}

	let { onpull, onclose }: Props = $props();

	/** Một dòng = một máy trong đội. Luôn hiện đủ, kể cả máy chưa bật. */
	/** `alive` = hỏi được máy. Khác `item != null` = máy đã có bài. Máy sống nhưng
	 *  rỗng thì vẫn ĐẨY LÊN được, chỉ là chưa LẤY VỀ được. */
	type Row = { host: string; who: string; item: WsItem | null; why: string; extra: number; alive: boolean };

	let rows = $state<Row[]>(
		TEAM.map((t) => ({ host: t.host, who: t.name, item: null, why: 'đang hỏi...', extra: 0, alive: false }))
	);
	let busy = $state(false);
	let msg = $state<string | null>(null);
	let err = $state<string | null>(null);

	const fmtSize = (n: number) =>
		n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

	const fmtWhen = (sec: number) =>
		new Date(sec * 1000).toLocaleString('vi-VN', {
			hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
		});

	const short = (h: string) => h.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

	/**
	 * Hỏi TẤT CẢ máy song song bằng allSettled, KHÔNG phải all: một máy tắt không
	 * được làm hỏng phần còn lại. Máy nào hỏng thì giữ dòng lại và ghi lý do, đừng
	 * xoá khỏi danh sách - người dùng cần thấy đủ 4 người để biết ai đã đẩy bài.
	 */
	async function refresh() {
		busy = true;
		err = null;
		const res = await Promise.allSettled(TEAM.map((t) => wsList(t.host)));
		rows = TEAM.map((t, i) => {
			const r = res[i];
			if (r.status !== 'fulfilled') {
				const m = String((r.reason as Error)?.message ?? '');
				return {
					host: t.host, who: t.name, item: null, extra: 0, alive: false,
					why: /key/i.test(m) ? 'sai key' : /5\d\d/.test(m) ? 'máy chưa bật' : 'không kết nối được'
				};
			}
			// Thường mỗi máy chỉ có một bản; nếu nhiều thì lấy bản mới nhất.
			const sorted = [...r.value.items].sort((a, b) => b.saved_at - a.saved_at);
			const newest = sorted[0] ?? null;
			return {
				host: t.host, who: t.name, item: newest, alive: true,
				why: newest ? '' : 'chưa đẩy bài',
				extra: Math.max(0, sorted.length - 1)
			};
		});
		busy = false;
	}

	/**
	 * Đẩy workspace của mình lên MỘT máy, lấy luôn tên đội của máy đó làm tên bản.
	 *
	 * Không có ô "tên của bạn" nữa: mỗi máy đã gắn sẵn một người, nên tên suy ra
	 * được. Bớt một ô phải điền và bớt luôn cả lớp lỗi gõ nhầm tên người khác.
	 */
	async function push(r: Row) {
		const old = r.item;
		if (old && old.name === r.who) {
			if (!confirm(`Trên ${short(r.host)} đã có bản tên "${r.who}" (lưu lúc ${fmtWhen(old.saved_at)}).\n\nĐẩy lên sẽ ĐÈ MẤT bản đó.\n\nVẫn đẩy?`))
				return;
		} else if (old) {
			// Khác tên -> KHÔNG đè mà tạo bản thứ hai. Bản cũ vẫn nằm trên máy nhưng
			// danh sách chỉ hiện bản mới nhất nên nó khuất đi. Phải nói ra.
			if (!confirm(`Máy ${short(r.host)} đang có bản tên "${old.name}".\n\nĐẩy tên "${r.who}" sẽ tạo bản THỨ HAI, không đè lên bản cũ.\n\nVẫn đẩy?`))
				return;
		}

		busy = true;
		err = null;
		msg = null;
		try {
			const res = await wsPut(r.host, r.who, ws.toJSON());
			msg = `Đã đẩy "${r.who}" lên ${short(r.host)} (${fmtSize(res.size)}).`;
			await refresh();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function pull(r: Row) {
		if (!r.item) return;
		busy = true;
		err = null;
		try {
			onpull(await wsGet(r.host, r.item.name), r.item.name);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		refresh();
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm" onclick={onclose}>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[14px] border border-ink-800 bg-ink-900 p-5 shadow-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="mb-4 flex items-center justify-between border-b border-ink-800 pb-3">
			<div>
				<h3 class="text-[15px] font-semibold text-ink-50">Chia sẻ workspace</h3>
				<p class="text-[12px] text-ink-400">Đẩy bài lên máy của bạn, lấy bài của người khác về</p>
			</div>
			<div class="flex items-center gap-3">
				<button class="btn-secondary h-7 px-2.5 text-[11px]" onclick={refresh} disabled={busy}>
					Làm mới
				</button>
				<button class="cursor-pointer text-ink-500 hover:text-ink-100" onclick={onclose} title="Đóng">
					<HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.9} />
				</button>
			</div>
		</div>

		<div class="mb-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11.5px] text-warn">
			<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} class="mt-px shrink-0" />
			<span>
				Dữ liệu nằm ở <span class="font-mono">/kaggle/working</span>, MẤT khi phiên Kaggle kết thúc.
				Đây là chỗ trao đổi nhanh, không phải nơi lưu trữ - đẩy lên lại sau mỗi vài câu.
			</span>
		</div>

		{#if err}
			<p class="mb-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[12px] text-bad">{err}</p>
		{/if}
		{#if msg}
			<p class="mb-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-[12px] text-ok">{msg}</p>
		{/if}

		<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
			{#each rows as r (r.host)}
				{@const on = !!r.item}
				<div
					class="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors
					{r.alive ? 'border-ink-800 bg-ink-825' : 'border-ink-850 bg-ink-900 opacity-50'}"
				>
					<span class="w-12 shrink-0 font-mono text-[12.5px] {r.alive ? 'text-ink-100' : 'text-ink-500'}">
						{r.who}
					</span>
					<span class="flex-1 truncate font-mono text-[10.5px] text-ink-600">
						{short(r.host)}
						{#if r.extra}
							<span class="text-ink-700">· còn {r.extra} bản cũ</span>
						{/if}
					</span>

					{#if on}
						<span class="tabular text-[11px] text-ink-500">{fmtSize(r.item!.size)}</span>
						<span class="tabular text-[11px] text-ink-500">{fmtWhen(r.item!.saved_at)}</span>
					{:else}
						<span class="text-[11px] text-ink-600">{r.why}</span>
					{/if}

					<button
						class="btn-primary h-7 w-20 shrink-0 justify-center px-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!r.alive || busy}
						onclick={() => push(r)}
						title="Đẩy workspace của bạn lên máy này, đặt tên {r.who}"
					>
						Đẩy lên
					</button>
					<button
						class="btn-secondary h-7 w-20 shrink-0 justify-center px-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!on || busy}
						onclick={() => pull(r)}
					>
						Lấy về
					</button>
				</div>
			{/each}
		</div>
	</div>
</div>
