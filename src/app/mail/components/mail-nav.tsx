import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavLink {
  title: string;
  label?: string;
  icon: LucideIcon;
  variant: "default" | "ghost";
}

interface MailNavProps {
  isCollapsed: boolean;
  links: NavLink[];
  onSelect?: (title: string) => void;
}

export function MailNav({ isCollapsed, links, onSelect }: MailNavProps) {
  return (
    <div
      className={cn("flex flex-col gap-1", isCollapsed && "items-center")}
      data-collapsed={isCollapsed}
    >
      <nav className="grid gap-1 px-2">
        {isCollapsed
          ? links.map((link) => (
              <Tooltip key={link.title}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      buttonVariants({
                        variant: link.variant,
                        size: "icon",
                      }),
                      "h-9 w-9",
                      link.variant === "default" &&
                        "dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white"
                    )}
                    onClick={() => onSelect?.(link.title)}
                    type="button"
                  >
                    <link.icon className="h-4 w-4" />
                    <span className="sr-only">{link.title}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  className="flex items-center gap-4"
                  side="right"
                >
                  {link.title}
                  {link.label ? (
                    <span className="ml-auto text-muted-foreground">
                      {link.label}
                    </span>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            ))
          : links.map((link) => (
              <button
                className={cn(
                  buttonVariants({
                    variant: link.variant,
                    size: "sm",
                  }),
                  "justify-start",
                  link.variant === "default" &&
                    "dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white"
                )}
                key={link.title}
                onClick={() => onSelect?.(link.title)}
                type="button"
              >
                <link.icon className="mr-2 h-4 w-4" />
                {link.title}
                {link.label ? (
                  <span
                    className={cn(
                      "ml-auto",
                      link.variant === "default" &&
                        "text-background dark:text-white"
                    )}
                  >
                    {link.label}
                  </span>
                ) : null}
              </button>
            ))}
      </nav>
    </div>
  );
}
