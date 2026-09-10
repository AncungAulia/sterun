"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/utils/cn";

/**
 * Added for Sterun. shadcn ships a tabs component; this is it, rebuilt on the
 * tokens the rest of the app paints with rather than pulled in with its own
 * greys, for the same reason the badge variants were.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // A rule under the whole row, so the tabs read as one strip rather than
        // as buttons that happen to be next to each other.
        //
        // `grid-flow-col` with equal columns rather than a flex row: it divides
        // the strip evenly whatever the number of tabs, so the rule underneath
        // is cut into even lengths and nothing has to be measured by hand when
        // a tab is added.
        //
        // `minmax(max-content, 1fr)` rather than Tailwind's `auto-cols-fr`,
        // which is `minmax(0, 1fr)` and therefore lets a track shrink narrower
        // than the word inside it. On a phone that stacked all six labels on
        // top of each other. With a `max-content` floor the strip grows past
        // the screen instead and the parent scrolls it.
        "grid min-w-full grid-flow-col auto-cols-[minmax(max-content,1fr)] items-stretch border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px flex cursor-pointer items-center justify-center gap-2 border-b-2 border-transparent px-3 pb-3 text-base whitespace-nowrap text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-foreground",
        // The icon is wayfinding, so it stays a shade quieter than the label
        // it belongs to until the tab is the one being read.
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-n-400 data-[state=active]:[&_svg]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("pt-8 focus-visible:outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
