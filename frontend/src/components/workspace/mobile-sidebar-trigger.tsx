"use client";

import { PanelLeftOpenIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function MobileSidebarTrigger() {
  return (
    <div className="md:hidden fixed top-2 left-2 z-50">
      <SidebarTrigger asChild>
        <Button variant="outline" size="icon" className="size-8 rounded-full shadow-md bg-background/80 backdrop-blur-sm">
          <PanelLeftOpenIcon className="size-4" />
        </Button>
      </SidebarTrigger>
    </div>
  );
}
