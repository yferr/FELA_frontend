import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const API_BASE_URL = env.VITE_API_BASE_URL;

    return {
        // Base public path. Change to '/fela/' if deployed in a subdirectory.
        base: '/',

        build: {
            outDir: 'dist',
            // Keep asset names readable (no hash suffix on JS chunks)
            rollupOptions: {
                input: {
                    main: path.resolve(__dirname, 'index.html'),
                    login: path.resolve(__dirname, 'login.html')
                },
                output: {
                    entryFileNames: 'js/[name].js',
                    chunkFileNames: 'js/[name].js',
                    assetFileNames: 'assets/[name].[ext]'
                }
            }
        },

        server: {
            port: 3000,
            // Proxy API calls to Django backend during development
            proxy: {
                '/FELA': {
                    target: API_BASE_URL,
                    changeOrigin: true
                },
                '/auth': {
                    target: API_BASE_URL,
                    changeOrigin: true
                }
            }
        }
    };
});