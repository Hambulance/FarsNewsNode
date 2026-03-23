import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TensorRT Chat",
  description: "Local ChatGPT-style interface for TensorRT-LLM"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
