<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Alert02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
	import { getHubs, getWho, nameOfHub, setHubs, setWho, wsGet, wsList, wsPut, type WsItem } from '$lib/api';
	import { ws } from '$lib/store.svelte';

	interface Props {
		/** Nhận về chuỗi JSON đã tải, để trang cha mở bảng chọn câu. */
		onpull: (text: string, name: string) => void;
		onclose: () => void;
	}

	let { onpull, onclose }: Props = $props();

	/** Mỗi dòng kèm hub đã lấy nó về - hai người có thể trùng tên ở hai máy khác nhau. */
	type Row = WsItem & { hub: string };

	// Chưa lưu hub nào thì bắt đầu bằng backend hiện tại, ít nhất có một cái để bấm.
	const initialHubs = getHubs();
	let hubs = $state<string[]>(initialHubs);
	/** Hub sẽ ĐẨY LÊN. Đọc thì đọc hết, nhưng ghi chỉ ghi vào đúng một máy. */
	let pushTo = $state(initialHubs[0] ?? '');
	let who = $state(getWho() || nameOfHub(initialHubs[0] ?? ''));

	/** Chọn máy nào thì điền luôn tên chủ máy đó - chọn máy mình là xong, khỏi gõ. */
	function selectHub(h: string) {
		pushTo = h;
		const n = nameOfHub(h);
		if (n) who = n;
	}
	let adding = $state(false);
	let newHub = $state('');

	let rows = $state<Row[]>([]);
	let busy = $state(false);
	let msg = $state<string | null>(null);
	let err = $state<string | null>(null);
	/** Hub nào hỏi không được - hiện riêng, đừng để nó chặn các hub còn sống. */
	let dead = $state<string[]>([]);

	const fmtSize = (n: number) =>
		n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

	const fmtWhen = (sec: number) =>
		new Date(sec * 1000).toLocaleString('vi-VN', {
			hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
		});

	const short = (h: string) => h.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

	/** Hỏi TẤT CẢ hub song song. Một máy chết không được làm hỏng phần còn lại. */
	async function refresh() {
		busy = true;
		err = null;
		const results = await Promise.allSettled(hubs.map((h) => wsList(h)));
		const out: Row[] = [];
		const bad: string[] = [];
		results.forEach((r, i) => {
			if (r.status === 'fulfilled') out.push(...r.value.items.map((it) => ({ ...it, hub: hubs[i] })));
			else bad.push(hubs[i]);
		});
		out.sort((a, b) => b.saved_at - a.saved_at);
		rows = out;
		dead = bad;
		busy = false;
	}

	function addHub() {
		const h = newHub.trim().replace(/\/+$/, '');
		if (!h) return;
		hubs = [...new Set([...hubs, h])];
		setHubs(hubs);
		newHub = '';
		adding = false;
		refresh();
	}

	function removeHub(h: string) {
		hubs = hubs.filter((x) => x !== h);
		setHubs(hubs);
		if (pushTo === h) pushTo = hubs[0] ?? '';
		refresh();
	}

	async function push() {
		const name = who.trim();
		if (!name) return (err = 'Nhập tên của bạn trước - nó là tên bản trên hub.');
		if (!pushTo) return (err = 'Chưa chọn máy để đẩy lên.');

		// Hai người lỡ dùng chung một tên thì cú đẩy sau đè mất cú trước, không báo gì.
		const old = rows.find((r) => r.name === name && r.hub === pushTo);
		if (old && !confirm(`Trên ${short(pushTo)} đã có bản tên "${name}" (lưu lúc ${fmtWhen(old.saved_at)}).\n\nĐẩy lên sẽ ĐÈ MẤT bản đó. Nếu đó là của người khác, hãy đổi tên rồi thử lại.\n\nVẫn đẩy?`))
			return;

		busy = true;
		err = null;
		msg = null;
		try {
			setWho(name);
			const r = await wsPut(pushTo, name, ws.toJSON());
			msg = `Đã đẩy "${name}" lên ${short(pushTo)} (${fmtSize(r.size)}).`;
			await refresh();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function pull(r: Row) {
		busy = true;
		err = null;
		try {
			onpull(await wsGet(r.hub, r.name), r.name);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		if (hubs.length) refresh();
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm" onclick={onclose}>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[14px] border border-ink-800 bg-ink-900 p-5 shadow-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="mb-3 flex items-center justify-between border-b border-ink-800 pb-3">
			<div>
				<h3 class="text-[15px] font-semibold text-ink-50">Chia sẻ workspace</h3>
				<p class="text-[12px] text-ink-400">Đẩy bài lên máy của bạn, xem bài cả đội từ mọi máy</p>
			</div>
			<button class="cursor-pointer text-ink-500 hover:text-ink-100" onclick={onclose} title="Đóng">
				<HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.9} />
			</button>
		</div>

		<!-- Danh sách máy. Bấm để chọn nơi ĐẨY LÊN; phần đọc thì luôn hỏi hết. -->
		<div class="mb-2.5">
			<p class="mb-1.5 text-[11px] text-ink-500">Máy của đội - bấm để chọn nơi đẩy lên</p>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each hubs as h (h)}
					<span
						class="flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors
						{pushTo === h ? 'border-brand/60 bg-brand/12 text-brand' : 'border-ink-800 bg-ink-825 text-ink-300'}
						{dead.includes(h) ? 'opacity-50' : ''}"
					>
						<button class="cursor-pointer" onclick={() => selectHub(h)}>
							{nameOfHub(h) || short(h)}
						</button>
						<button class="cursor-pointer text-ink-600 hover:text-bad" onclick={() => removeHub(h)} title="Bỏ máy này">
							<HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2.2} />
						</button>
					</span>
				{/each}

				{#if adding}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="field h-7 w-56 font-mono text-[11px]"
						placeholder="https://lmh.verse.id.vn"
						autofocus
						bind:value={newHub}
						onkeydown={(e) => e.key === 'Enter' && addHub()}
						onblur={addHub}
					/>
				{:else}
					<button
						class="flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:border-ink-600 hover:text-ink-200"
						onclick={() => (adding = true)}
					>
						<HugeiconsIcon icon={PlusSignIcon} size={11} strokeWidth={2.2} />
						Thêm máy
					</button>
				{/if}
			</div>
		</div>

		<div class="mb-2.5 flex items-end gap-2">
			<label class="flex w-40 flex-col gap-1">
				<span class="text-[11px] text-ink-500">Tên của bạn</span>
				<input class="field h-8 font-mono text-xs" placeholder="A" bind:value={who} />
			</label>
			<button class="btn-primary h-8 px-4 text-xs" onclick={push} disabled={busy}>
				Đẩy lên {pushTo ? short(pushTo) : ''}
			</button>
			<button class="btn-secondary h-8 px-3 text-xs" onclick={refresh} disabled={busy}>Làm mới</button>
		</div>

		<div class="mb-2.5 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11.5px] text-warn">
			<HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} class="mt-px shrink-0" />
			<span>
				Dữ liệu trên hub nằm ở <span class="font-mono">/kaggle/working</span>, MẤT khi phiên Kaggle
				kết thúc. Đây là chỗ trao đổi nhanh, không phải nơi lưu trữ - đẩy lên lại sau mỗi vài câu.
			</span>
		</div>

		{#if dead.length}
			<p class="mb-2 rounded-lg border border-ink-800 bg-ink-825 px-3 py-1.5 text-[11px] text-ink-500">
				Không hỏi được: {dead.map(short).join(', ')} - máy tắt hoặc sai địa chỉ
			</p>
		{/if}
		{#if err}
			<p class="mb-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[12px] text-bad">{err}</p>
		{/if}
		{#if msg}
			<p class="mb-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-[12px] text-ok">{msg}</p>
		{/if}

		<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
			{#if !rows.length}
				<p class="py-8 text-center text-xs text-ink-500">
					{busy ? 'Đang tải...' : 'Chưa máy nào có workspace'}
				</p>
			{:else}
				{#each rows as r (r.hub + '/' + r.name)}
					<div class="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-825 px-3 py-2">
						<span class="flex-1 truncate font-mono text-[12.5px] text-ink-100">{r.name}</span>
						<span class="truncate font-mono text-[10.5px] text-ink-600">{short(r.hub)}</span>
						<span class="tabular text-[11px] text-ink-500">{fmtSize(r.size)}</span>
						<span class="tabular text-[11px] text-ink-500">{fmtWhen(r.saved_at)}</span>
						<button class="btn-secondary h-7 px-2.5 text-[11px]" onclick={() => pull(r)} disabled={busy}>
							Lấy về
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
