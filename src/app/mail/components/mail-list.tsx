import { formatDistanceToNow } from "date-fns";
import { Search } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Mail } from "@/db/schema";
import { cn } from "@/lib/utils";

interface MailListProps {
  items: Mail[];
  selectedMailId: string | null;
  onSelect: (id: string) => void;
}

function getBadgeVariant(
  label: string
): "default" | "outline" | "secondary" | "destructive" {
  if (label === "work") {
    return "default";
  }
  if (label === "personal") {
    return "outline";
  }
  return "secondary";
}

export function MailList({ items, selectedMailId, onSelect }: MailListProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [currentTab, setCurrentTab] = React.useState("all");

  const filteredItems = React.useMemo(() => {
    let result = items;

    if (currentTab === "unread") {
      result = result.filter((item) => !item.read);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.subject.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query)
      );
    }

    return result;
  }, [items, currentTab, searchQuery]);

  return (
    <Tabs defaultValue="all" onValueChange={setCurrentTab} value={currentTab}>
      <div className="flex items-center px-4 py-2">
        <h1 className="font-bold text-xl">Inbox</h1>
        <TabsList className="ml-auto">
          <TabsTrigger className="text-zinc-600 dark:text-zinc-200" value="all">
            All mail
          </TabsTrigger>
          <TabsTrigger
            className="text-zinc-600 dark:text-zinc-200"
            value="unread"
          >
            Unread
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="relative">
            <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              value={searchQuery}
            />
          </div>
        </form>
      </div>

      <TabsContent className="m-0" value="all">
        <MailItemList
          items={filteredItems}
          onSelect={onSelect}
          selectedMailId={selectedMailId}
        />
      </TabsContent>

      <TabsContent className="m-0" value="unread">
        <MailItemList
          items={filteredItems}
          onSelect={onSelect}
          selectedMailId={selectedMailId}
        />
      </TabsContent>
    </Tabs>
  );
}

interface MailItemListProps {
  items: Mail[];
  selectedMailId: string | null;
  onSelect: (id: string) => void;
}

function MailItemList({ items, selectedMailId, onSelect }: MailItemListProps) {
  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {items.map((item) => (
          <button
            className={cn(
              "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
              selectedMailId === item.id && "bg-muted"
            )}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <div className="flex w-full flex-col gap-1">
              <div className="flex items-center">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{item.name}</span>
                  {!item.read && (
                    <span className="flex h-2 w-2 rounded-full bg-blue-600" />
                  )}
                </div>
                <div
                  className={cn(
                    "ml-auto text-xs",
                    selectedMailId === item.id
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                  })}
                </div>
              </div>
              <span className="font-medium text-xs">{item.subject}</span>
            </div>
            <span className="line-clamp-2 text-muted-foreground text-xs">
              {item.body.substring(0, 300)}
            </span>
            {item.labels.length > 0 && (
              <div className="flex items-center gap-2">
                {item.labels.map((label) => (
                  <Badge key={label} variant={getBadgeVariant(label)}>
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
