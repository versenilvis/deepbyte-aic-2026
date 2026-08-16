<script lang="ts">
    import { HugeiconsIcon } from "@hugeicons/svelte";
    import {
        Key01Icon,
        Loading03Icon,
        Alert02Icon,
        ArrowRight01Icon,
        Link01Icon,
    } from "@hugeicons/core-free-icons";
    import { DEFAULT_BASE, getBase, health, setBase, setKey } from "$lib/api";

    let { onin }: { onin: () => void } = $props();

    let key = $state("");
    let base = $state(DEFAULT_BASE);
    let advanced = $state(false);
    let busy = $state(false);
    let err = $state<string | null>(null);

    $effect(() => {
        base = getBase();
        // KHÔNG điền sẵn key: đây là màn xác thực, không phải form ghi nhớ.
        // Trình duyệt tự điền được thì vẫn tiện, nhưng ta không tự gợi ý.
    });

    /** Đăng nhập = thử gọi /health với key vừa nhập. Backend trả 401 nếu sai. */
    async function submit() {
        if (!key.trim()) return;
        busy = true;
        err = null;
        setBase(base);
        setKey(key);
        try {
            await health();
            onin();
        } catch (e) {
            const m = (e as Error).message;
            err =
                m.includes("401") || m.toLowerCase().includes("key")
                    ? "Key không đúng."
                    : `Không gọi được backend - ${m}`;
            advanced = advanced || !m.includes("401");
        } finally {
            busy = false;
        }
    }
</script>

<div class="flex h-screen items-center justify-center bg-ink-950 px-6">
    <div class="w-full max-w-sm">
        <div class="mb-8 text-center">
            <h1 class="text-xl font-bold tracking-tight text-ink-100">
                AIC DeepByte Searcher
            </h1>
            <p class="mt-1.5 text-sm text-ink-500">Nhập key của đội để vào</p>
        </div>

        <div class="rounded-xl border border-ink-800 bg-ink-900 p-5">
            <label
                class="mb-2 block text-xs font-medium text-ink-300"
                for="key">
                Key truy cập
            </label>
            <div class="relative">
                <HugeiconsIcon
                    icon={Key01Icon}
                    size={16}
                    strokeWidth={1.7}
                    class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500" />
                <!-- svelte-ignore a11y_autofocus -->
                <input
                    id="key"
                    type="password"
                    autofocus
                    autocomplete="current-password"
                    class="field py-2.5 pl-10 font-mono text-sm {err
                        ? 'border-bad'
                        : ''}"
                    placeholder="••••••••••"
                    bind:value={key}
                    onkeydown={(e) => e.key === "Enter" && submit()}
                    oninput={() => (err = null)} />
            </div>

            {#if err}
                <p
                    class="mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed text-bad">
                    <HugeiconsIcon
                        icon={Alert02Icon}
                        size={13}
                        strokeWidth={1.8}
                        class="mt-px shrink-0" />
                    {err}
                </p>
            {/if}

            <button
                class="btn-primary mt-4 w-full gap-2 py-2.5 text-sm"
                onclick={submit}
                disabled={busy || !key.trim()}>
                {#if busy}
                    <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        strokeWidth={2}
                        class="animate-spin" />
                    Đang kiểm tra
                {:else}
                    Đăng nhập
                    <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={16}
                        strokeWidth={2} />
                {/if}
            </button>

            <button
                class="btn-ghost mt-3 w-full justify-center py-1 text-[11px]"
                onclick={() => (advanced = !advanced)}>
                <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={1.7} />
                {advanced ? "Ẩn" : "Đổi"} địa chỉ backend
            </button>

            {#if advanced}
                <input
                    class="field mt-2 py-2 font-mono text-xs"
                    placeholder="https://aic.verse.id.vn"
                    bind:value={base}
                    onkeydown={(e) => e.key === "Enter" && submit()} />
                <p class="mt-1.5 text-[11px] leading-relaxed text-ink-500">
                    Chỉ đổi khi chạy quick tunnel - URL đó đổi mỗi phiên.
                </p>
            {/if}
        </div>

        <p class="mt-5 text-center text-[11px] leading-relaxed text-ink-500">
            Key do notebook Kaggle in ra khi mở tunnel.
            <br />
            Cả đội dùng chung một key.
        </p>
    </div>
</div>
