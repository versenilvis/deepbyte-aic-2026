import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    // static: không có server riêng. Toàn bộ state sống trong trình duyệt (localStorage),
    // backend là Kaggle qua tunnel. Deploy được lên Vercel/Netlify/Pages free tier.
    adapter: adapter({ fallback: 'index.html' })
  }
};
