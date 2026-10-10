"use client";

import dynamic from "next/dynamic";

const ClientApp = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading ChunkSmith...</p>
      </div>
    </div>
  ),
});

export default function DynamicPage() {
  return <ClientApp />;
}
