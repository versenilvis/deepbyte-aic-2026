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
    import Logo from "./Logo.svelte";
    import GithubMark from "./GithubMark.svelte";

    const REPO = "https://github.com/versenilvis/deepbyte-aic-2026";

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

<div class="flex h-screen bg-ink-950">
    <!-- ══ TRÁI: thế giới thương hiệu ══
         Ẩn dưới lg vì đây thuần trang trí - màn hẹp thì cổng đăng nhập chiếm hết. -->
    <div class="art relative hidden shrink-0 flex-col justify-between overflow-hidden p-14 lg:flex lg:w-[52%] xl:w-[57%]">
        <div class="grain pointer-events-none absolute inset-0"></div>
        <div
            class="glow pointer-events-none absolute top-[54%] left-[42%] size-[620px] -translate-x-1/2 -translate-y-1/2">
        </div>

        <div class="relative flex items-center gap-3">
            <Logo size={34} uid="login" />
            <span class="text-[23px] font-semibold tracking-[-0.025em] text-ink-50">
                DeepByte
            </span>
        </div>

        <div class="relative">
            <h1
                class="text-[clamp(38px,4.4vw,62px)] leading-[1.02] font-medium tracking-[-0.035em] text-ink-50">
                See Deeper.
                <br />
                <span class="text-brand">Build Smarter.</span>
            </h1>
            <p class="mt-5 max-w-md text-[15px] leading-relaxed font-light text-ink-300">
                Tìm đúng một khung hình trong hàng triệu khung hình video - bằng mô tả,
                lời thoại, hoặc chữ trên màn hình.
            </p>
            <div class="mt-6 flex items-center gap-2.5">
                <span class="label-xs font-mono">LLM Frame Search Tool</span>
                <span class="h-px w-6 bg-ink-700"></span>
                <span class="label-xs font-mono">AIC 2026</span>
            </div>
        </div>
    </div>

    <!-- ══ PHẢI: cổng đăng nhập ══ -->
    <div class="relative flex flex-1 items-center justify-center px-6 py-12">
        <a
            class="absolute top-5 right-5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]
        text-ink-500 transition-colors hover:bg-ink-900 hover:text-ink-100"
            href={REPO}
            target="_blank"
            rel="noreferrer"
            title="Mã nguồn trên GitHub">
            <GithubMark size={15} />
            GitHub
        </a>

        <div class="w-full max-w-[372px]">
            <div class="mb-7 flex items-center gap-2.5 lg:hidden">
                <Logo size={26} uid="loginsm" />
                <span class="text-lg font-semibold tracking-[-0.02em] text-ink-50">
                    DeepByte
                </span>
            </div>

            <h2 class="text-[25px] font-medium tracking-[-0.025em] text-ink-50">
                Đăng nhập
            </h2>
            <p class="mt-2 mb-7 text-[13.5px] font-light text-ink-400">
                Nhập key chung của đội để vào workspace.
            </p>

            <label class="label-xs mb-2 block" for="key">Key truy cập</label>
            <div class="relative">
                <HugeiconsIcon
                    icon={Key01Icon}
                    size={16}
                    strokeWidth={1.7}
                    class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-500" />
                <!-- svelte-ignore a11y_autofocus -->
                <input
                    id="key"
                    type="password"
                    autofocus
                    autocomplete="current-password"
                    class="field h-[46px] rounded-[10px] pl-10 font-mono text-sm tracking-[0.18em] {err
                        ? 'border-bad focus:border-bad focus:ring-bad/14'
                        : ''}"
                    placeholder="••••••••••"
                    bind:value={key}
                    onkeydown={(e) => e.key === "Enter" && submit()}
                    oninput={() => (err = null)} />
            </div>

            {#if err}
                <p class="mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed text-bad">
                    <HugeiconsIcon
                        icon={Alert02Icon}
                        size={13}
                        strokeWidth={1.8}
                        class="mt-px shrink-0" />
                    {err}
                </p>
            {/if}

            <button
                class="btn-primary mt-3.5 h-[46px] w-full gap-2 rounded-[10px] text-sm"
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
                    Vào workspace
                    <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={16}
                        strokeWidth={2.2} />
                {/if}
            </button>

            <button
                class="btn-ghost mt-2.5 h-8 w-full justify-center text-[11.5px]"
                onclick={() => (advanced = !advanced)}>
                <HugeiconsIcon icon={Link01Icon} size={13} strokeWidth={1.7} />
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

            <div class="my-6 flex items-center gap-2.5">
                <span class="h-px flex-1 bg-ink-800"></span>
                <span class="font-mono text-[9.5px] tracking-[0.14em] text-ink-700 uppercase">
                    backend
                </span>
                <span class="h-px flex-1 bg-ink-800"></span>
            </div>

            <div
                class="flex items-center gap-2.5 rounded-[10px] border border-ink-800 bg-ink-900 px-3 py-2.5">
                <span class="size-1.5 shrink-0 rounded-full bg-ok ring-[3px] ring-ok/18"></span>
                <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-300">
                    {base.replace(/^https?:\/\//, "")}
                </span>
            </div>

            <p class="mt-4 text-[11px] leading-relaxed text-ink-500">
                Key do notebook Kaggle in ra khi mở tunnel. Cả đội dùng chung một key.
            </p>

        </div>
    </div>
</div>

<style>
    /* Ảnh nền trừu tượng đơn sắc, dựng bằng gradient - không tải asset nào.
       Theo art direction của brand: monochrome, một điểm nhấn lavender. */
    .art {
        background:
            radial-gradient(58% 70% at 50% 8%, rgb(245 245 247 / 0.16) 0%, rgb(245 245 247 / 0) 62%),
            linear-gradient(
                97deg,
                #0a0a0c 0%,
                #14141a 26%,
                #3a3a46 45%,
                #6d6a7d 50%,
                #35353f 55%,
                #131319 74%,
                #0a0a0c 100%
            );
    }

    .grain {
        background-image: repeating-linear-gradient(
            112deg,
            rgb(255 255 255 / 0.035) 0px,
            rgb(255 255 255 / 0.035) 1px,
            rgb(0 0 0 / 0) 1px,
            rgb(0 0 0 / 0) 4px
        );
    }

    .glow {
        background: radial-gradient(
            50% 50% at 50% 50%,
            rgb(140 124 255 / 0.3) 0%,
            rgb(140 124 255 / 0) 70%
        );
    }
</style>
