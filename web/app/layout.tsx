import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "plain-work · 文字精修",
  description: "输入文字或上传 TXT、Word，减少套话与重复，保留内容本意。plain-work 降 AI 味工具集。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
