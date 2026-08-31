"use client"

import * as React from "react"
import { CalendarIcon, GlobeIcon, GripVerticalIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon, TvIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { TV_MOBILE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/use-media-query"
import { SettingsHeader } from "@/components/settings-header"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { Switch } from "@/components/ui/switch"
import { useUserSettings } from "@/hooks/use-user-settings"
import { apiFetch } from "@/lib/api-fetch"
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable"

const WSRV_LOGO_LIGHT = "/proxy/wsrv-light.svg"
const WSRV_LOGO_DARK = "/proxy/wsrv-dark.svg"

type UserEpgSource = { id: number; name: string; url: string; channelCount: number; refreshedAt: string | null }
export default function EpgAndLogosSettingsPage() {
  const { settings, updateSettings } = useUserSettings()
  const [sources, setSources] = React.useState<UserEpgSource[]>([])
  const [isLoadingSources, setIsLoadingSources] = React.useState(true)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<UserEpgSource | null>(null)
  const [refreshing, setRefreshing] = React.useState<number | "builtin" | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<UserEpgSource | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const loadSources = React.useCallback(async () => {
    try { const custom = await apiFetch("/api/epg-sources", { cache: "no-store" }); const data = await custom.json(); setSources(Array.isArray(data.sources) ? data.sources : []) }
    catch { setSources([]) }
    finally { setIsLoadingSources(false) }
  }, [])
  React.useEffect(() => {
    // Schedule after the initial paint: both loaders update local state once
    // their network work settles, and doing the scheduling itself in the
    // effect avoids a synchronous state cascade on mount.
    const timer = window.setTimeout(() => {
      void loadSources().catch(() => {})
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSources])
  async function refresh(source: UserEpgSource) {
    setRefreshing(source.id)
    try { const res = await apiFetch(`/api/epg-sources/${source.id}/refresh`, { method: "POST" }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setSources((items) => items.map((item) => item.id === source.id ? data.source : item)); toast.success(`${source.name} refreshed.`) } catch (error) { toast.error(error instanceof Error ? error.message : "Could not refresh EPG source.") } finally { setRefreshing(null) }
  }
  async function remove(source: UserEpgSource) {
    setDeleting(true)
    try { const res = await apiFetch(`/api/epg-sources/${source.id}`, { method: "DELETE" }); if (!res.ok) throw new Error(); setSources((items) => items.filter((item) => item.id !== source.id)); toast.success("EPG source deleted."); setPendingDelete(null) }
    catch { toast.error("Could not delete EPG source.") }
    finally { setDeleting(false) }
  }
  function handleUseImageProxyChange(nextUseImageProxy: boolean) {
    updateSettings({ useImageProxy: nextUseImageProxy })
  }
  return <div className="flex flex-col gap-8">
    <SettingsHeader icon={CalendarIcon} title="EPG & Logos" />
    <div className="flex w-full items-center justify-between gap-4 rounded-lg border bg-background/50 p-3">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={WSRV_LOGO_LIGHT}
          alt=""
          className="size-8 shrink-0 dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={WSRV_LOGO_DARK}
          alt=""
          className="hidden size-8 shrink-0 dark:block"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <a
            href="https://wsrv.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-sm font-medium leading-none underline-offset-4 hover:underline"
          >
            Image proxy
          </a>
          <span className="text-xs text-muted-foreground">
            Route channel and EPG logos through wsrv.nl to fix slow, unreliable, or HTTP-only image hosts
          </span>
        </div>
      </div>
      <Switch
        id="use-image-proxy"
        checked={settings.useImageProxy}
        onCheckedChange={handleUseImageProxyChange}
        aria-label="Use image proxy"
      />
    </div>
    <GuideProviderPreference
      sources={sources}
      order={settings.epgProviderOrder}
      onChange={(epgProviderOrder) => updateSettings({ epgProviderOrder })}
    />
    <section className="flex flex-col gap-1 border-t pt-6"><h2 className="text-base font-medium">Built-in EPG</h2><p className="text-sm text-muted-foreground">Programme windows refresh in the background. Channel matching uses a compact local directory generated from IPTV-EPG’s XMLTV database instead of parsing guides on demand.</p></section>
    <section className="flex flex-col gap-3 border-t pt-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-medium">Custom EPG sources</h2><p className="text-sm text-muted-foreground">Reusable XMLTV sources for your portals.</p></div><Button size="sm" onClick={() => { setEditing(null); setSheetOpen(true) }}><PlusIcon />Add source</Button></div>
      {isLoadingSources ? <div className="flex items-center gap-2 px-1 py-3 text-sm"><Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" /><ShimmeringText text="Loading EPG sources." /></div> : sources.length ? <div className="flex flex-col">{sources.map((source) => {
        const isBusy = refreshing === source.id
        return <div key={source.id} className="group/source -mx-2 flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-accent/50">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary brightness-85 dark:brightness-100"><TvIcon className="size-4" /></div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"><span className="w-full truncate text-sm font-medium">{source.name}</span><span className="w-full truncate text-xs text-muted-foreground">{source.channelCount.toLocaleString()} {source.channelCount === 1 ? "channel" : "channels"}{source.refreshedAt ? ` · ${new Date(source.refreshedAt).toLocaleDateString(undefined, { dateStyle: "long" })}` : " · Not refreshed"}</span></div>
          <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" disabled={isBusy} aria-label={`More actions for ${source.name}`}>{isBusy ? <Loader2Icon className="size-4 animate-spin" /> : <MoreHorizontalIcon className="size-4" />}</Button>} /><DropdownMenuContent align="end" className="w-52! shadow-2xl shadow-primary/15"><DropdownMenuItem onClick={() => { setEditing(source); setSheetOpen(true) }}><PencilIcon className="size-4" />Edit source</DropdownMenuItem><DropdownMenuItem onClick={() => refresh(source)}><RefreshCwIcon className="size-4" />Refresh source</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setPendingDelete(source)}><Trash2Icon className="size-4" />Delete source</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      })}</div> : <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-5 text-sm text-muted-foreground"><GlobeIcon className="size-5" />Add an XMLTV URL once, then assign it to any portal.</div>}
    </section>
    <EpgSourceSheet open={sheetOpen} onOpenChange={setSheetOpen} source={editing} onSaved={(source) => { setSources((items) => editing ? items.map((item) => item.id === source.id ? source : item) : [source, ...items]); setSheetOpen(false) }} />
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete EPG source?</AlertDialogTitle><AlertDialogDescription>{pendingDelete ? `Delete ${pendingDelete.name}? Portals using it will have no EPG until you choose another source.` : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><Button type="button" variant="destructive" disabled={deleting} onClick={() => pendingDelete && remove(pendingDelete)}>{deleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}{deleting ? "Deleting…" : "Delete source"}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>
}

function EpgSourceSheet({ open, onOpenChange, source, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; source: UserEpgSource | null; onSaved: (source: UserEpgSource) => void }) {
  const isMobileLayout = useMediaQuery(TV_MOBILE_LAYOUT_QUERY, true)
  const [name, setName] = React.useState(""); const [url, setUrl] = React.useState(""); const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(source?.name ?? ""); setUrl(source?.url ?? "")
    }
  }, [open, source])
  async function save() { setSaving(true); try { const res = await apiFetch(source ? `/api/epg-sources/${source.id}` : "/api/epg-sources", { method: source ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, url }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); onSaved(data.source); toast.success(data.refreshError ? "Saved, but the first refresh failed." : "EPG source saved.") } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save EPG source.") } finally { setSaving(false) } }
  return <Drawer open={open} onOpenChange={onOpenChange} swipeDirection={isMobileLayout ? "down" : "left"} showSwipeHandle={isMobileLayout}>
    <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl dark:border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh]">
      <DrawerHeader>
        <div className="flex min-w-0 flex-col gap-0.5 pr-8">
          <DrawerTitle className="flex items-center gap-1.5">
            <TvIcon className="size-4 text-primary brightness-75 dark:brightness-100 -mt-0.5" />
            EPG Source
          </DrawerTitle>
        </div>
      </DrawerHeader>
      <ScrollArea className="min-h-0 flex-1" viewportTabIndex={-1} viewportClassName="px-4 pb-4">
        <div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="epg-name">Name</FieldLabel>
              <Input id="epg-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Provider EPG" />
            </Field>
            <Field>
              <FieldLabel htmlFor="epg-url">XMLTV URL</FieldLabel>
              <Input id="epg-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/guide.xml.gz" />
              <FieldDescription>URLs and embedded credentials are encrypted at rest.</FieldDescription>
            </Field>
          </FieldGroup>
        </div>
      </ScrollArea>
      <DrawerFooter className="mt-0 flex-row! justify-end gap-2 border-t px-4 pt-4">
        <Button onClick={save} disabled={saving || !name.trim() || !url.trim()} className="cursor-pointer">
          {saving ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save source"}
        </Button>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
}
/**
 * Which kind of guide wins when a channel's sources offer more than one.
 *
 * About kinds rather than about sources, and that is the whole reason it can be
 * one short global list. Guide quality is a property of a source *for a given
 * channel* -- a portal with excellent listings for its own region has none for
 * a channel it merely resells -- so a ranking of sources would be right for
 * half a catalogue and quietly wrong for the other half.
 *
 * Nothing here writes a per-channel answer. Channels are resolved against this
 * order every time, so changing it re-decides the whole catalogue at once,
 * except for the ones somebody pinned by hand in the sources drawer. Those are
 * the only guide choices stored anywhere.
 */
function GuideProviderPreference({ sources, order, onChange }: {
  sources: UserEpgSource[]
  order: string[]
  onChange: (order: string[]) => void
}) {
  const providers = [
    { id: "iptv-org", name: "Built-in EPG", detail: "iptv-epg.org" },
    ...sources.map((source) => ({ id: `custom:${source.id}`, name: source.name, detail: "Custom XMLTV" })),
  ]
  const ids = new Set(providers.map((provider) => provider.id))
  const resolved = [
    ...order.filter((id) => ids.has(id)),
    ...providers.map((provider) => provider.id).filter((id) => !order.includes(id)),
  ]
  const items = resolved.map((id) => providers.find((provider) => provider.id === id)!)

  return <section className="flex flex-col gap-3">
    <div><h2 className="text-base font-medium">Guide providers</h2><p className="text-sm text-muted-foreground">Automatic matching uses the highest provider that contains the channel’s XMLTV ID. Portal guides are used only when no ranked XMLTV provider can match it.</p></div>
    <Sortable value={items} getItemValue={(item) => item.id} onValueChange={(next) => onChange(next.map((item) => item.id))} className="flex flex-col gap-2">
      {items.map((provider, index) => <SortableItem key={provider.id} value={provider.id} className="rounded-lg border bg-background">
        <SortableItemHandle className="flex cursor-grab items-center gap-3 p-3 active:cursor-grabbing">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-xs font-medium text-primary tabular-nums">{index + 1}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"><span className="truncate text-sm font-medium">{provider.name}</span><span className="truncate text-xs text-muted-foreground">{provider.detail}</span></span>
          <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
        </SortableItemHandle>
      </SortableItem>)}
    </Sortable>
  </section>
}
