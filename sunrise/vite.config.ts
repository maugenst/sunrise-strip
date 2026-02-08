// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
    plugins: [sveltekit()],
    server: {
        host: true,          // 0.0.0.0
        port: 8080,
        strictPort: true,
        allowedHosts: ['sunrise']
    }
});
