import type { NextConfig } from "next";

// 親ディレクトリの lockfile を workspace root と誤検出すると、
// standalone の出力が .next/standalone/<project>/ に入れ子になり Dockerfile が煩雑になる。
// このディレクトリをルートとして明示する。
const projectRoot = import.meta.dirname;

const nextConfig: NextConfig = {
  // NAS 上の Docker で動かすため、依存を同梱した最小構成を出力する。
  // .next/standalone に server.js が生成される（public と .next/static は別途コピーが必要）。
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
};

export default nextConfig;
