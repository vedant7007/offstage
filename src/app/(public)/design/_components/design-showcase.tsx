"use client";

import * as React from "react";
import {
  CalendarDays,
  Ellipsis,
  House,
  Inbox,
  MessageCircle,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import {
  AgentAvatar,
  AGENT_KEYS,
  Alert,
  AppShell,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Chip,
  CitationChip,
  DataTable,
  DialogContent,
  Dialog,
  DialogClose,
  DialogTrigger,
  DiffView,
  DraftedByLabel,
  EmptyState,
  Field,
  IconButton,
  ImpactChips,
  Input,
  KeyValueList,
  LanguageSwitcher,
  MoneyInr,
  PageHeader,
  Progress,
  ProposalCard,
  RadioGroup,
  RadioGroupItem,
  Section,
  Select,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
  STATUS_KINDS,
  StatusBadge,
  Stepper,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ThemeToggle,
  TierBadge,
  TimeRange,
  Timeline,
  toast,
  Tooltip,
  type Column,
} from "@/components/ui";
import {
  ConfirmBurst,
  Kicker,
  LivePulse,
  Magnetic,
  NumberTicker,
  PREMIUM_KIT,
  SkeletonCard,
  SpotlightCard,
  TextReveal,
  Tilt,
} from "@/components/ui/motion";
import { useT } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/translate";
import {
  sampleCitation,
  sampleEvent,
  sampleExpense,
  sampleProposal,
  sampleSessions,
  sampleSimulated,
  sampleTimeline,
} from "./samples";

const COLOR_TOKENS = [
  ["bg", "fg"],
  ["surface", "fg"],
  ["surface-sunken", "fg"],
  ["curtain", "on-curtain"],
  ["curtain-soft", "curtain-soft-fg"],
  ["agent", "on-agent"],
  ["agent-soft", "agent-soft-fg"],
  ["approved-soft", "approved-soft-fg"],
  ["pending-soft", "pending-soft-fg"],
  ["info-soft", "info-soft-fg"],
  ["neutral-soft", "neutral-soft-fg"],
  ["danger-soft", "danger-soft-fg"],
  ["emergency", "on-emergency"],
  ["emergency-soft", "emergency-soft-fg"],
] as const;

const TYPE_SCALE = [
  ["text-4xl", "48"],
  ["text-3xl", "36"],
  ["text-2xl", "28"],
  ["text-xl", "22"],
  ["text-lg", "18"],
  ["text-base", "16"],
  ["text-sm", "14"],
  ["text-xs", "12"],
] as const;

type SampleSession = (typeof sampleSessions)[number];
type SampleKey = keyof Messages["design"]["samples"];

export function DesignShowcase({ embedded }: { embedded: boolean }) {
  const t = useT();
  const [width, setWidth] = React.useState<"full" | "phone">("full");
  const s = (key: SampleKey, vars?: Record<string, string>) => t(`design.samples.${key}`, vars);

  const header = (
    <PageHeader
      title={t("design.title")}
      description={t("design.intro")}
      actions={
        embedded ? undefined : (
          <>
            <LanguageSwitcher />
            <ThemeToggle />
          </>
        )
      }
    />
  );

  if (!embedded && width === "phone") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        {header}
        <WidthPicker width={width} onChange={setWidth} />
        <iframe
          title={t("design.widthPhone")}
          src="/design?embed=1"
          className="mx-auto mt-6 block h-[80dvh] w-[360px] rounded-card border-2 border-border-strong bg-bg"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8">
      <div>
        {header}
        {!embedded ? <WidthPicker width={width} onChange={setWidth} /> : null}
        <Alert variant="info" title={t("common.sampleData")} className="mt-4" />
      </div>

      <BackstageSamples />
      <PremiumKit />

      <Section id="tokens" title={t("design.sections.tokens")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {COLOR_TOKENS.map(([bg, fg]) => (
            <li
              key={bg}
              className="flex min-h-20 flex-col justify-end rounded-control border border-border p-3 text-sm"
              style={{ background: `var(--${bg})`, color: `var(--${fg})` }}
            >
              <span className="font-semibold">--{bg}</span>
              <span className="font-mono text-xs">--{fg}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title={t("design.sections.type")}>
        <ul className="flex flex-col gap-2">
          {TYPE_SCALE.map(([cls, px]) => (
            <li key={cls} className="flex items-baseline gap-4">
              <span className="w-12 shrink-0 font-mono text-xs text-fg-muted">{px}</span>
              <span className={`${cls} truncate`}>{sampleEvent.name} · कार्यक्रम</span>
            </li>
          ))}
          <li className="flex items-baseline gap-4">
            <span className="w-12 shrink-0 font-mono text-xs text-fg-muted">display</span>
            <span className="truncate font-display text-3xl font-medium tracking-[-0.03em]">
              {sampleEvent.name} · उत्सव
            </span>
          </li>
          <li className="flex items-baseline gap-4">
            <span className="w-12 shrink-0 font-mono text-xs text-fg-muted">mono</span>
            <span className="truncate font-mono text-base">T2 · 10:30 IST · 320 / 320</span>
          </li>
        </ul>
      </Section>

      <Section id="buttons" title={t("design.sections.buttons")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{s("save")}</Button>
          <Button variant="secondary">{s("reject")}</Button>
          <Button variant="ghost">{s("undo")}</Button>
          <Button variant="destructive">
            <Trash2 aria-hidden />
            {s("delete")}
          </Button>
          <Button variant="link">{s("settings")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{s("approve")}</Button>
          <Button size="md">{s("approve")}</Button>
          <Button size="lg">{s("approve")}</Button>
          <Button loading>{s("saving")}</Button>
          <Button disabled>{s("approve")}</Button>
          <IconButton label={s("settings")} icon={<Settings aria-hidden />} variant="secondary" />
          <IconButton label={s("settings")} icon={<Settings aria-hidden />} loading />
        </div>
      </Section>

      <Section id="forms" title={t("design.sections.forms")}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label={s("name")} hint={s("nameHint")} required>
              <Input autoComplete="name" defaultValue="Sneha Reddy" />
            </Field>
            <Field label={s("email")} error={s("emailError")} required>
              <Input type="email" autoComplete="email" defaultValue="sneha@" />
            </Field>
            <Field label={s("year")}>
              <Select
                options={[
                  { value: "1", label: s("year1") },
                  { value: "2", label: s("year2") },
                  { value: "3", label: s("year3") },
                  { value: "4", label: s("year4"), disabled: true },
                ]}
              />
            </Field>
            <Field label={s("notes")} hint={s("notesHint")}>
              <Textarea />
            </Field>
            <Field label={s("email")}>
              <Input disabled defaultValue="locked@college.edu" />
            </Field>
          </div>
          <div className="flex flex-col gap-4">
            <RadioGroup legend={s("food")} defaultValue="veg">
              <RadioGroupItem value="veg" label={s("foodVeg")} />
              <RadioGroupItem value="nonveg" label={s("foodNonVeg")} />
              <RadioGroupItem value="jain" label={s("foodJain")} disabled />
            </RadioGroup>
            <Checkbox label={s("consent")} defaultChecked />
            <Checkbox label={s("consent")} />
            <Switch label={s("reminders")} defaultChecked />
            <Switch label={s("reminders")} disabled />
            <div className="flex flex-wrap gap-2">
              <FilterChips labels={[s("chipAll"), s("chipAi"), s("chipWeb"), s("chipHardware")]} />
            </div>
          </div>
        </div>
      </Section>

      <Section id="badges" title={t("design.sections.badges")}>
        <div className="flex flex-wrap gap-2">
          {STATUS_KINDS.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier="T0" />
          <TierBadge tier="T1" />
          <TierBadge tier="T2" />
          <TierBadge tier="T3" />
          <TierBadge tier="T3" showMeaning />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["neutral", "curtain", "agent", "approved", "pending", "info", "danger", "outline"] as const).map(
            (tone) => (
              <Badge key={tone} tone={tone}>
                {s("badge")}
              </Badge>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {AGENT_KEYS.map((agent) => (
            <AgentAvatar key={agent} agent={agent} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <AgentAvatar agent="helpdesk" showName />
          <AgentAvatar agent="commander" size="lg" showName />
          <Avatar name="Sneha Reddy" />
          <Avatar name="Ravi Kumar" size="lg" />
        </div>
      </Section>

      <Section id="feedback" title={t("design.sections.feedback")}>
        <div className="grid gap-3">
          <Alert variant="info" title={s("alertInfoTitle")}>
            {s("alertInfoBody")}
          </Alert>
          <Alert variant="warning" title={s("alertWarningTitle")}>
            {s("alertWarningBody")}
          </Alert>
          <Alert
            variant="danger"
            title={s("alertDangerTitle")}
            action={
              <Button size="sm" variant="secondary">
                {t("common.retry")}
              </Button>
            }
          >
            {s("alertDangerBody")}
          </Alert>
          <Alert variant="emergency" title={s("alertEmergencyTitle")}>
            {s("alertEmergencyBody")}
          </Alert>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success(s("toastSaved"))}>
            {s("toastSuccess")}
          </Button>
          <Button variant="secondary" onClick={() => toast.info(s("toastInfoText"))}>
            {s("toastInfo")}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Progress
            label={t("design.samples.kvCapacity")}
            value={sampleEvent.seatsTaken}
            max={sampleEvent.capacity}
          />
          <Progress label={t("design.samples.alertWarningTitle")} value={92} tone="pending" />
        </div>
        <Stepper
          steps={[s("stepDetails"), s("stepChoices"), s("stepConsent"), s("stepVerify")]}
          current={1}
        />
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </Section>

      <Section id="overlays" title={t("design.sections.overlays")}>
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{s("dialogOpen")}</Button>
            </DialogTrigger>
            <DialogContent
              title={s("dialogTitle")}
              description={s("dialogBody")}
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="secondary">{t("common.cancel")}</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>{s("approve")}</Button>
                  </DialogClose>
                </>
              }
            />
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">{s("sheetOpen")}</Button>
            </SheetTrigger>
            <SheetContent title={s("sheetTitle")} description={s("sheetBody")}>
              <div className="flex flex-wrap gap-2">
                <FilterChips labels={[s("chipAll"), s("chipAi"), s("chipWeb"), s("chipHardware")]} />
              </div>
            </SheetContent>
          </Sheet>
          <Tooltip content={s("tooltipText")}>
            <Button variant="ghost">{s("tooltipTrigger")}</Button>
          </Tooltip>
        </div>
      </Section>

      <Section id="data" title={t("design.sections.data")}>
        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">{s("tabSchedule")}</TabsTrigger>
            <TabsTrigger value="speakers">{s("tabSpeakers")}</TabsTrigger>
            <TabsTrigger value="faq">{s("tabFaq")}</TabsTrigger>
          </TabsList>
          {(["tabSchedule", "tabSpeakers", "tabFaq"] as const).map((tab) => (
            <TabsContent
              key={tab}
              value={tab === "tabSchedule" ? "schedule" : tab === "tabSpeakers" ? "speakers" : "faq"}
            >
              <p className="text-fg-muted">{s("tabBody", { tab: s(tab) })}</p>
            </TabsContent>
          ))}
        </Tabs>
        <DataTable<SampleSession>
          caption={s("tableCaption")}
          rows={[...sampleSessions]}
          rowKey={(r) => r.id}
          columns={
            [
              { key: "title", header: s("colSession"), cell: (r) => r.title, primary: true },
              { key: "room", header: s("colRoom"), cell: (r) => r.room },
              { key: "time", header: s("colTime"), cell: (r) => <TimeRange start={r.start} end={r.end} /> },
              { key: "status", header: s("colStatus"), cell: (r) => <StatusBadge status={r.status} /> },
            ] satisfies Column<SampleSession>[]
          }
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Timeline
            items={sampleTimeline.map((item) => ({
              id: item.id,
              title: item.title,
              marker: <AgentAvatar agent={item.agent} size="sm" />,
              time: <TimeRange start={item.time} end={item.time} showZone={false} />,
            }))}
          />
          <KeyValueList
            items={[
              { label: s("kvEvent"), value: sampleEvent.name },
              { label: s("kvVenue"), value: sampleEvent.venue },
              {
                label: s("colTime"),
                value: <TimeRange start={sampleEvent.start} end={sampleEvent.end} withDate />,
              },
              { label: s("kvCapacity"), value: `${sampleEvent.seatsTaken} / ${sampleEvent.capacity}` },
              { label: s("kvBudget"), value: <MoneyInr amount={sampleEvent.budget} /> },
            ]}
          />
        </div>
        <EmptyState
          icon={<Inbox />}
          title={s("emptyTitle")}
          description={s("emptyBody")}
          action={
            <Button variant="secondary" size="sm">
              <RefreshCw aria-hidden />
              {s("emptyAction")}
            </Button>
          }
        />
      </Section>

      <Section id="layout" title={t("design.sections.layout")}>
        <Card>
          <CardHeader>
            <CardTitle>{s("pageTitle")}</CardTitle>
            <CardDescription>{s("pageDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p>{s("sectionDescription")}</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">{s("approve")}</Button>
            <Button size="sm" variant="ghost">
              {t("common.more")}
            </Button>
          </CardFooter>
        </Card>
        <div className="h-[28rem] overflow-hidden rounded-card border-2 border-border-strong [transform:translateZ(0)]">
          <AppShell
            title={s("shellTitle")}
            homeHref="/design"
            preview
            actions={<ThemeToggle />}
            nav={[
              { href: "/design", label: s("shellHome"), icon: <House aria-hidden /> },
              { href: "/design/schedule", label: s("shellSchedule"), icon: <CalendarDays aria-hidden /> },
              { href: "/design/chat", label: s("shellChat"), icon: <MessageCircle aria-hidden />, badge: 3 },
              { href: "/design/more", label: s("shellMore"), icon: <Ellipsis aria-hidden /> },
            ]}
          >
            <p className="text-fg-muted">{s("shellBody")}</p>
          </AppShell>
        </div>
      </Section>

      <Section id="composites" title={t("design.sections.composites")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ProposalCard
            {...sampleProposal}
            status="pending"
            tier="T2"
            meta={<TimeRange start="2026-10-24T04:12:00.000Z" end="2026-10-24T04:12:00.000Z" />}
            actions={
              <>
                <Button size="sm">{s("approve")}</Button>
                <Button size="sm" variant="secondary">
                  {s("reject")}
                </Button>
              </>
            }
          />
          <div className="flex flex-col gap-4">
            <ProposalCard {...sampleSimulated} status="simulated" tier="T2" />
            <ProposalCard {...sampleExpense} status="approved" tier="T3" />
          </div>
        </div>
        <DiffView diff={sampleProposal.diff} labels={sampleProposal.diffLabels} />
        <ImpactChips impact={sampleProposal.impact} />
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
          <p>{sampleCitation.snippet}</p>
          <div className="flex flex-wrap gap-2">
            <CitationChip {...sampleCitation} />
          </div>
          <DraftedByLabel approvedBy="lead" />
          <DraftedByLabel />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <MoneyInr amount={sampleEvent.budget} className="text-xl font-semibold" />
          <MoneyInr amount={sampleEvent.budget} compact />
          <TimeRange start={sampleSessions[1].start} end={sampleSessions[1].end} withDate />
        </div>
      </Section>

      {!embedded ? (
        <Section id="compare" title={t("design.compare")}>
          <div className="grid gap-4 lg:grid-cols-2">
            {(["light", "dark"] as const).map((theme) => (
              <div
                key={theme}
                className={`${theme} flex flex-col gap-3 rounded-card border border-border bg-bg p-4 text-fg`}
              >
                <p className="font-semibold">{t(`theme.${theme}`)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm">{s("approve")}</Button>
                  <Button size="sm" variant="secondary">
                    {s("reject")}
                  </Button>
                  <Button size="sm" variant="destructive">
                    {s("delete")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_KINDS.slice(0, 8).map((status) => (
                    <StatusBadge key={status} status={status} />
                  ))}
                </div>
                <Alert variant="warning" title={s("alertWarningTitle")} />
                <Alert variant="emergency" title={s("alertEmergencyTitle")} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/** The Backstage look in one place: kicker, pill buttons, cards and tier chips. English only, a review aid. */
function BackstageSamples() {
  return (
    <Section id="backstage" title="Backstage samples">
      <div className="flex flex-col gap-3">
        <p className="kicker flex items-center gap-3 text-curtain-text">
          Cue 01
          <span aria-hidden className="h-px w-10 bg-current" />
        </p>
        <p className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">The show goes on.</p>
        <p className="kicker text-fg-muted">Kicker: mono, 12 px, tracked, uppercase</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button>Enter live demo</Button>
        <Button variant="secondary">See the attendee side</Button>
        <Button variant="ghost">About our AI</Button>
        <span className="inline-flex min-h-11 items-center rounded-full bg-[#c1ff00] px-4 text-sm font-medium text-black">
          Lime is a fill, never text
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-6 depth-2">
          <p className="kicker text-fg-muted">Static card</p>
          <p className="text-xl font-medium tracking-[-0.015em]">18 px radius, hairline border</p>
          <p className="text-sm text-fg-muted">Soft long shadow. No lift, because it does nothing.</p>
        </div>
        <PickCard />
        <div className="dark grain relative isolate flex flex-col gap-2 rounded-card bg-bg p-6 text-fg depth-3 before:-z-10">
          <p className="kicker text-curtain-text">Ink stage</p>
          <p className="text-xl font-medium tracking-[-0.015em]">A nested dark panel</p>
          <p className="text-sm text-fg-muted">Tokens flip inside it, in both themes.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["T0", "T1", "T2", "T3"] as const).map((tier) => (
          <TierBadge key={tier} tier={tier} showMeaning />
        ))}
      </div>
    </Section>
  );
}

/** Interactive card built from the kit utilities: the app-wide PointerFx drives the spotlight. */
function PickCard() {
  const [picked, setPicked] = React.useState(false);
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={() => setPicked((v) => !v)}
      className="spot spot-edge lift press flex flex-col gap-2 rounded-card border border-border bg-surface p-6 text-left depth-2 aria-pressed:border-curtain"
    >
      <span className="kicker text-fg-muted">Interactive card</span>
      <span className="text-xl font-medium tracking-[-0.015em]">Spotlight and lift</span>
      <span className="text-sm text-fg-muted">
        {picked ? "Selected. Click again to clear." : "Hover, or press to select."}
      </span>
    </button>
  );
}

/**
 * Every premium kit piece, live. English only, a review aid. Each demo is the real component, so what
 * looks right here looks right in the app.
 */
function PremiumKit() {
  const [run, setRun] = React.useState(0);
  const [live, setLive] = React.useState(318);
  const [approved, setApproved] = React.useState(0);
  return (
    <Section
      id="premium"
      title="Premium kit"
      description="Motion and depth primitives from components/ui/motion. One or two signature moments per page, everything else quiet."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Demo name="TextReveal" note="Words rise out of a mask. One per page, on the h1.">
          <TextReveal
            key={run}
            as="p"
            text="The show goes on."
            className="text-4xl font-medium tracking-[-0.03em] [&_.tr-inner]:text-fade"
          />
          <Button size="sm" variant="secondary" onClick={() => setRun((n) => n + 1)}>
            Replay
          </Button>
        </Demo>

        <Demo name="NumberTicker" note="Count up on enter, or roll only the digits that change.">
          <div className="flex items-baseline gap-6">
            <NumberTicker value={124580} className="text-4xl font-medium tracking-[-0.04em]" />
            <NumberTicker value={live} mode="roll" className="font-mono text-4xl tracking-[-0.04em]" />
          </div>
          <Button size="sm" variant="secondary" onClick={() => setLive((n) => n + 7)}>
            Add 7 check-ins
          </Button>
        </Demo>

        <Demo name="Magnetic" note="The one primary action leans toward the cursor and springs back.">
          <Magnetic>
            <Button size="lg">Register now</Button>
          </Magnetic>
        </Demo>

        <Demo name="SpotlightCard" note="Cursor spotlight and a border that lights up near it.">
          <SpotlightCard className="flex w-full flex-col gap-1">
            <span className="kicker text-fg-muted">10:30 IST</span>
            <span className="text-lg font-medium">Opening keynote</span>
          </SpotlightCard>
        </Demo>

        <Demo name="Tilt" note="The attendee pass leans with a soft glare. One sheen sweep on touch.">
          <Tilt className="dark w-full">
            <div className="edge flex items-center gap-4 rounded-card bg-bg p-5 text-fg depth-3">
              <span className="relative z-2 grid size-14 shrink-0 grid-cols-3 gap-1 rounded-inner bg-white p-2">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className={i % 2 ? "bg-white" : "bg-black"} />
                ))}
              </span>
              <span className="flex flex-col gap-1">
                <span className="kicker text-curtain-text">Pass</span>
                <span className="font-medium">Sneha Reddy</span>
              </span>
            </div>
          </Tilt>
        </Demo>

        <Demo
          name="LivePulse and ConfirmBurst"
          note="A pulse always next to the word Live. Rays on approve only."
        >
          <span className="inline-flex items-center gap-2.5 text-sm font-medium">
            <LivePulse />
            Live
          </span>
          <span className="relative inline-grid">
            <Button size="sm" onClick={() => setApproved((n) => n + 1)}>
              Approve
            </Button>
            {approved ? <ConfirmBurst key={approved} /> : null}
          </span>
        </Demo>

        <Demo name="Skeletons" note="Loading in the shape of the content. Nothing shows for fast loads.">
          <SkeletonCard className="w-full" />
        </Demo>

        <Demo name="Depth" note="Light, not boxes: an inner highlight and soft long shadows.">
          <div className="grid w-full grid-cols-3 gap-3">
            {(["depth-1", "depth-2", "depth-3"] as const).map((d) => (
              <span
                key={d}
                className={`${d} flex h-20 items-end rounded-inner border border-border bg-surface p-2 font-mono text-xs text-fg-muted`}
              >
                {d}
              </span>
            ))}
          </div>
        </Demo>

        <Demo name="edge and edge-live" note="Gradient hairline on key cards; one moving border per page.">
          <div className="grid w-full grid-cols-2 gap-3">
            <span className="edge flex h-20 items-end rounded-inner bg-surface p-2 font-mono text-xs text-fg-muted">
              edge
            </span>
            <span className="edge edge-live flex h-20 items-end rounded-inner bg-surface p-2 font-mono text-xs text-fg-muted">
              edge-live
            </span>
          </div>
        </Demo>
      </div>

      <div className="flex flex-col gap-3">
        <Kicker>Reference</Kicker>
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {PREMIUM_KIT.map((k) => (
            <li key={k.name} className="flex flex-col gap-0.5 border-b border-border py-3">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-sm font-medium">{k.name}</span>
                <span className="kicker text-fg-muted">{k.kind}</span>
              </span>
              <span className="text-sm text-fg-muted">{k.use}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Demo({ name, note, children }: { name: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 depth-1 md:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm font-medium">{name}</h3>
        <p className="text-sm text-pretty text-fg-muted">{note}</p>
      </div>
      <div className="flex flex-1 flex-col items-start justify-center gap-4">{children}</div>
    </div>
  );
}

function WidthPicker({
  width,
  onChange,
}: {
  width: "full" | "phone";
  onChange: (w: "full" | "phone") => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t("design.width")} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-fg-muted" aria-hidden>
        {t("design.width")}
      </span>
      <Chip selected={width === "full"} onClick={() => onChange("full")}>
        {t("design.widthFull")}
      </Chip>
      <Chip selected={width === "phone"} onClick={() => onChange("phone")}>
        {t("design.widthPhone")}
      </Chip>
    </div>
  );
}

function FilterChips({ labels }: { labels: string[] }) {
  const [selected, setSelected] = React.useState(0);
  return (
    <>
      {labels.map((label, i) => (
        <Chip
          key={label}
          selected={selected === i}
          onClick={() => setSelected(i)}
          count={i === 0 ? undefined : 4 + i}
        >
          {label}
        </Chip>
      ))}
    </>
  );
}
