<script lang="ts">
	import '../app.css';
	// Favicon sống trong $lib/assets chứ không phải static/: Vite tự băm tên file và
	// phát ra bản đã tối ưu, khỏi phải thêm một thư mục nữa ở gốc project.
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

{@render children()}
