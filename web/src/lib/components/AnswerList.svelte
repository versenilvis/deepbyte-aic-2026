<script lang="ts">
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        ArrowUpDoubleIcon,
        Cancel01Icon,
        DragDropVerticalIcon,
        Alert02Icon,
    } from "@hugeicons/core-free-icons";
    import { imageUrl } from "$lib/api";
    import { ws } from "$lib/store.svelte";
	import { queuedImage } from '$lib/imgqueue';
    import {
        MAX_ANSWER_CHARS,
        MAX_ANSWERS,
        RANK_TIERS,
        validate,
        type Query,
    } from "$lib/types";

    let { query }: { query: Query } = $props();

    let dragFrom = $state<number | null>(null);
    let over = $state<number | null>(null);
    let errs = $derived(validate(query));

    function tierText(r: number) {
        return r === 1
            ? "text-rank-1"
            : r <= 5
              ? "text-rank-5"
              : r <= 20
                ? "text-rank-20"
                : "text-rank-far";
    }

    function drop(to: number) {
        if (dragFrom !== null) ws.move(query, dragFrom, to);
        dragFrom = over = null;
    }
</script>

<aside
    class="flex shrink-0 flex-col border-l border-ink-800 bg-ink-950"
    style="width: {ws.rightW}px">
    <div class="border-b border-ink-800 px-3 py-2.5">
        <div class="flex items-baseline justify-between">
            <h2
                class="text-xs font-semibold tracking-wide text-ink-300 uppercase">
                Sẽ nộp
            </h2>
            <span
                class="tabular text-xs {query.answers.length > MAX_ANSWERS
                    ? 'text-bad'
                    : 'text-ink-500'}">
                {query.answers.length}
                <span class="text-ink-700">/{MAX_ANSWERS}</span>
            </span>
        </div>

        <!-- thanh tiến độ theo các mốc ăn điểm -->
        <div class="mt-2 flex h-1 gap-px overflow-hidden rounded-full">
            {#each RANK_TIERS as t, i}
                {@const prev = i === 0 ? 0 : RANK_TIERS[i - 1]}
                {@const filled = Math.min(
                    Math.max(query.answers.length - prev, 0),
                    t - prev,
                )}
                <div class="flex-1 bg-ink-850" style="flex-grow: {t - prev}">
                    <div
                        class="h-full {i === 0
                            ? 'bg-rank-1'
                            : i === 1
                              ? 'bg-rank-5'
                              : 'bg-rank-20'}"
                        style="width: {(filled / (t - prev)) * 100}%">
                    </div>
                </div>
            {/each}
        </div>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-500">
            Thứ tự ở đây <span class="text-ink-300">chính là thứ hạng</span>
            . Kéo để đổi.
        </p>
    </div>

    {#if errs.length}
        <div class="flex gap-2 border-b border-bad/25 bg-bad/8 px-3 py-2">
            <HugeiconsIcon
                icon={Alert02Icon}
                size={14}
                strokeWidth={1.6}
                class="mt-px shrink-0 text-bad" />
            <div class="min-w-0">
                {#each errs.slice(0, 4) as e}
                    <p class="text-[11px] leading-relaxed text-bad/90">{e}</p>
                {/each}
            </div>
        </div>
    {/if}

    <div class="min-h-0 flex-1 overflow-y-auto">
        {#each query.answers as a, i (a.id)}
            {@const rank = i + 1}
            <div
                role="listitem"
                draggable="true"
                ondragstart={() => (dragFrom = i)}
                ondragover={(e) => {
                    e.preventDefault();
                    over = i;
                }}
                ondragleave={() => (over = null)}
                ondrop={() => drop(i)}
                class="group border-b border-ink-900 px-1.5 py-1.5 transition-colors
          {dragFrom === i ? 'opacity-30' : ''}
          {over === i && dragFrom !== i ? 'bg-ink-850' : 'hover:bg-ink-900'}">
                <div class="flex items-center gap-2">
                    <HugeiconsIcon
                        icon={DragDropVerticalIcon}
                        size={12}
                        strokeWidth={1.5}
                        class="shrink-0 cursor-grab text-ink-700 group-hover:text-ink-500" />

                    <span
                        class="tabular w-6 shrink-0 text-right text-base font-bold {tierText(
                            rank,
                        )}">
                        {rank}
                    </span>

                    <div class="flex min-w-0 flex-1 gap-1">
                        {#each a.frames as f (f.frame_id)}
                            <img
								use:queuedImage={imageUrl(f.video_id, f.keyframe_n, 256)}
                                alt=""
                                loading="lazy"
                                class="h-10 w-16 shrink-0 rounded border border-ink-800 bg-ink-900 object-cover" />
                        {/each}
                    </div>

                    <div
                        class="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <button
                            class="cursor-pointer rounded p-1 text-ink-500 hover:bg-ink-800 hover:text-rank-1"
                            title="Đẩy lên hạng 1"
                            onclick={() => ws.promote(query, i)}>
                            <HugeiconsIcon
                                icon={ArrowUpDoubleIcon}
                                size={16}
                                strokeWidth={1.9} />
                        </button>
                        <button
                            class="cursor-pointer rounded p-1 text-ink-500 hover:bg-ink-800 hover:text-bad"
                            title="Bỏ"
                            onclick={() => ws.removeAnswer(query, a.id)}>
                            <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={16}
                                strokeWidth={1.9} />
                        </button>
                    </div>
                </div>

                <div class="mt-1 pl-8">
                    <span class="truncate font-mono text-[11px] text-ink-500">
                        {a.frames[0]?.video_id} · {a.frames
                            .map((f) => f.frame_id)
                            .join(", ")}
                    </span>
                    {#if query.task === "qa"}
                        <input
                            class="field mt-1 py-1 text-xs {(a.text?.length ??
                                0) > MAX_ANSWER_CHARS
                                ? 'border-bad'
                                : ''}"
                            placeholder="answer (≤{MAX_ANSWER_CHARS} ký tự)"
                            bind:value={a.text}
                            onchange={() => ws.save()} />
                    {/if}
                </div>
            </div>
        {:else}
            <p
                class="px-6 py-12 text-center text-xs leading-relaxed text-ink-500">
                Chưa chọn đáp án nào.
                <br />
                Bấm ảnh bên trái, hoặc dùng
                <kbd class="rounded border border-ink-800 px-1">Space</kbd>
                .
            </p>
        {/each}
    </div>

    <div class="border-t border-ink-800 px-3 py-2">
        <p class="text-[11px] leading-relaxed text-ink-500">
            Điểm chỉ nhảy ở hạng <span class="text-rank-1">1</span>
            ,
            <span class="text-rank-5">5</span>
            ,
            <span class="text-rank-20">20</span>
            , 50, 100 - kéo một frame từ hạng 6 lên 5 đáng giá hơn từ 60 lên 40.
        </p>
    </div>
</aside>
