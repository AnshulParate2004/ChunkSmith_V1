import type { Metadata } from "next";
import "@/index.css";
import "@/App.css";

export const metadata: Metadata = {
  title: "ChunkSmith - Intelligent Multimodal Document Chunking & RAG",
  description: "Next-generation multimodal RAG and intelligent document chunking",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        {children}
      </body>
    </html>
  );
}
