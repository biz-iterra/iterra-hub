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
  // フリガナ生成に使う kuromoji の辞書は実行時にパスで読むため、
  // 静的解析では検出されない。明示しないと standalone 出力に入らず
  // 本番でフリガナが作れなくなる（src/lib/kana.ts）
  outputFileTracingIncludes: {
    "/**": ["./node_modules/kuromoji/dict/**"],
  },
  // kuromoji は CommonJS で、辞書を実行時にファイルとして読む。
  // バンドルすると内部のパス解決が壊れるため、Node の解決に任せる
  serverExternalPackages: ["kuromoji"],
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
};

export default nextConfig;
