import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 协作平台",
  description: "多 AI 协作平台 - 支持 Grok、Gemini、Claude 多模型协作",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="antialiased">{children}</body>
    </html>
  );
}
