import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "카드뉴스 생성기",
  description: "인스타그램 카드뉴스 자동 생성 — Ollama + Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
