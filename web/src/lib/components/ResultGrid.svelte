<script lang="ts">
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        PlusSignIcon,
        Tick02Icon,
        Image01Icon,
    } from "@hugeicons/core-free-icons";
    import { fetchThumbs, imageUrl } from "$lib/api";
    import { ws } from "$lib/store.svelte";
	import { queuedImage } from '$lib/imgqueue';
    import type { Candidate, Query } from "$lib/types";

    let { query, onzoom }: { query: Query; onzoom: (c: Candidate) => void } =
        $props();

    let cols = $state(4);
    let cursor = $state(0);
    /** TRAKE: đang gom frame vào đáp án nào. null = tạo đáp án mới. */
    let target = $state<string | null>(null);
    let grid = $state<HTMLDivElement | null>(null);

    let thumbs = $state<Map<string, string>>(new Map());

    // Nạp TOÀN BỘ thumbnail trong MỘT request mỗi khi có kết quả mới.
    // Cloudflare giới hạn số request/giây nên 100 ảnh rời sẽ bị 429 hàng loạt.
    $effect(() => {
    	const list = query.candidates;
    	if (!list.length) {
    		thumbs = new Map();
    		return;
    	}
    	fetchThumbs(list).then((m: Map<string, string>) => (thumbs = m));
    });

    function rankOf(c: Candidate): number | null {
        const i = query.answers.findIndex((a) =>
            a.frames.some(
                (f) => f.video_id === c.video_id && f.frame_id === c.frame_id,
            ),
        );
        return i < 0 ? null : i + 1;
    }

    function toggle(c: Candidate) {
        const i = query.answers.findIndex((a) =>
            a.frames.some(
                (f) => f.video_id === c.video_id && f.frame_id === c.frame_id,
            ),
        );
        if (i >= 0) ws.removeAnswer(query, query.answers[i].id);
        else if (query.task === "trake" && target)
            ws.appendFrame(query, target, c);
        else ws.addAnswer(query, c);
    }

    function onKey(e: KeyboardEvent) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const n = query.candidates.length;
        if (!n) return;
        const move = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowDown: cols,
            ArrowUp: -cols,
        }[e.key];
        if (move !== undefined) {
            e.preventDefault();
            cursor = Math.max(0, Math.min(n - 1, cursor + move));
            grid?.querySelectorAll("[data-tile]")[cursor]?.scrollIntoView({
                block: "nearest",
            });
            return;
        }
        if (e.key === " ") {
            e.preventDefault();
            toggle(query.candidates[cursor]);
        } else if (e.key === "Enter") {
            e.preventDefault();
            onzoom(query.candidates[cursor]);
        }
    }

    function tierRing(rank: number): string {
        if (rank === 1) return "ring-2 ring-rank-1";
        if (rank <= 5) return "ring-2 ring-rank-5";
        if (rank <= 20) return "ring-2 ring-rank-20";
        return "ring-2 ring-rank-far";
    }
</script>

<svelte:window onkeydown={onKey} />

<!-- ── thanh công cụ ───────────────────────────────────────────── -->
<div class="flex items-center gap-4 border-b border-ink-800 px-4 py-2.5">
    <span class="text-xs font-semibold tracking-wide text-ink-300 uppercase">
        Kết quả
    </span>

    {#if query.task === "trake"}
        <select
            class="cursor-pointer rounded-md border border-ink-800 bg-ink-850 px-2.5 py-1.5 text-xs
        text-ink-200 hover:border-ink-700"
            bind:value={target}>
            <option value={null}>tạo đáp án mới</option>
            {#each query.answers as a, i (a.id)}
                <option value={a.id}>
                    gắn vào #{i + 1} ({a.frames.length}/{query.n_events})
                </option>
            {/each}
        </select>
    {/if}

    <div class="ml-auto flex items-center gap-5">
        <span
            class="hidden items-center gap-2.5 text-[11px] text-ink-500 xl:flex">
            <kbd>↑ ↓ ← →</kbd>
            di chuyển
            <kbd>Space</kbd>
            thêm
            <kbd>Enter</kbd>
             xem to
        </span>

        <label class="flex items-center gap-2 text-xs text-ink-500">
            <HugeiconsIcon icon={Image01Icon} size={15} strokeWidth={1.6} />
            <input
                type="range"
                min="3"
                max="10"
                bind:value={cols}
                class="w-24 cursor-pointer accent-ink-300" />
            <span class="tabular w-4 text-ink-300">{cols}</span>
        </label>
    </div>
</div>

<!-- ── lưới ────────────────────────────────────────────────────── -->
<div class="min-h-0 flex-1 overflow-y-auto p-3" bind:this={grid}>
    {#if ws.busy}
        <div
            class="grid gap-3"
            style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
            {#each Array(cols * 3) as _}
                <div class="aspect-video animate-pulse rounded-lg bg-ink-900">
                </div>
            {/each}
        </div>
    {:else if !query.candidates.length}
        <div class="flex flex-col items-center gap-3 py-24 text-ink-500">
            <HugeiconsIcon icon={Image01Icon} size={28} strokeWidth={1.3} />
            <p class="text-sm">Nhập mô tả rồi bấm Tìm kiếm</p>
        </div>
    {:else}
        <div
            class="grid gap-3"
            style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
            {#each query.candidates as c, i (`${i}-${c.video_id}-${c.frame_id}`)}
                {@const rank = rankOf(c)}
                <div
                    data-tile
                    class="group relative rounded-lg transition-all
            {i === cursor
                        ? 'ring-2 ring-ink-200 ring-offset-2 ring-offset-ink-950'
                        : ''}">
                    <!-- BẤM ẢNH = XEM TO -->
                    <button
                        class="block w-full cursor-zoom-in overflow-hidden rounded-lg ring-1 transition-all
              {rank ? tierRing(rank) : 'ring-ink-800 hover:ring-ink-600'}"
                        onclick={() => {
                            cursor = i;
                            onzoom(c);
                        }}
                        title="Bấm để xem to">
                        <img
							use:queuedImage={thumbs.get(c.video_id + '-' + c.keyframe_n) ?? imageUrl(c.video_id, c.keyframe_n)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            class="aspect-video w-full bg-ink-900 object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]" />
                    </button>

                    <!-- thứ hạng, nếu đã chọn -->
                    {#if rank}
                        <span
                            class="tabular pointer-events-none absolute top-2 left-2 flex h-7 min-w-7
                items-center justify-center rounded-md px-1.5 text-sm font-bold text-ink-950 shadow-lg
                {rank === 1
                                ? 'bg-rank-1'
                                : rank <= 5
                                  ? 'bg-rank-5'
                                  : 'bg-rank-20'}">
                            {rank}
                        </span>
                    {/if}

                    <!-- NÚT THÊM / BỎ - luôn hiện, đủ to để bấm nhanh -->
                    <button
                        class="absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center
              rounded-md shadow-lg backdrop-blur transition-colors
              {rank
                            ? 'bg-ok text-ink-950 hover:bg-bad hover:text-white'
                            : 'bg-ink-950/80 text-ink-200 hover:bg-ink-100 hover:text-ink-950'}"
                        title={rank
                            ? "Bỏ khỏi danh sách nộp"
                            : "Thêm vào danh sách nộp · Space"}
                        onclick={(e) => {
                            e.stopPropagation();
                            cursor = i;
                            toggle(c);
                        }}>
                        <HugeiconsIcon
                            icon={rank ? Tick02Icon : PlusSignIcon}
                            size={17}
                            strokeWidth={2.2} />
                    </button>

                    <div class="mt-1.5 flex items-baseline gap-2 px-0.5">
                        <span class="tabular text-[11px] text-ink-500">
                            #{c.rank}
                        </span>
                        <span
                            class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-300">
                            {c.video_id}
                        </span>
                        {#if c.score != null}
                            <span class="tabular text-[11px] text-ink-500">
                                {c.score.toFixed(3)}
                            </span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
