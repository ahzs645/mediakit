import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: process.env.VITE_BASE_PATH || './', plugins: [react()], build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'typography', test: /node_modules\/opentype/ }, { name:'archive',test:/node_modules\/jszip/ }] } } } }, server: { host: '127.0.0.1' } });
