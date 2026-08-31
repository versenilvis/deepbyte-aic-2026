<script lang="ts">
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        ArrowUpDoubleIcon,
        Cancel01Icon,
        DragDropVerticalIcon,
        Alert02Icon,
    } from "@hugeicons/core-free-icons";
    import { frameUrl, imageUrl } from "$lib/api";
    import { ws } from "$lib/store.svelte";
    import {
        MAX_ANSWER_CHARS,
        MAX_ANSWERS,
        RANK_TIERS,
        validate,
        type Answer,
        type Candidate,
        type FrameRef,
        type Query,
    } from "$lib/types";

    let {
        query,
        onzoom,
    }: {
        query: Query;
        onzoom?: (group: Candidate[]) => void;
    } = $props();

    // Ảnh của đáp án đi chung kho với lưới kết quả: cùng cỡ w=384 nên phần lớn đã
    // nằm sẵn trong cache từ lúc tìm kiếm. Nạp workspace 100 đáp án cũng chỉ tốn vài
    // request chia lô, thay vì 100 request lẻ bị 429 gần một nửa.
    /**
     * Ảnh của ĐÚNG frame trong đáp án.
     *
     * Trước đây lấy theo `keyframe_n` nên sau khi rà thanh tua sang frame khác,
     * ảnh vẫn là keyframe cũ - nhìn một đằng nộp một nẻo. Đây là những frame THẬT
     * SỰ đem nộp nên phải đúng, chấp nhận backend chạy ffmpeg chậm hơn.
     */
    function src(f: { video_id: string; frame_id: number }): string {
        return frameUrl(f.video_id, f.frame_id, 256);
    }

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

    function zoomAnswer(a: Answer, activeFrame?: FrameRef) {
        if (!onzoom) return;
        if (query.task === "trake" && a.frames.length > 1) {
            const items: Candidate[] = a.frames.map((f) => {
                const matched = query.candidates.find(
                    (c) => c.video_id === f.video_id && c.frame_id === f.frame_id
                );
                if (matched) return matched;
                return {
                    rank: 0,
                    group: 0,
                    video_id: f.video_id,
                    frame_id: f.frame_id,
                    keyframe_n: f.keyframe_n,
                    pts_time: f.pts_time,
                    fps: f.fps ?? 25,
                    image: `/image?video_id=${f.video_id}&n=${f.keyframe_n}`,
                    caption: "",
                    speech: "",
                    ocr: "",
                };
            });
            onzoom(items);
        } else {
            const target = activeFrame ?? a.frames[0];
            if (!target) return;
            const matched = query.candidates.find(
                (c) => c.video_id === target.video_id && c.frame_id === target.frame_id
            );
            const item: Candidate = matched ?? {
                rank: 0,
                video_id: target.video_id,
                frame_id: target.frame_id,
                keyframe_n: target.keyframe_n,
                pts_time: target.pts_time,
                fps: target.fps ?? 25,
                image: `/image?video_id=${target.video_id}&n=${target.keyframe_n}`,
                caption: "",
                speech: "",
                ocr: "",
            };
            onzoom([item]);
        }
    }
</script>

<aside
    class="flex shrink-0 flex-col border-l border-ink-800 bg-ink-925"
    style="width: {ws.rightW}px">
    <div class="border-b border-ink-800 px-3 py-2.5">
        <div class="flex items-baseline justify-between">
            <h2 class="label-xs">Sẽ nộp</h2>
            <span
                class="tabular text-xs {query.answers.length > MAX_ANSWERS
                    ? 'text-bad'
                    : 'text-ink-500'}">
                <span class="text-ink-200">{query.answers.length}</span>
                <span class="text-ink-700">/{MAX_ANSWERS}</span>
            </span>
        </div>

        <!-- thanh tiến độ theo các mốc ăn điểm -->
        <div class="mt-2.5 flex h-1 gap-0.5 overflow-hidden rounded-full">
            {#each RANK_TIERS as t, i}
                {@const prev = i === 0 ? 0 : RANK_TIERS[i - 1]}
                {@const filled = Math.min(
                    Math.max(query.answers.length - prev, 0),
                    t - prev,
                )}
                <div class="flex-1 bg-ink-800" style="flex-grow: {t - prev}">
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
        <p class="mt-2 text-[10.5px] leading-relaxed text-ink-500">
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
                class="group border-b border-ink-900 px-2 py-2 transition-colors
          {dragFrom === i ? 'opacity-30' : ''}
          {over === i && dragFrom !== i ? 'bg-ink-850' : 'hover:bg-ink-900'}">
                <!-- Hàng 1: hạng + mã frame + nút.
                     TRAKE có tới n ảnh trên một đáp án; để nút chung hàng với ảnh thì
                     ảnh đẩy nút văng khỏi rail. Nút lên góc phải trên, ảnh xuống hàng dưới. -->
                <div class="flex items-center gap-2">
                    <HugeiconsIcon
                        icon={DragDropVerticalIcon}
                        size={12}
                        strokeWidth={1.5}
                        class="shrink-0 cursor-grab text-ink-700 group-hover:text-ink-500" />

                    <span
                        class="tabular w-5 shrink-0 text-right text-[15px] leading-none font-bold {tierText(
                            rank,
                        )}">
                        {rank}
                    </span>

                    <span
                        class="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-500">
                        {a.frames[0]?.video_id}
                        <span class="text-ink-700">·</span>
                        <span class="tabular text-ink-400">
                            {a.frames.map((f) => f.frame_id).join(", ")}
                        </span>
                    </span>

                    <div class="flex shrink-0 gap-0.5">
                        <button
                            class="cursor-pointer rounded-md p-1 text-ink-600 transition-colors hover:bg-ink-800 hover:text-rank-1"
                            title="Đẩy lên hạng 1"
                            onclick={() => ws.promote(query, i)}>
                            <HugeiconsIcon
                                icon={ArrowUpDoubleIcon}
                                size={15}
                                strokeWidth={1.9} />
                        </button>
                        <button
                            class="cursor-pointer rounded-md p-1 text-ink-600 transition-colors hover:bg-bad/12 hover:text-bad"
                            title="Bỏ khỏi danh sách nộp"
                            onclick={() => ws.removeAnswer(query, a.id)}>
                            <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={15}
                                strokeWidth={1.9} />
                        </button>
                    </div>
                </div>

                <!-- Hàng 2: ảnh. Mỗi ảnh co lại khi có nhiều frame, nhưng không phình
                     to quá 64px khi chỉ có một - w-16 vừa là trần vừa là cỡ mặc định. -->
                <div class="mt-1.5 flex gap-1 overflow-hidden pl-[26px]">
                    {#each a.frames as f (f.frame_id)}
                        <button
                            type="button"
                            onclick={() => zoomAnswer(a, f)}
                            title="Bấm để xem phóng to · clip 5s · video gốc"
                            class="ph ph-{f.keyframe_n % 8} group/thumb relative h-10 w-16 min-w-0 shrink cursor-pointer overflow-hidden rounded-[5px] border border-ink-800 transition-all hover:border-brand hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-brand">
                            <!-- Ảnh thẳng, KHÔNG qua hàng đợi: danh sách đáp án ngắn nên
                                 không có nguy cơ dồn request như lưới 100 ô, mà đi thẳng
                                 thì mới gắn được `onerror` để rơi về ảnh keyframe. -->
                            <img
                                src={src(f)}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onerror={(e) => {
                                    // Backend cũ chưa có /frame -> 404. Rơi về ảnh keyframe,
                                    // lệch vài frame còn hơn để ô trống.
                                    const el = e.currentTarget as HTMLImageElement;
                                    const fb = imageUrl(f.video_id, f.keyframe_n, 256);
                                    if (el.src !== fb) el.src = fb;
                                }}
                                onload={(e) => e.currentTarget.classList.add('is-loaded')}
                                class="thumb size-full object-cover transition-transform group-hover/thumb:scale-105" />
                        </button>
                    {/each}
                </div>

                {#if query.task === "qa"}
                    <input
                        class="field mt-1.5 ml-[26px] w-[calc(100%-26px)] py-1 text-xs {(a.text
                            ?.length ?? 0) > MAX_ANSWER_CHARS
                            ? 'border-bad'
                            : ''}"
                        placeholder="answer (≤{MAX_ANSWER_CHARS} ký tự)"
                        bind:value={a.text}
                        onchange={() => ws.save()} />
                {/if}
            </div>
        {:else}
            <p
                class="px-6 py-12 text-center text-xs leading-relaxed text-ink-500">
                Chưa chọn đáp án nào.
                <br />
                Bấm ảnh bên trái, hoặc dùng
                <kbd>Space</kbd>
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
