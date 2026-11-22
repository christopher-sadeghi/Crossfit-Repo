"use client";

import { useState, type ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AthleteTabGroup = {
  label: string;
  tabs: readonly { value: string; label: string }[];
};

export function AthleteTabNav({
  children,
  groups,
  initialTab,
}: {
  children: ReactNode;
  groups: readonly AthleteTabGroup[];
  initialTab: string;
}) {
  const [value, setValue] = useState(initialTab);
  const activeGroup = groups.find((group) => group.tabs.some((tab) => tab.value === value)) ?? groups[0];

  const selectTab = (nextValue: string) => {
    setValue(nextValue);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextValue);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <Tabs value={value} onValueChange={selectTab} className="gap-0">
      {activeGroup && (
        <>
          <div className={`max-w-full overflow-x-auto md:overflow-visible ${activeGroup.tabs.length > 1 ? "mb-3" : "mb-4"}`}>
            <div
              role="group"
              aria-label="Athlete sections"
              className="grid w-max min-w-full auto-cols-max grid-flow-col gap-2 md:w-full md:grid-cols-5 md:grid-flow-row"
            >
              {groups.map((group) => {
                const selected = group === activeGroup;
                return (
                  <button
                    key={group.label}
                    type="button"
                    aria-pressed={selected}
                    className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    onClick={() => {
                      const firstTab = group.tabs[0];
                      if (firstTab) selectTab(firstTab.value);
                    }}
                  >
                    {group.label}
                  </button>
                );
              })}
            </div>
          </div>
          {activeGroup.tabs.length > 1 && (
            <div className="mb-4 max-w-full overflow-x-auto md:overflow-visible">
              <TabsList aria-label={`${activeGroup.label} pages`} className="min-w-max md:min-w-0">
                {activeGroup.tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}
        </>
      )}
      {children}
    </Tabs>
  );
}
