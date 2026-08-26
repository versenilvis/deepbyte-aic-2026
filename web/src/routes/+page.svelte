<script lang="ts">
    import { onMount } from "svelte";
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        Cancel01Icon,
        Search01Icon,
        Target02Icon,
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
    import Logo from "$lib/components/Logo.svelte";
    import GithubMark from "$lib/components/GithubMark.svelte";
    import Inspector from "$lib/components/Inspector.svelte";
    import { scrub } from "$lib/scrub.svelte";
    import Resizer from "$lib/components/Resizer.svelte";
    import ResultGrid from "$lib/components/ResultGrid.svelte";
    import SearchPanel from "$lib/components/SearchPanel.svelte";
    import FrameJump from "$lib/components/FrameJump.svelte";
    import MergeModal from "$lib/components/MergeModal.svelte";
    import ShareModal from "$lib/components/ShareModal.svelte";
    import { parseWorkspaceJson } from "$lib/merge";
    import type { Query } from "$lib/types";

    let authed = $state(false);
    let hp = $state<Health | null>(null);
    let hpErr = $state<string | null>(null);
    let pingLatency = $state<number | null>(null);
    let base = $state(DEFAULT_BASE);
    let key = $state("");
    let authKey = $state("");
    let showExportModal = $state(false);
    let showMergeModal = $state(false);
    let showShareModal = $state(false);
    let incomingQueries = $state<Query[] | null>(null);
    let zoom = $state<Candidate[] | null>(null);
    let showClip = $state(false);
    let activeTab = $state<"search" | "jump">("search");

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




    // Lightbox navigation
    let zoomIndex = $derived.by(() => {
        if (!zoom?.[0] || !ws.active) return -1;
        return ws.active.candidates.findIndex(
            (c) =>
                c.video_id === zoom?.[0]?.video_id && c.frame_id === zoom?.[0]?.frame_id,
        );
    });

    function prevCandidate() {
        if (!ws.active || zoomIndex <= 0) return;
        zoom = [ws.active.candidates[zoomIndex - 1]];
        showClip = false;
    }

    function nextCandidate() {
        if (
            !ws.active ||
            zoomIndex < 0 ||
            zoomIndex >= ws.active.candidates.length - 1
        )
            return;
        zoom = [ws.active.candidates[zoomIndex + 1]];
        showClip = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            zoom = null;
            showExportModal = false;
            showMergeModal = false;
            showShareModal = false;
            incomingQueries = null;
        } else if (scrub.active) {
            // clip 5s đang mở: ← → thuộc về thanh tua frame, Space là phát/dừng
            return;
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
                    ws.toggleAnswer(ws.active, zoom[0]);
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
        class="flex h-screen flex-col overflow-hidden bg-ink-950 text-ink-100">
        <!-- top navbar -->
        <header
            class="flex h-13 shrink-0 items-center gap-3.5 border-b border-ink-800 bg-ink-900 px-4">
            <!-- thương hiệu -->
            <div class="flex items-center gap-2.5">
                <Logo size={21} uid="nav" />
                <span class="text-[15px] font-semibold tracking-[-0.018em] text-ink-50">
                    DeepByte
                </span>
                <span class="h-3.5 w-px bg-ink-800"></span>
                <span class="text-[13px] font-light tracking-[-0.005em] text-ink-400">
                    Frame Search
                </span>
            </div>

            <!-- trạng thái backend -->
            <button
                class="flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 transition-colors {hp
                    ? 'border-ink-800 bg-ink-825 hover:border-ink-700'
                    : 'border-bad/30 bg-bad/8 hover:bg-bad/14'}"
                onclick={ping}
                title={hpErr ?? `Đang nối ${getBase()} - bấm để kiểm tra lại`}>
                <span
                    class="size-1.5 rounded-full {hp
                        ? 'bg-brand ring-[3px] ring-brand/18'
                        : 'bg-bad ring-[3px] ring-bad/18'}">
                </span>
                {#if hp}
                    <span class="tabular font-mono text-[11px] font-medium text-ink-200">
                        {hp.frames.toLocaleString("vi")} frames
                    </span>
                    {#if pingLatency !== null}
                        <span class="tabular font-mono text-[10px] text-ink-500">
                            {pingLatency}ms
                        </span>
                    {/if}
                {:else}
                    <span class="text-[11px] font-medium text-bad">Backend offline</span>
                {/if}
            </button>

            <div class="flex-1"></div>

            <!-- hành động -->
            <div class="flex items-center gap-2">
                <a
                    class="btn-ghost size-8 px-0"
                    href="https://github.com/versenilvis/deepbyte-aic-2026"
                    target="_blank"
                    rel="noreferrer"
                    title="Mã nguồn trên GitHub">
                    <GithubMark size={16} />
                </a>

                <span class="h-4 w-px bg-ink-800"></span>

                <button
                    class="btn-secondary h-8"
                    onclick={() => (showShareModal = true)}
                    title="Đẩy bài lên máy chung của đội, hoặc lấy bài người khác về">
                    <svg
                        class="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linecap="round"
                        stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <path d="M8.6 13.5l6.8 4"></path>
                        <path d="M15.4 6.5l-6.8 4"></path>
                    </svg>
                    <span>Chia sẻ</span>
                </button>

                <button
                    class="btn-primary h-8"
                    onclick={() => (showExportModal = true)}>
                    <svg
                        class="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.4"
                        stroke-linecap="round"
                        stroke-linejoin="round">
                        <path d="M20 6L9 17l-5-5"></path>
                    </svg>
                    <span>Xuất submission.zip</span>
                </button>
            </div>
        </header>

        <!-- error banner if any -->
        {#if ws.error}
            <div
                class="flex items-center justify-between border-b border-bad/25 bg-bad/10 px-4 py-2 text-xs text-bad">
                <div class="flex items-center gap-2">
                    <svg
                        class="size-4 shrink-0"
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
                    class="cursor-pointer text-bad/70 hover:text-bad"
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

            <main class="flex min-w-0 flex-1 flex-col bg-ink-950">
                {#if ws.active}
                    <SearchPanel query={ws.active} />
                    <!-- dải tab chuyển đổi giữa kết quả tìm kiếm và nhảy tới frame thủ công -->
                    <div class="flex items-center gap-1 border-b border-ink-800 bg-ink-900/60 px-4">
                        <button
                            class="flex h-9.5 items-center gap-2 border-b-2 px-3 text-xs font-medium transition-colors {activeTab ===
                            'search'
                                ? 'border-brand font-semibold text-ink-50'
                                : 'border-transparent text-ink-400 hover:text-ink-200'}"
                            onclick={() => (activeTab = "search")}>
                            <HugeiconsIcon
                                icon={Search01Icon}
                                size={14}
                                strokeWidth={1.8} />
                            <span>Kết quả tìm kiếm</span>
                            {#if ws.active.candidates.length}
                                <span
                                    class="tabular rounded-full bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">
                                    {ws.active.candidates.length}
                                </span>
                            {/if}
                        </button>
                        <button
                            class="flex h-9.5 items-center gap-2 border-b-2 px-3 text-xs font-medium transition-colors {activeTab ===
                            'jump'
                                ? 'border-brand font-semibold text-ink-50'
                                : 'border-transparent text-ink-400 hover:text-ink-200'}"
                            onclick={() => (activeTab = "jump")}>
                            <HugeiconsIcon
                                icon={Target02Icon}
                                size={14}
                                strokeWidth={1.8} />
                            <span>Nhảy tới frame</span>
                        </button>
                    </div>

                    {#if activeTab === "search"}
                        <ResultGrid
                            query={ws.active}
                            onzoom={(g) => (zoom = g)} />
                    {:else}
                        <FrameJump
                            query={ws.active}
                            onzoom={(g) => (zoom = g)} />
                    {/if}
                {:else}
                    <div
                        class="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
                        <Logo size={46} uid="empty" />
                        <div>
                            <h2 class="text-lg font-medium tracking-[-0.025em] text-ink-50">
                                See Deeper. Build Smarter.
                            </h2>
                            <p
                                class="mx-auto mt-2.5 max-w-sm text-[13px] leading-relaxed font-light text-ink-400">
                                Chọn hoặc tạo một truy vấn ở thanh bên trái theo đúng tên đề bài
                                BTC phát (ví dụ
                                <span class="font-mono text-brand">query-1-kis</span>
                                ) để bắt đầu tìm kiếm.
                            </p>
                        </div>
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
            class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
            onclick={() => (showExportModal = false)}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
                class="w-full max-w-lg rounded-[14px] border border-ink-800 bg-ink-900 p-5 shadow-2xl"
                onclick={(e) => e.stopPropagation()}>
                <div class="mb-4 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div
                            class="flex size-7 items-center justify-center rounded-lg bg-brand/16 text-brand">
                            <svg
                                class="size-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2.5">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <h3 class="text-sm font-semibold text-ink-50">
                            Xuất gói nộp bài (submission.zip)
                        </h3>
                    </div>
                    <button
                        class="cursor-pointer text-ink-500 hover:text-ink-100"
                        onclick={() => (showExportModal = false)}>
                        <HugeiconsIcon
                            icon={Cancel01Icon}
                            size={13}
                            strokeWidth={1.9} />
                    </button>
                </div>

                <div class="mb-4 space-y-2">
                    <div
                        class="rounded-lg border border-ink-800 bg-ink-825 p-3 text-xs">
                        <div
                            class="flex items-center justify-between text-ink-300">
                            <span>Tổng số file CSV:</span>
                            <span class="font-mono font-semibold text-ink-50">
                                {Object.keys(exportReport.files).length}
                            </span>
                        </div>
                        <div
                            class="mt-1 flex items-center justify-between text-ink-300">
                            <span>Cấu trúc zip:</span>
                            <span class="font-mono text-brand">
                                submission/*.csv
                            </span>
                        </div>
                    </div>

                    {#if !exportReport.ok}
                        <div
                            class="rounded-lg border border-bad/25 bg-bad/8 p-3 text-xs text-bad">
                            <p class="font-semibold">Phát hiện lỗi định dạng:</p>
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
                            class="flex items-center gap-2 rounded-lg border border-ok/28 bg-ok/8 p-3 text-xs text-ok">
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
                        class="btn-secondary h-9"
                        onclick={() => (showExportModal = false)}>
                        Huỷ
                    </button>
                    <button
                        class="btn-primary h-9"
                        onclick={handleExportZip}>
                        Tải về submission.zip
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- 4. Merge Workspace Modal -->
    {#if showShareModal}
        <ShareModal
            onclose={() => (showShareModal = false)}
            onpull={(text, name) => {
                // Đi qua đúng luồng gộp có sẵn, KHÔNG ghi đè thẳng - giống hệt
                // importAndMergeJson, chỉ khác nguồn là hub thay vì file trên máy.
                try {
                    const parsed = parseWorkspaceJson(text);
                    if (!parsed.length) {
                        ws.error = `Workspace "${name}" không có truy vấn nào`;
                        return;
                    }
                    incomingQueries = parsed;
                    showShareModal = false;
                    showMergeModal = true;
                } catch (e) {
                    ws.error = (e as Error).message;
                }
            }} />
    {/if}

    {#if showMergeModal && incomingQueries}
        <MergeModal
            currentQueries={ws.queries}
            {incomingQueries}
            onapply={(merged) => {
                ws.applyMerged(merged);
            }}
            onclose={() => {
                showMergeModal = false;
                incomingQueries = null;
            }} />
    {/if}

    <!-- 5. Lightbox Candidate Inspector (Zoom Modal) -->
{/if}

{#if zoom && ws.active}
	<Inspector
		query={ws.active}
		items={zoom}
		onclose={() => (zoom = null)}
		onpick={(frames: number[]) => {
			if (ws.active && zoom) ws.addAnswerFrames(ws.active, zoom, frames);
			zoom = null;
		}}
	/>
{/if}
