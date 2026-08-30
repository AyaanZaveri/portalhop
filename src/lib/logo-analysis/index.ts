"use client"

import { useEffect, useState } from "react"

import { analyse, TARGET, type LogoStyle } from "./algorithm"
import type { Request, Response } from "./worker"

export type { LogoStyle }
export { TILE_BASE, TILE_PAPER } from "./algorithm"

const DB_NAME = "portalhop-logos"
const STORE = "logo_style"

/**
 * Bump whenever the pass changes what it decides or what it draws.
 *
 * The mobile app does the same thing with PRAGMA user_version, and for the same
 * reason: a row is keyed by logo URL alone, so changing the verdict does not
 * change the key and every logo already looked at would keep its old answer
 * forever. Emptying the store is the migration.
 */
const SCHEMA = 3

type Row = {
  url: string
  schema: number
  style: LogoStyle
  /** The redrawn PNG, stored as bytes rather than as an object URL — a URL is
   *  only valid for the document that made it. */
  redrawn?: Blob
}

const PLAIN: LogoStyle = {}

const memory = new Map<string, LogoStyle>()
const inFlight = new Map<string, Promise<LogoStyle>>()

let database: Promise<IDBDatabase | null> | null = null

function open() {
  if (database) return database
  database = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null)
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "url" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
  return database
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const request = run(db.transaction(STORE, mode).objectStore(STORE))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

/**
 * Every decision ever made, read in one pass at startup.
 *
 * The mobile app learned this the hard way: asking per logo means one query per
 * visible row, each resolving a frame or more after that row has painted, so
 * the list appears in its fallback colours and corrects itself a moment later.
 * One scan of a small store finishes before the catalogue does.
 */
let warm: Promise<void> | null = null

function warmUp() {
  if (warm) return warm
  warm = transact<Row[]>("readonly", (store) => store.getAll() as IDBRequest<Row[]>)
    .then((rows) => {
      if (!rows) return
      const stale: string[] = []
      for (const row of rows) {
        if (row.schema !== SCHEMA) {
          stale.push(row.url)
          continue
        }
        memory.set(
          row.url,
          row.redrawn
            ? { ...row.style, uri: URL.createObjectURL(row.redrawn) }
            : row.style,
        )
      }
      if (stale.length) {
        void transact("readwrite", (store) => {
          for (const url of stale.slice(0, -1)) store.delete(url)
          return store.delete(stale[stale.length - 1])
        })
      }
    })
    .catch(() => {})
  return warm
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { url: string; resolve: (response: Response) => void }>()

/**
 * The worker is an optimisation, not a requirement for treating a logo.
 *
 * Some mobile browsers can render an image but cannot decode it through the
 * module worker's OffscreenCanvas path. Use their ordinary DOM canvas as a
 * compatibility path, so they still run the identical `analyse()` pass.
 */
async function analyseOnMainThread(url: string): Promise<Response> {
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" })
    if (!response.ok) return { id: 0, ok: false }

    const objectUrl = URL.createObjectURL(await response.blob())
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = reject
        element.src = objectUrl
      })
      const longest = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = longest > TARGET ? TARGET / longest : 1
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) return { id: 0, ok: false }
      context.drawImage(image, 0, 0, width, height)

      const verdict = analyse(context.getImageData(0, 0, width, height), url)
      if (!verdict.redrawn) return { id: 0, ok: true, style: verdict.style }

      context.putImageData(verdict.redrawn, 0, 0)
      const redrawn = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      )
      return redrawn
        ? { id: 0, ok: true, style: verdict.style, redrawn }
        : { id: 0, ok: false }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return { id: 0, ok: false }
  }
}

function finishOnMainThread(url: string, resolve: (response: Response) => void) {
  void analyseOnMainThread(url).then(resolve)
}

function ensureWorker() {
  if (worker || typeof Worker === "undefined") return worker
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
  } catch {
    return null
  }
  worker.onmessage = (event: MessageEvent<Response>) => {
    const request = pending.get(event.data.id)
    pending.delete(event.data.id)
    if (!request) return
    // A worker decode failure can be a missing OffscreenCanvas or
    // createImageBitmap implementation. Retry through the DOM canvas before
    // deciding that the image itself cannot be treated.
    if (!event.data.ok) {
      finishOnMainThread(request.url, request.resolve)
      return
    }
    request.resolve(event.data)
  }
  worker.onerror = () => {
    worker?.terminate()
    worker = null
    const requests = [...pending.values()]
    pending.clear()
    for (const request of requests) {
      finishOnMainThread(request.url, request.resolve)
    }
  }
  return worker
}

function ask(url: string) {
  return new Promise<Response>((resolve) => {
    const instance = ensureWorker()
    if (!instance) return finishOnMainThread(url, resolve)
    const id = nextId++
    pending.set(id, { url, resolve })
    try {
      instance.postMessage({ id, url } satisfies Request)
    } catch {
      pending.delete(id)
      finishOnMainThread(url, resolve)
    }
  })
}

async function resolveStyle(url: string): Promise<LogoStyle> {
  await warmUp()

  const known = memory.get(url)
  if (known) return known

  const response = await ask(url)
  if (!response.ok) {
    // Nothing is written and nothing is remembered, so the next row to ask for
    // this logo tries again. Storing a failure as "plain" is how two copies of
    // one logo end up disagreeing permanently.
    return PLAIN
  }

  const style: LogoStyle = response.redrawn
    ? { ...response.style, uri: URL.createObjectURL(response.redrawn) }
    : response.style

  memory.set(url, style)
  void transact("readwrite", (store) =>
    store.put({
      url,
      schema: SCHEMA,
      // The object URL is per-document and must not be stored; the bytes are.
      style: response.redrawn ? { ...response.style, uri: undefined } : response.style,
      redrawn: response.redrawn,
    } satisfies Row),
  )

  return style
}

export function logoStyle(url: string) {
  const existing = inFlight.get(url)
  if (existing) return existing
  const task = resolveStyle(url).finally(() => inFlight.delete(url))
  inFlight.set(url, task)
  return task
}

/** The same hook the mobile app has, so both read the same on the call site. */
export function useLogoStyle(url: string | undefined): LogoStyle {
  const [style, setStyle] = useState<LogoStyle>(
    () => (url ? memory.get(url) : undefined) ?? PLAIN,
  )
  const [seen, setSeen] = useState(url)

  // Adjusted during render rather than from an effect: a row handed a new
  // channel while mounted would otherwise show the previous one's treatment for
  // a frame before correcting it.
  if (url !== seen) {
    setSeen(url)
    setStyle((url ? memory.get(url) : undefined) ?? PLAIN)
  }

  useEffect(() => {
    if (!url || memory.has(url)) return
    let cancelled = false
    void logoStyle(url).then((found) => {
      if (!cancelled) setStyle(found)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  return style
}
