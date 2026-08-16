<script lang="ts">
    import { onMount } from "svelte";
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        ArrowLeft01Icon,
        ArrowRight01Icon,
        Cancel01Icon,
        Download01Icon,
        Image01Icon,
        Key01Icon,
        Link01Icon,
        Upload01Icon,
        Video01Icon,
    } from "@hugeicons/core-free-icons";
    import {
        DEFAULT_BASE,
        clipUrl,
        getBase,
        getKey,
        health,
        imageUrl,
        setBase,
        setKey,
        type Health,
    } from "$lib/api";
    import { buildZip, check, download } from "$lib/export";
    import { ws } from "$lib/store.svelte";
    import type { Candidate } from "$lib/types";
    import AnswerList from "$lib/components/AnswerList.svelte";
    import QueryList from "$lib/components/QueryList.svelte";
    import Login from "$lib/components/Login.svelte";
    import Resizer from "$lib/components/Resizer.svelte";
    import ResultGrid from "$lib/components/ResultGrid.svelte";
    import SearchPanel from "$lib/components/SearchPanel.svelte";

    let authed = $state(false);
    let hp = $state<Health | null>(null);
    let hpErr = $state<string | null>(null);
    let pingLatency = $state<number | null>(null);
    let base = $state(DEFAULT_BASE);
    let key = $state("");
    let authKey = $state("");
    let showExportModal = $state(false);
    let zoom = $state<Candidate | null>(null);
    let showClip = $state(false);

    onMount(async () => {
        ws.load();
        // Đã có key lưu sẵn -> thử vào thẳng. Sai/thiếu -> rơi về màn đăng nhập.
        if (getKey()) {
            try {
                hp = await health();
                authed = true;
            } catch {
                authed = false;
            }
        }
        base = getBase();
        key = getKey();
        authKey = getKey();
        await ping();
    });

    async function ping() {
        hpErr = null;
        const start = performance.now();
        try {
            hp = await health();
            pingLatency = Math.round(performance.now() - start);
        } catch (e) {
            hp = null;
            hpErr = (e as Error).message;
            pingLatency = null;
        }
    }

    async function applySettings() {
        setBase(base);
        setKey(authKey);
        await ping();
    }

    let exportReport = $derived(check(ws.queries));

    function handleExportZip() {
        download(buildZip(ws.queries), "submission.zip");
        showExportModal = false;
    }

    function exportJson() {
        download(
            new Blob([ws.toJSON()], { type: "application/json" }),
            "aic-workspace.json",
        );
    }

    async function importJson(e: Event) {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) {
            try {
                ws.fromJSON(await f.text());
            } catch (err) {
                alert((err as Error).message);
            }
        }
    }

    // Lightbox navigation
    let zoomIndex = $derived.by(() => {
        if (!zoom || !ws.active) return -1;
        return ws.active.candidates.findIndex(
            (c) =>
                c.video_id === zoom?.video_id && c.frame_id === zoom?.frame_id,
        );
    });

    function prevCandidate() {
        if (!ws.active || zoomIndex <= 0) return;
        zoom = ws.active.candidates[zoomIndex - 1];
        showClip = false;
    }

    function nextCandidate() {
        if (
            !ws.active ||
            zoomIndex < 0 ||
            zoomIndex >= ws.active.candidates.length - 1
        )
            return;
        zoom = ws.active.candidates[zoomIndex + 1];
        showClip = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            zoom = null;
            showExportModal = false;
        } else if (zoom) {
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                prevCandidate();
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                nextCandidate();
            } else if (e.key === " " || e.key === "Enter") {
                if (
                    ws.active &&
                    zoom &&
                    !(
                        e.target instanceof HTMLInputElement ||
                        e.target instanceof HTMLTextAreaElement
                    )
                ) {
                    e.preventDefault();
                    ws.toggleAnswer(ws.active, zoom);
                }
            }
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !authed}
    <Login
        onin={() => {
            authed = true;
            ping();
        }} />
{:else}
    <div
        class="flex h-screen flex-col overflow-hidden bg-[#0a0a0a] text-slate-100">
        <!-- top navbar -->
        <header
            class="flex h-13 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#111111] px-4">
            <!-- brand and server status -->
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                    <h1
                        class="text-sm font-extrabold tracking-tight text-white">
                        AIC DeepByte Searcher
                    </h1>
                </div>

                <!-- health status pill -->
                <button
                    class="cursor-pointer flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-all {hp
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'}"
                    onclick={ping}
                    title={hpErr ??
                        `Đang nối ${getBase()} - bấm để kiểm tra lại`}>
                    <span class="relative flex size-2">
                        {#if hp}
                            <span
                                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75">
                            </span>
                        {/if}
                        <span
                            class="relative inline-flex size-2 rounded-full {hp
                                ? 'bg-emerald-400'
                                : 'bg-rose-500'}">
                        </span>
                    </span>
                    {#if hp}
                        <span>{hp.frames.toLocaleString("vi")} frames</span>
                        {#if pingLatency !== null}
                            <span
                                class="font-mono text-[10px] text-emerald-500">
                                ({pingLatency}ms)
                            </span>
                        {/if}
                    {:else}
                        <span>Backend Offline</span>
                    {/if}
                </button>
            </div>

            <!-- action buttons -->
            <div class="flex items-center gap-2">
                <div class="h-4 w-px bg-slate-800"></div>

                <!-- import workspace json -->
                <label class="btn-secondary cursor-pointer">
                    <svg
                        class="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2">
                        <path
                            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3">
                        </path>
                    </svg>
                    <span>Nạp JSON</span>
                    <input
                        type="file"
                        accept=".json"
                        class="hidden"
                        onchange={importJson} />
                </label>

                <!-- save workspace json -->
                <button
                    class="cursor-pointer btn-secondary"
                    onclick={exportJson}
                    title="Lưu lại tiến trình hiện tại thành file JSON">
                    <svg
                        class="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2">
                        <path
                            d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z">
                        </path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    <span>Lưu workspace</span>
                </button>

                <!-- export zip -->
                <button
                    class="cursor-pointer btn-primary"
                    onclick={() => (showExportModal = true)}>
                    <svg
                        class="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Xuất submission.zip</span>
                </button>
            </div>
        </header>

        <!-- error banner if any -->
        {#if ws.error}
            <div
                class="flex items-center justify-between border-b border-rose-900/60 bg-rose-950/80 px-4 py-2 text-xs text-rose-200">
                <div class="flex items-center gap-2">
                    <svg
                        class="size-4 text-rose-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>{ws.error}</span>
                </div>
                <button
                    class="cursor-pointer text-rose-400 hover:text-white"
                    onclick={() => (ws.error = null)}>
                    <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={13}
                        strokeWidth={1.9} />
                </button>
            </div>
        {/if}

        <!-- 3 column workspace -->
        <div class="flex min-h-0 flex-1">
            <QueryList />
            <Resizer side="left" />

            <main class="flex min-w-0 flex-1 flex-col bg-[#0d0d0d]">
                {#if ws.active}
                    <SearchPanel query={ws.active} />
                    <ResultGrid
                        query={ws.active}
                        onzoom={(c) => ((zoom = c), (showClip = false))} />
                {:else}
                    <div
                        class="flex flex-1 flex-col items-center justify-center p-8 text-center">
                        <div
                            class="mb-4 flex size-16 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 shadow-xl">
                            <svg
                                class="size-8 text-indigo-400"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5">
                                <path
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10">
                                </path>
                            </svg>
                        </div>
                        <h2 class="text-base font-bold text-slate-200">
                            Chào mừng đến với AIC DeepByte Searcher
                        </h2>
                        <p
                            class="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                            Chọn hoặc tạo một truy vấn ở thanh bên trái theo tên
                            đề bài (ví dụ: <span
                                class="font-mono text-indigo-400">
                                query-1-kis
                            </span>
                            ) để bắt đầu tìm kiếm và thu thập đáp án
                        </p>
                    </div>
                {/if}
            </main>

            {#if ws.active}
                <Resizer side="right" />
                <AnswerList query={ws.active} />
            {/if}
        </div>
    </div>

    <!-- ==================== MODALS ==================== -->

    <!-- 1. Backend Settings Modal -->

    <!-- 2. Keyboard Shortcuts Modal -->

    <!-- 3. Export Submission Modal -->
    {#if showExportModal}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
            onclick={() => (showExportModal = false)}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
                class="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#161616] p-5 shadow-2xl"
                onclick={(e) => e.stopPropagation()}>
                <div class="mb-4 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div
                            class="flex size-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                            <svg
                                class="size-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2.5">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <h3 class="text-sm font-bold text-white">
                            Xuất gói nộp bài (submission.zip)
                        </h3>
                    </div>
                    <button
                        class="cursor-pointer text-slate-500 hover:text-white"
                        onclick={() => (showExportModal = false)}>
                        <HugeiconsIcon
                            icon={Cancel01Icon}
                            size={13}
                            strokeWidth={1.9} />
                    </button>
                </div>

                <div class="mb-4 space-y-2">
                    <div
                        class="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                        <div
                            class="flex items-center justify-between text-slate-300">
                            <span>Tổng số file CSV:</span>
                            <span class="font-mono font-bold text-white">
                                {Object.keys(exportReport.files).length}
                            </span>
                        </div>
                        <div
                            class="mt-1 flex items-center justify-between text-slate-300">
                            <span>Cấu trúc zip:</span>
                            <span class="font-mono text-indigo-400">
                                submission/*.csv
                            </span>
                        </div>
                    </div>

                    {#if !exportReport.ok}
                        <div
                            class="rounded-lg border border-rose-900/60 bg-rose-950/40 p-3 text-xs text-rose-300">
                            <p class="font-bold">Phát hiện lỗi định dạng:</p>
                            <ul
                                class="mt-1 max-h-36 space-y-1 overflow-y-auto pl-4">
                                {#each Object.entries(exportReport.problems) as [qid, perrs]}
                                    <li class="list-disc">
                                        <strong class="font-mono">{qid}</strong>
                                        : {perrs.join(", ")}
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {:else}
                        <div
                            class="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                            <svg
                                class="size-4 shrink-0"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span>
                                Tất cả các truy vấn đều hợp lệ chuẩn quy định
                                BTC!
                            </span>
                        </div>
                    {/if}
                </div>

                <div class="flex justify-end gap-2">
                    <button
                        class="cursor-pointer btn-secondary"
                        onclick={() => (showExportModal = false)}>
                        Huỷ
                    </button>
                    <button
                        class="cursor-pointer btn-primary"
                        onclick={handleExportZip}>
                        Tải về submission.zip
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- 4. Lightbox Candidate Inspector (Zoom Modal) -->
{/if}

{#if zoom}
    {@const isPicked = ws.active ? ws.isPicked(ws.active, zoom) : false}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md"
        onclick={() => (zoom = null)}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#161616] shadow-2xl"
            onclick={(e) => e.stopPropagation()}>
            <!-- lightbox header -->
            <div
                class="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
                <div class="flex items-center gap-2">
                    <span
                        class="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-xs font-bold text-indigo-400">
                        #{zoom.rank}
                    </span>
                    <span
                        class="font-mono text-xs font-semibold text-slate-200">
                        {zoom.video_id}
                    </span>
                    <span class="text-xs text-slate-500">
                        (frame: {zoom.frame_id} · {zoom.pts_time.toFixed(1)}s)
                    </span>
                </div>

                <div class="flex items-center gap-2">
                    {#if ws.active}
                        <button
                            class="cursor-pointer btn py-1 text-xs font-bold {isPicked
                                ? 'bg-rose-600 text-white hover:bg-rose-500'
                                : 'bg-emerald-600 text-white hover:bg-emerald-500'}"
                            onclick={() =>
                                ws.active &&
                                zoom &&
                                ws.toggleAnswer(ws.active, zoom)}>
                            {isPicked ? "Bỏ chọn" : "+ Chọn nộp"}
                        </button>
                    {/if}

                    <button
                        class="cursor-pointer btn-secondary py-1 text-xs"
                        onclick={() => (showClip = !showClip)}>
                        {showClip ? "Xem ảnh tĩnh" : "Xem clip 5s"}
                    </button>

                    <button
                        class="cursor-pointer btn-ghost size-7 p-0"
                        onclick={() => (zoom = null)}>
                        <HugeiconsIcon
                            icon={Cancel01Icon}
                            size={13}
                            strokeWidth={1.9} />
                    </button>
                </div>
            </div>

            <!-- media body with navigation buttons -->
            <div
                class="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-950">
                <!-- prev button -->
                {#if zoomIndex > 0}
                    <button
                        class="cursor-pointer absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-2 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110 hover:bg-slate-800"
                        onclick={prevCandidate}
                        title="Xem kết quả trước ()">
                        <svg
                            class="size-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                {/if}

                <!-- media content -->
                <div
                    class="flex max-h-[55vh] w-full items-center justify-center p-2">
                    {#if showClip}
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <video
                            src={clipUrl(zoom.video_id, zoom.frame_id)}
                            controls
                            autoplay
                            class="max-h-[52vh] max-w-full rounded-lg shadow-xl">
                        </video>
                    {:else}
                        <img
                            src={imageUrl(zoom.video_id, zoom.keyframe_n, 1280)}
                            alt=""
                            class="max-h-[52vh] max-w-full rounded-lg object-contain shadow-xl" />
                    {/if}
                </div>

                <!-- next button -->
                {#if ws.active && zoomIndex < ws.active.candidates.length - 1}
                    <button
                        class="cursor-pointer absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-2 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110 hover:bg-slate-800"
                        onclick={nextCandidate}
                        title="Xem kết quả tiếp theo ()">
                        <svg
                            class="size-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                {/if}
            </div>

            <!-- metadata details inspector -->
            <div
                class="max-h-48 space-y-2 overflow-y-auto border-t border-slate-800 bg-[#111111] p-3 text-xs">
                <!-- score parts -->
                {#if zoom.parts}
                    <div class="flex flex-wrap items-center gap-2">
                        <span
                            class="text-[10px] font-bold text-slate-500 uppercase">
                            Điểm thành phần:
                        </span>
                        {#each Object.entries(zoom.parts) as [k, v]}
                            <span
                                class="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                                {k
                                    .replace("faiss_", "F.")
                                    .replace("bm25_", "B.")}:
                                <strong class="text-indigo-400">
                                    {v.toFixed(3)}
                                </strong>
                            </span>
                        {/each}
                    </div>
                {/if}

                <!-- text cues -->
                <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {#if zoom.caption}
                        <div
                            class="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2">
                            <span
                                class="text-[10px] font-bold text-indigo-400 uppercase">
                                Caption
                            </span>
                            <p
                                class="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                                {zoom.caption}
                            </p>
                        </div>
                    {/if}
                    {#if zoom.speech}
                        <div
                            class="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2">
                            <span
                                class="text-[10px] font-bold text-emerald-400 uppercase">
                                Speech
                            </span>
                            <p
                                class="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                                {zoom.speech}
                            </p>
                        </div>
                    {/if}
                    {#if zoom.ocr}
                        <div
                            class="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2">
                            <span
                                class="text-[10px] font-bold text-amber-400 uppercase">
                                OCR
                            </span>
                            <p
                                class="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                                {zoom.ocr}
                            </p>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}
