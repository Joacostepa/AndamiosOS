"use client";

import { useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navigation } from "@/lib/constants/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpen, isMobile } = useSidebar();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (isMobile) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 150);
  }, [setOpen, isMobile]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 300);
  }, [setOpen, isMobile]);

  return (
    <Sidebar
      collapsible="icon"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SidebarHeader className="border-b border-sidebar-border px-2 py-4">
        <Link href="/" className="flex items-center gap-2 overflow-hidden">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            A
          </span>
          <span className="text-xl font-bold tracking-tight truncate group-data-[collapsible=icon]:hidden">
            Andamios<span className="text-primary">OS</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((group, i) => (
          <SidebarGroup key={i}>
            {group.label && (
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.subItems ? item.subItems[0].href : item.href} />}
                        isActive={isActive}
                        tooltip={item.title}
                        className={cn(
                          isActive && "bg-sidebar-accent text-primary"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {item.subItems && isActive && (
                        <SidebarMenuSub>
                          {item.subItems.map((sub) => {
                            const isSubActive = pathname === sub.href;
                            return (
                              <SidebarMenuSubItem key={sub.href}>
                                <SidebarMenuSubButton
                                  render={<Link href={sub.href} />}
                                  isActive={isSubActive}
                                >
                                  <span>{sub.title}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
