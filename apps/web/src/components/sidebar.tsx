import { Logo } from "@nafios/ui/components/logo";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarRoot,
} from "@nafios/ui/components/ui/sidebar";
import { ListChecks, type LucideIcon, Settings } from "lucide-react";

/**
 * NafiOS shell navigation rail.
 *
 * Built on the shadcn <Sidebar collapsible="icon" />. The shell pins it to the
 * collapsed (icon-only) state — see `SidebarProvider` in `_app.tsx` — so it is
 * effectively non-expandable: labels surface as tooltips on hover. Item clicks
 * are intentionally inert; this is a display-only prototype that the
 * module-mounting epic will wire up to real routes.
 */

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Marks the item as the current location (visual only). */
  active?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "smart-todo", label: "SmartTodo", icon: ListChecks, active: true },
];

export function Sidebar() {
  return (
    // `dark` pins the rail to the dark palette regardless of the app theme,
    // matching the draft. Colors come from the shadcn sidebar theme tokens.
    <SidebarRoot collapsible="icon" className="dark">
      <SidebarHeader className="items-center py-3">
        <Logo variant="mark" className="size-8" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton tooltip={item.label} isActive={false}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="items-center py-3">
        <SidebarMenu className="items-center gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="AI Assistant">
              <AssistantOrb />
              <span>AI Assistant</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarRoot>
  );
}

/** Iridescent AI-assistant glyph (display only). */
function AssistantOrb() {
  return (
    <span
      aria-hidden
      className="size-5 shrink-0 rounded-full shadow-inner ring-1 ring-white/20"
      style={{
        backgroundImage:
          "conic-gradient(from 210deg at 50% 50%, #4cc9f0, #8b7cf6, #f472b6, #ff8a5b, #4cc9f0)",
      }}
    />
  );
}
