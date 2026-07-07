import esbuild from "esbuild";
import fs from "fs";
import path from "path";

// 볼트 경로는 환경변수(GGAI_CORE_DEPLOY_TARGET)로만 지정한다. 미설정/미존재 시 복사를 건너뜁니다.
const VAULT_PLUGIN_DIR = process.env.GGAI_CORE_DEPLOY_TARGET;
const isWatch = process.argv.includes("--watch");

const vaultAvailable = Boolean(VAULT_PLUGIN_DIR) && fs.existsSync(VAULT_PLUGIN_DIR);

const copyPlugin = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      if (!vaultAvailable) {
        console.log(
          `[${new Date().toLocaleTimeString()}] ✅ 빌드 완료 (볼트 경로 없음 — 복사 건너뜀)`
        );
        return;
      }
      const files = ["main.js", "styles.css"];
      for (const file of files) {
        const src = path.join(".", file);
        const dest = path.join(VAULT_PLUGIN_DIR, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
      if (fs.existsSync("manifest.json")) {
        fs.copyFileSync("manifest.json", path.join(VAULT_PLUGIN_DIR, "manifest.json"));
      }
      console.log(`[${new Date().toLocaleTimeString()}] ✅ 빌드 완료 → 볼트에 복사됨`);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian", "electron",
    "@codemirror/*", "@lezer/*",
    "http", "https", "events", "fs", "path", "os", "url", "crypto", "stream",
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: false,
  treeShaking: true,
  outfile: "main.js",
  plugins: [copyPlugin],
});

if (isWatch) {
  await ctx.watch();
  console.log("👀 Watch 모드 — .ts 저장 시 자동 빌드");
} else {
  await ctx.rebuild();
  ctx.dispose();
}
