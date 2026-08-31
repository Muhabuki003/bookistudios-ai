"use client";

import { Code2Icon, MessagesSquare, PenToolIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useI18n } from "@/core/i18n/hooks";
import { useAuth } from "@/core/auth/AuthProvider";

const ADMIN_EMAIL = "founder@bookistudios.com";

export function WorkspaceNavChatList() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL || user?.system_role === "admin";
  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={pathname === "/workspace/chats"} asChild>
            <Link className="text-muted-foreground" href="/workspace/chats">
              <MessagesSquare />
              <span>{t.sidebar.chats}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/design")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/design">
              <PenToolIcon />
              <span>{t.sidebar.design}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/code")}
            asChild
          >
            <Link className="text-muted-foreground" href="/workspace/code">
              <Code2Icon />
              <span>{t.sidebar.code}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {isAdmin && (
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/workspace/mawazo")}
              asChild
            >
              <Link className="text-muted-foreground" href="/workspace/mawazo">
                <StoreIcon />
                <span>Mawazo Ops</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
