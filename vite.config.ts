import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Each build gets a unique id. The deployed app compares its own id with version.json to offer updates.
const commit = process.env.GITHUB_SHA || (() => { try { return execSync('git rev-parse HEAD').toString().trim(); } catch { return 'local'; } })();
const builtAt = new Date().toISOString();
const build = `${commit.slice(0, 7)}-${builtAt.replace(/\D/g, '').slice(0, 14)}`;
const repository = `https://github.com/${process.env.GITHUB_REPOSITORY || 'ahzs645/mediakit'}`;

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  define: { __APP_BUILD__: JSON.stringify({ build, commit, builtAt, repository }) },
  plugins: [react(), {
    name: 'version-manifest', apply: 'build',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build, commit, builtAt }) }); },
  }],
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'typography', test: /node_modules\/opentype/ }, { name:'archive',test:/node_modules\/jszip/ }] } } } },
  server: { host: '127.0.0.1' },
});
