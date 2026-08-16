<script lang="ts">
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        PlusSignIcon,
        Alert02Icon,
        CheckmarkCircle02Icon,
        Delete02Icon,
        Copy01Icon,
        ArrowDown01Icon,
        Cancel01Icon,
    } from "@hugeicons/core-free-icons";
    import { ws } from "$lib/store.svelte";
    import { validate, type Task } from "$lib/types";

    let draft = $state("");
    let bulk = $state("");
    let showBulk = $state(false);
    let renaming = $state<string | null>(null);
    let renameTo = $state("");

    const TASKS: Task[] = ["kis", "qa", "trake"];
    const taskStyle: Record<string, string> = {
        kis: "border-task-kis/40 text-task-kis",
        qa: "border-task-qa/40 text-task-qa",
        trake: "border-task-trake/40 text-task-trake",
    };

    let done = $derived(
        ws.queries.filter((q) => q.answers.length && !validate(q).length)
            .length,
    );

    /** Số thứ tự kế tiếp, suy từ các query đã có -> khỏi phải nhớ đang tới đâu. */
    let nextIdx = $derived.by(() => {
        const ns = ws.queries
            .map((q) => Number(q.id.match(/query-(\d+)-/)?.[1]))
            .filter((n) => Number.isFinite(n));
        return (ns.length ? Math.max(...ns) : 0) + 1;
    });

    function add() {
        if (ws.addQuery(draft)) draft = "";
    }

    /** Bấm chip loại -> điền luôn `query-<số kế tiếp>-<loại>`, không phải gõ. */
    function quick(t: Task) {
        const base = draft.trim() || `query-${nextIdx}`;
        draft = base.replace(/-(kis|qa|trake)$/, "") + "-" + t;
        add();
    }

    function addBulk() {
        const names = bulk
            .split(/[\n,]/)
            .map((s) => s.trim().replace(/\.txt$/i, ""))
            .filter(Boolean);
        let ok = 0;
        for (const n of names) if (ws.addQuery(n)) ok++;
        bulk = "";
        showBulk = false;
        if (ok < names.length)
            ws.error = `Thêm được ${ok}/${names.length} - phần còn lại trùng tên hoặc sai hậu tố.`;
    }

    function del(id: string, n: number) {
        if (n && !confirm(`Xoá "${id}"? Đang có ${n} đáp án đã chọn.`)) return;
        ws.removeQuery(id);
    }

    function dup(id: string) {
        const src = ws.queries.find((q) => q.id === id);
        if (!src) return;
        const m = id.match(/^(.*?)(\d+)(-\w+)$/);
        const nid = m ? `${m[1]}${nextIdx}${m[3]}` : `${id}-copy`;
        if (ws.addQuery(nid)) {
            const q = ws.queries.find((x) => x.id === nid)!;
            q.brief = src.brief;
            q.prompt = structuredClone($state.snapshot(src.prompt));
            q.weights = {
                ...(src.weights ?? { visual: 1, speech: 1, ocr: 1 }),
            };
            ws.save();
        }
    }

    function commitRename(old: string) {
        const to = renameTo.trim();
        renaming = null;
        if (!to || to === old) return;
        const q = ws.queries.find((x) => x.id === old);
        if (!q || ws.queries.some((x) => x.id === to)) return;
        try {
            q.task = to.split("-").pop() as Task;
            q.id = to;
            if (ws.activeId === old) ws.activeId = to;
            ws.save();
        } catch {
            ws.error = "Tên phải kết thúc bằng -kis, -qa hoặc -trake";
        }
    }
</script>

<aside
    class="flex shrink-0 flex-col border-r border-ink-800 bg-ink-950"
    style="width: {ws.leftW}px">
    <!-- ── thêm truy vấn ─────────────────────────────────────────── -->
    <div class="border-b border-ink-800 p-2.5">
        <div class="mb-2 flex items-baseline justify-between">
            <h2
                class="text-xs font-semibold tracking-wide text-ink-300 uppercase">
                Truy vấn
            </h2>
            {#if ws.queries.length}
                <span
                    class="tabular text-xs text-ink-500"
                    title="{done} query đã có đáp án hợp lệ">
                    <span class={done ? "text-ok" : ""}>{done}</span>
                    <span class="text-ink-700">/{ws.queries.length}</span>
                </span>
            {/if}
        </div>

        <div class="flex gap-1.5">
            <input
                class="field py-1.5 font-mono text-[13px]"
                placeholder="query-{nextIdx}-kis"
                bind:value={draft}
                onkeydown={(e) => e.key === "Enter" && add()} />
            <button
                class="cursor-pointer btn-secondary px-2"
                onclick={add}
                disabled={!draft.trim()}
                title="Thêm">
                <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
            </button>
        </div>

        <!-- chip loại: bấm là tự đặt tên query-<số kế tiếp>-<loại> -->
        <div class="mt-1.5 flex gap-1">
            {#each TASKS as t}
                <button
                    class="cursor-pointer btn flex-1 border px-1 py-1 text-[11px] uppercase {taskStyle[
                        t
                    ]} hover:bg-ink-850"
                    onclick={() => quick(t)}
                    title="Thêm nhanh query-{nextIdx}-{t}">
                    {t}
                </button>
            {/each}
        </div>

        <button
            class="cursor-pointer btn-ghost mt-2 w-full justify-between px-1.5 py-1.5 text-[11px]"
            onclick={() => (showBulk = !showBulk)}>
            <span>Dán nhiều dòng</span>
            <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={1.8}
                class="transition-transform {showBulk ? 'rotate-180' : ''}" />
        </button>

        {#if showBulk}
            <textarea
                class="field mt-1.5 h-24 resize-none font-mono text-[11px]"
                placeholder={"query-1-kis\nquery-2-qa\nquery-3-trake"}
                bind:value={bulk}>
            </textarea>
            <button
                class="cursor-pointer btn-primary mt-1.5 w-full py-1"
                onclick={addBulk}
                disabled={!bulk.trim()}>
                Thêm {bulk.split(/[\n,]/).filter((s) => s.trim()).length} truy vấn
            </button>
            <p class="mt-1 text-[10px] leading-relaxed text-ink-500">
                Dán thẳng danh sách file BTC phát. Đuôi <span class="font-mono">
                    .txt
                </span>
                 tự bỏ.
            </p>
        {/if}
    </div>

    <!-- ── danh sách ─────────────────────────────────────────────── -->
    <div class="min-h-0 flex-1 overflow-y-auto">
        {#each ws.queries as q (q.id)}
            {@const errs = validate(q)}
            {@const active = q.id === ws.activeId}
            <div
                class="group flex items-center gap-1.5 border-l-2 pr-1 pl-2 transition-colors
          {active
                    ? 'border-ink-100 bg-ink-900'
                    : 'border-transparent hover:border-ink-700 hover:bg-ink-900/60'}">
                {#if renaming === q.id}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                        class="field my-1 py-1 font-mono text-[11px]"
                        bind:value={renameTo}
                        autofocus
                        onblur={() => commitRename(q.id)}
                        onkeydown={(e) => {
                            if (e.key === "Enter") commitRename(q.id);
                            if (e.key === "Escape") renaming = null;
                        }} />
                {:else}
                    <button
                        class="cursor-pointer flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                        onclick={() => (ws.activeId = q.id)}
                        ondblclick={() => {
                            renaming = q.id;
                            renameTo = q.id;
                        }}
                        title="Bấm để mở · bấm đúp để đổi tên">
                        <span
                            class="shrink-0 rounded border px-1 py-px text-[10px] font-semibold uppercase {taskStyle[
                                q.task
                            ]}">
                            {q.task}
                        </span>
                        <span
                            class="min-w-0 flex-1 truncate font-mono text-xs text-ink-200">
                            {q.id}
                        </span>

                        {#if errs.length}
                            <HugeiconsIcon
                                icon={Alert02Icon}
                                size={12}
                                strokeWidth={1.8}
                                class="shrink-0 text-bad" />
                        {:else if q.answers.length}
                            <span
                                class="tabular flex shrink-0 items-center gap-0.5 text-[10px] text-ink-500">
                                {q.answers.length}
                                <HugeiconsIcon
                                    icon={CheckmarkCircle02Icon}
                                    size={11}
                                    strokeWidth={1.8}
                                    class="text-ok" />
                            </span>
                        {/if}
                    </button>

                    <div
                        class="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <button
                            class="cursor-pointer rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                            title="Nhân bản (giữ mô tả và trọng số)"
                            onclick={() => dup(q.id)}>
                            <HugeiconsIcon
                                icon={Copy01Icon}
                                size={15}
                                strokeWidth={1.8} />
                        </button>
                        <button
                            class="cursor-pointer rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-bad"
                            title="Xoá truy vấn"
                            onclick={() => del(q.id, q.answers.length)}>
                            <HugeiconsIcon
                                icon={Delete02Icon}
                                size={15}
                                strokeWidth={1.8} />
                        </button>
                    </div>
                {/if}
            </div>
        {:else}
            <p
                class="px-4 py-8 text-center text-[11px] leading-relaxed text-ink-500">
                Đặt tên đúng như file BTC phát - tên quyết định cả loại task lẫn
                tên file CSV khi nộp.
            </p>
        {/each}
    </div>

    {#if ws.queries.length > 1}
        <div class="border-t border-ink-800 px-2.5 py-1.5">
            <button
                class="cursor-pointer btn-ghost w-full justify-center py-1 text-[10px] hover:text-bad"
                onclick={() => {
                    if (confirm(`Xoá tất cả ${ws.queries.length} truy vấn?`))
                        [...ws.queries].forEach((q) => ws.removeQuery(q.id));
                }}>
                <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={11}
                    strokeWidth={1.7} />
                Xoá tất cả
            </button>
        </div>
    {/if}
</aside>
