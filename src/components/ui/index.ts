// Published design system. Changes to anything exported here are additive only.

// Primitives
export { Button, IconButton, buttonVariants, type ButtonProps } from "./button";
export { Field, useFieldControl } from "./field";
export { Input } from "./input";
export { Textarea } from "./textarea";
export { Select, type SelectOption } from "./select";
export { Checkbox, RadioGroup, RadioGroupItem, Switch } from "./choice";
export { Badge, badgeVariants, toneClass, type Tone } from "./badge";
export { StatusBadge, STATUS_KINDS, type StatusKind } from "./status-badge";
export { TierBadge, type TierKind } from "./tier-badge";
export { Chip, InfoChip } from "./chip";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";
export { Alert, type AlertVariant } from "./alert";
export { Dialog, DialogTrigger, DialogClose, DialogContent } from "./dialog";
export { Sheet, SheetTrigger, SheetClose, SheetContent } from "./sheet";
export { Toaster, toast } from "./toast";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
export { DataTable, type Column } from "./table";
export { Skeleton, Progress, Stepper } from "./feedback";
export { EmptyState, Timeline, KeyValueList, PageHeader, Section, type TimelineItem } from "./display";
export { Avatar } from "./avatar";
export { Tooltip, TooltipProvider } from "./tooltip";
export { AppShell, type NavItem } from "./app-shell";
export { ScrollHeader, SignOutButton, SiteMenu } from "./shell-bits";
export { ThemeToggle } from "./theme-toggle";
export { LanguageSwitcher } from "./language-switcher";
export { Providers } from "./providers";

// Premium kit (also importable from "@/components/ui/motion")
export * from "./motion";

// Composites
export { ProposalCard, type Evidence } from "./proposal-card";
export { DiffView, type DiffEntry } from "./diff-view";
export { ImpactChips, type Impact, type ChannelKey } from "./impact-chips";
export { AgentAvatar, AGENT_KEYS, type AgentKey } from "./agent-avatar";
export { CitationChip } from "./citation-chip";
export { DraftedByLabel, type RoleKey } from "./drafted-by-label";
export { TimeRange } from "./time-range";
export { MoneyInr } from "./money-inr";
