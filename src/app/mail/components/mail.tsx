import {
  AlertCircle,
  Archive,
  File,
  Inbox,
  Mail as MailIcon,
  MessagesSquare,
  Send,
  ShoppingCart,
  Trash2,
  Users2,
} from "lucide-react";
import * as React from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Mail as MailType } from "@/db/schema";
import { cn } from "@/lib/utils";

import type { Account } from "../lib/data";
import { AccountSwitcher } from "./account-switcher";
import { MailDisplay } from "./mail-display";
import { MailList } from "./mail-list";
import { MailNav } from "./mail-nav";

const LAYOUT_STORAGE_KEY = "mail-panel-layout";
const COLLAPSED_STORAGE_KEY = "mail-panel-collapsed";
const SIDEBAR_COLLAPSED_THRESHOLD = 10;

function getDefaultCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as boolean;
    }
  } catch {
    // ignore
  }
  return false;
}

interface MailProps {
  accounts: Account[];
  mails: MailType[];
  folderCounts: Record<string, number>;
  currentFolder: string;
  onFolderChange: (folder: string) => void;
  onAction: (action: string, mailId: string) => void;
}

export function Mail({
  accounts,
  mails,
  folderCounts,
  currentFolder,
  onFolderChange,
  onAction,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(getDefaultCollapsed());
  const [selectedMailId, setSelectedMailId] = React.useState<string | null>(
    mails[0]?.id ?? null
  );

  const selectedMail = React.useMemo(
    () => mails.find((m) => m.id === selectedMailId) ?? null,
    [mails, selectedMailId]
  );

  const handleFolderSelect = React.useCallback(
    (title: string) => {
      const folder = title.toLowerCase();
      onFolderChange(folder);
      setSelectedMailId(null);
    },
    [onFolderChange]
  );

  const handleSidebarResize = React.useCallback(
    (size: { asPercentage: number; inPixels: number }) => {
      const collapsed = size.asPercentage < SIDEBAR_COLLAPSED_THRESHOLD;
      setIsCollapsed(collapsed);
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));
    },
    []
  );

  const primaryLinks = React.useMemo(
    () => [
      {
        title: "Inbox",
        label: String(folderCounts.inbox ?? 0),
        icon: Inbox,
        variant: (currentFolder === "inbox" ? "default" : "ghost") as
          | "default"
          | "ghost",
      },
      {
        title: "Drafts",
        label: String(folderCounts.drafts ?? 0),
        icon: File,
        variant: (currentFolder === "drafts" ? "default" : "ghost") as
          | "default"
          | "ghost",
      },
      {
        title: "Sent",
        label: String(folderCounts.sent ?? 0),
        icon: Send,
        variant: (currentFolder === "sent" ? "default" : "ghost") as
          | "default"
          | "ghost",
      },
      {
        title: "Junk",
        label: String(folderCounts.junk ?? 0),
        icon: AlertCircle,
        variant: (currentFolder === "junk" ? "default" : "ghost") as
          | "default"
          | "ghost",
      },
      {
        title: "Trash",
        label: String(folderCounts.trash ?? 0),
        icon: Trash2,
        variant: (currentFolder === "trash" ? "default" : "ghost") as
          | "default"
          | "ghost",
      },
      {
        title: "Archive",
        label: String(folderCounts.archive ?? 0),
        icon: Archive,
        variant: (currentFolder === "archive" ? "default" : "ghost") as
          | "default"
          | "ghost",
      },
    ],
    [folderCounts, currentFolder]
  );

  const secondaryLinks = React.useMemo(
    () => [
      {
        title: "Social",
        label: "",
        icon: Users2,
        variant: "ghost" as const,
      },
      {
        title: "Updates",
        label: "",
        icon: AlertCircle,
        variant: "ghost" as const,
      },
      {
        title: "Forums",
        label: "",
        icon: MessagesSquare,
        variant: "ghost" as const,
      },
      {
        title: "Shopping",
        label: "",
        icon: ShoppingCart,
        variant: "ghost" as const,
      },
      {
        title: "Promotions",
        label: "",
        icon: MailIcon,
        variant: "ghost" as const,
      },
    ],
    []
  );

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        className="h-full items-stretch"
        onLayoutChanged={(layout) => {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
        }}
        orientation="horizontal"
      >
        {/* Sidebar */}
        <ResizablePanel
          className={cn(
            isCollapsed &&
              "min-w-[50px] transition-all duration-300 ease-in-out"
          )}
          collapsedSize="4%"
          collapsible
          defaultSize="20%"
          maxSize="20%"
          minSize="15%"
          onResize={handleSidebarResize}
        >
          <div
            className={cn(
              "flex h-[52px] items-center justify-center",
              isCollapsed ? "h-[52px]" : "px-2"
            )}
          >
            <AccountSwitcher accounts={accounts} isCollapsed={isCollapsed} />
          </div>
          <Separator />
          <MailNav
            isCollapsed={isCollapsed}
            links={primaryLinks}
            onSelect={handleFolderSelect}
          />
          <Separator />
          <MailNav isCollapsed={isCollapsed} links={secondaryLinks} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Mail List */}
        <ResizablePanel defaultSize="32%" minSize="30%">
          <MailList
            items={mails}
            onSelect={setSelectedMailId}
            selectedMailId={selectedMailId}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Mail Display */}
        <ResizablePanel defaultSize="48%" minSize="30%">
          <MailDisplay mail={selectedMail} onAction={onAction} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
