"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function MobileSidebarTrigger() {
  return (
    <div className="fixed top-2 left-2 z-50 md:hidden">
      <SidebarTrigger
        variant="outline"
        className="bg-background/80 size-8 rounded-full opacity-100 shadow-md backdrop-blur-sm"
      />
    </div>
  );
}
