<script lang="ts">
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        PlusSignIcon,
        Tick02Icon,
        Image01Icon,
    } from "@hugeicons/core-free-icons";
    import { imageUrl } from "$lib/api";
    import { thumbs } from "$lib/thumbs.svelte";
    import { ws } from "$lib/store.svelte";
    import { scrub } from "$lib/scrub.svelte";
	import { queuedImage } from '$lib/imgqueue';
    import type { Candidate, Query } from "$lib/types";

    interface VideoGroup {
        videoId: string;
        candidates: Candidate[];
        maxScore: number | null;
        startIndex: number;
    }

    let { query, onzoom }: { query: Query; onzoom: (group: Candidate[]) => void } =
        $props();

    let cols = $state(4);
    let cursor = $state(0);
    let sortMode = $state<"rank" | "video">("rank");
    /** TRAKE: đang gom frame vào đáp án nào. null = tạo đáp án mới. */
    let target = $state<string | null>(null);
    let grid = $state<HTMLDivElement | null>(null);

    /** TRAKE hiện MỘT ô mỗi đáp án (ảnh = frame của action đầu), không rải phẳng n frame. */
    let shown = $derived.by(() => {
        const list = query.candidates;
        if (!list.length || list[0].group == null) return list;
        const seen = new Set<number>();
        return list.filter((c) => (seen.has(c.group!) ? false : (seen.add(c.group!), true)));
    });

    let groups = $derived.by<VideoGroup[]>(() => {
        if (sortMode !== "video") return [];

        // gom ung vien cung video_id lai voi nhau, giu nguyen thu tu xuat hien goc
        const groupMap = new Map<string, Candidate[]>();
        for (const c of shown) {
            let list = groupMap.get(c.video_id);
            if (!list) {
                list = [];
                groupMap.set(c.video_id, list);
            }
            list.push(c);
        }

        const res: { videoId: string; candidates: Candidate[]; maxScore: number | null; firstRank: number }[] = [];
        for (const [videoId, candidates] of groupMap.entries()) {
            let max: number | null = null;
            for (const c of candidates) {
                if (c.score != null && !Number.isNaN(c.score)) {
                    if (max == null || c.score > max) {
                        max = c.score;
                    }
                }
            }
            res.push({
                videoId,
                candidates,
                maxScore: max,
                firstRank: candidates[0]?.rank ?? 0,
            });
        }

        // xep video co diem cao nhat len dau, neu bang diem thi giu nguyen thu tu xuat hien goc
        res.sort((a, b) => {
            if (a.maxScore != null && b.maxScore != null) {
                if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
                return a.firstRank - b.firstRank;
            }
            if (a.maxScore != null) return -1;
            if (b.maxScore != null) return 1;
            return a.firstRank - b.firstRank;
        });

        // tinh chi muc bat dau cua tung nhom de dieu huong phim tat xuyen suot toan bo ket qua
        let offset = 0;
        return res.map((g) => {
            const item: VideoGroup = {
                videoId: g.videoId,
                candidates: g.candidates,
                maxScore: g.maxScore,
                startIndex: offset,
            };
            offset += g.candidates.length;
            return item;
        });
    });

    let displayList = $derived.by<Candidate[]>(() => {
        if (sortMode === "video") {
            return groups.flatMap((g) => g.candidates);
        }
        return shown;
    });

    // Xếp hàng thumbnail vào kho dùng chung. Kho tự chia lô và giới hạn tần suất;
    // ở đây chỉ nói "cần những ảnh này", không tự bắn request nào.
    $effect(() => {
    	if (query.candidates.length) thumbs.want(query.candidates);
    });

    // tranh truong hop cursor vuot qua do dai danh sach khi doi che do hoac doi truy van
    $effect(() => {
        if (displayList.length && cursor >= displayList.length) {
            cursor = 0;
        }
    });

    /** Ảnh của một ô, hoặc null khi chưa có. Null -> chỉ hiện ô giữ chỗ, KHÔNG gọi mạng. */
    function src(c: Candidate): string | null {
        return (
            thumbs.get(c.video_id, c.keyframe_n) ??
            (thumbs.legacy ? imageUrl(c.video_id, c.keyframe_n) : null)
        );
    }

    /** TRAKE: các candidate cùng `group` hợp thành MỘT đáp án, đúng thứ tự action. */
    function groupOf(c: Candidate): Candidate[] {
        if (c.group == null) return [c];
        return query.candidates.filter((x) => x.group === c.group);
    }

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
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (scrub.active) return; // clip 5s đang mở, mũi tên để đi từng frame
        const n = displayList.length;
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
            if (displayList[cursor]) toggle(displayList[cursor]);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (displayList[cursor]) onzoom(groupOf(displayList[cursor]));
        }
    }

    /** Ring HƯỚNG VÀO TRONG: viền không ăn thêm chỗ nên lưới không xô nhau khi chọn. */
    function tierRing(rank: number): string {
        if (rank === 1) return "ring-2 ring-inset ring-rank-1";
        if (rank <= 5) return "ring-2 ring-inset ring-rank-5";
        if (rank <= 20) return "ring-2 ring-inset ring-rank-20";
        return "ring-2 ring-inset ring-rank-far";
    }
</script>

<svelte:window onkeydown={onKey} />

<!-- ── thanh công cụ ───────────────────────────────────────────── -->
<div class="flex items-center gap-4 border-b border-ink-800 px-4 py-2.5">
    <span class="label-xs">Kết quả</span>

    <div class="flex items-center rounded-lg border border-ink-800 bg-ink-825 p-0.5 text-xs">
        <button
            type="button"
            class="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors {sortMode === 'rank'
                ? 'bg-ink-800 text-ink-100 shadow-sm'
                : 'text-ink-400 hover:text-ink-200'}"
            onclick={() => (sortMode = "rank")}>
            theo hạng
        </button>
        <button
            type="button"
            class="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors {sortMode === 'video'
                ? 'bg-ink-800 text-ink-100 shadow-sm'
                : 'text-ink-400 hover:text-ink-200'}"
            onclick={() => (sortMode = "video")}>
            gom theo video
        </button>
    </div>

    {#if query.task === "trake"}
        <select
            class="cursor-pointer rounded-lg border border-ink-800 bg-ink-825 px-2.5 py-1.5 text-xs
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
                class="w-24 cursor-pointer accent-brand" />
            <span class="tabular w-4 text-ink-300">{cols}</span>
        </label>
    </div>
</div>

{#snippet tile(c: Candidate, i: number)}
    {@const rank = rankOf(c)}
    <div
        data-tile
        class="group relative rounded-lg transition-all
        {i === cursor
            ? 'ring-2 ring-brand ring-offset-2 ring-offset-ink-950'
            : ''}">
        <!-- BẤM ẢNH = XEM TO -->
        <button
            class="ph ph-{c.keyframe_n % 8} block w-full cursor-zoom-in overflow-hidden rounded-lg ring-1 ring-inset transition-all
            {rank ? tierRing(rank) : 'ring-ink-800 hover:ring-ink-700'}"
            onclick={() => {
                cursor = i;
                onzoom(groupOf(c));
            }}
            title="Bấm để xem to">
            <!-- CHƯA có ảnh thì KHÔNG dựng <img>. Bản cũ rơi về /image ngay lúc
                 batch còn đang bay -> 101 request một lúc -> rate limiter giết
                 luôn cả batch. Ô giữ chỗ .ph-N lo phần hình trong lúc chờ. -->
            {#if src(c)}
                <img
                    use:queuedImage={src(c)!}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="thumb aspect-video w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]" />
            {:else}
                <div class="aspect-video w-full"></div>
            {/if}
        </button>

        <!-- thứ hạng, nếu đã chọn -->
        {#if rank}
            <span
                class="tabular pointer-events-none absolute top-1.5 left-1.5 flex h-[22px] min-w-[22px]
                items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold text-ink-950 shadow-lg
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
            class="absolute top-1.5 right-1.5 flex size-[26px] cursor-pointer items-center justify-center
            rounded-lg shadow-lg backdrop-blur transition-colors
            {rank
                ? 'bg-ok text-ink-950 hover:bg-bad'
                : 'bg-ink-950/78 text-ink-200 hover:bg-brand hover:text-ink-950'}"
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
                size={15}
                strokeWidth={2.3} />
        </button>

        <div class="mt-1.5 flex items-baseline gap-2 px-0.5">
            <span class="tabular text-[11px] text-ink-500">
                #{c.rank}
            </span>
            <span
                class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-300">
                {c.video_id}
            </span>
            <!-- Task 1/2 co hai diem: base (khung nay khop den dau) va
                 chain (video nay khop den dau). Task 3 chi co chain. -->
            {#if c.base_score != null}
                <span class="tabular text-[11px] text-ink-500" title="Base score">
                    b{c.base_score.toFixed(2)}
                </span>
            {/if}
            {#if c.chain_score != null}
                <span class="tabular text-[11px] text-ink-400" title="Chain score">
                    c{c.chain_score.toFixed(2)}
                </span>
            {:else if c.score != null}
                <span class="tabular text-[11px] text-ink-500">
                    {c.score.toFixed(3)}
                </span>
            {/if}
        </div>
    </div>
{/snippet}

<!-- ── lưới ────────────────────────────────────────────────────── -->
<div class="min-h-0 flex-1 overflow-y-auto p-3" bind:this={grid}>
    {#if ws.busy}
        <div
            class="grid gap-3"
            style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
            {#each Array(cols * 3) as _, _i}
                <div class="ph ph-{_i % 8} aspect-video animate-pulse rounded-lg opacity-60">
                </div>
            {/each}
        </div>
    {:else if !query.candidates.length}
        <div class="flex flex-col items-center gap-3 py-24 text-ink-500">
            <HugeiconsIcon icon={Image01Icon} size={28} strokeWidth={1.3} />
            <p class="text-sm">Nhập mô tả rồi bấm Tìm kiếm</p>
        </div>
    {:else if sortMode === "video"}
        <div class="flex flex-col gap-5">
            {#each groups as g (g.videoId)}
                <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2 px-1 text-xs text-ink-400">
                        <span class="font-mono font-medium text-ink-200">{g.videoId}</span>
                        <span class="text-ink-600">·</span>
                        <span>{g.candidates.length} frame</span>
                        {#if g.maxScore != null}
                            <span class="text-ink-600">·</span>
                            <span>cao nhất {g.maxScore.toFixed(3)}</span>
                        {/if}
                    </div>

                    <div
                        class="grid gap-3"
                        style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
                        {#each g.candidates as c, j (`${g.videoId}-${j}-${c.frame_id}`)}
                            {@const i = g.startIndex + j}
                            {@render tile(c, i)}
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <div
            class="grid gap-3"
            style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
            {#each displayList as c, i (`${i}-${c.video_id}-${c.frame_id}`)}
                {@render tile(c, i)}
            {/each}
        </div>
    {/if}
</div>

