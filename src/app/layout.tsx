import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITERRA CRM",
  description: "ITERRA 営業・取引管理CRMシステム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <head>
        {/*
          App Router の layout は全ページに適用されるため、このルールの前提
          （pages/_document.js を使わない場合は単一ページでしか読まれない）に当てはまらない。
          next/font/google への移行は、日本語グリフをセルフホストするとイメージが数 MB 増えるため
          現時点では採らない。
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
