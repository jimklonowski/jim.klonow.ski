// A PDF drawn to canvases, for the in-app viewer (app/components/PdfViewer.vue). Loaded lazily,
// only when a source document is opened: pdf.js is about 0.5 MB plus a 1.3 MB worker, both served
// from this site's own assets (the CSP's worker-src allows no other origin). The legacy build is
// the one that runs on older Safari. A home-screen app has no browser chrome, so a PDF opened as
// a plain link left no way back — which is why the pages are drawn inside the app instead.
import { getDocument, GlobalWorkerOptions, RenderingCancelledException, version } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { pageScale, pdfAssetUrls } from '#shared/utils/pdfLayout'

GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfMount {
  /** The element the pages are appended to. */
  container: HTMLElement
  /** The element that scrolls them: a page holds pixels only while it is in or near this one's view. */
  scroller: HTMLElement
  /** The width of a page at fit, in CSS pixels. */
  width: number
  cancelled: () => boolean
  /** A page pdf.js could not draw (the others carry on). */
  onError?: (page: number, err: unknown) => void
}

export interface OpenPdf {
  pages: number
  /** Lays every page out in `container` and draws the ones in or near view; the rest follow the scroll. */
  renderInto: (mount: PdfMount) => Promise<void>
  /** Stops any drawing, gives every canvas's memory back and closes the document. */
  destroy: () => void
}

interface Slot {
  n: number
  canvas: HTMLCanvasElement
  baseWidth: number
  baseHeight: number
  /** In or near view: it should hold its pixels. */
  wanted: boolean
  drawn: boolean
  task: RenderTask | null
}

/** Dropping a canvas does not free its pixels on iOS until some later collection; a zero size does, now. */
function release(slot: Slot) {
  slot.task?.cancel()
  slot.task = null
  slot.drawn = false
  slot.canvas.width = 0
  slot.canvas.height = 0
}

export async function openPdf(data: ArrayBuffer): Promise<OpenPdf> {
  // What pdf.js fetches on demand rather than bundling (shared/utils/pdfLayout.ts pdfAssetUrls).
  // Without these a scanned report's JPEG 2000 or JBIG2 pages came out blank, and a PDF naming a
  // standard font it does not embed fell back to whatever the device had.
  const task = getDocument({ data, cMapPacked: true, ...pdfAssetUrls(version) })
  const doc = await task.promise
  const slots: Slot[] = []
  let observer: IntersectionObserver | null = null
  let closed = false

  return {
    pages: doc.numPages,
    async renderInto({ container, scroller, width, cancelled, onError }) {
      const stopped = () => closed || cancelled()
      // Every page gets its place first — its shape, and no pixels — so the sheet has its full
      // height at once and can be scrolled anywhere. It used to draw every page there and then
      // and keep them all: a long report held a full canvas per page (up to 48 MB each), which is
      // more than iOS gives one tab, and the pages past the limit came out blank.
      for (let n = 1; n <= doc.numPages; n++) {
        if (stopped()) return
        const page = await doc.getPage(n)
        const base = page.getViewport({ scale: 1 })
        page.cleanup()
        const canvas = document.createElement('canvas')
        canvas.width = 0
        canvas.height = 0
        canvas.className = 'block w-full h-auto bg-white border border-line-soft'
        canvas.style.aspectRatio = `${base.width} / ${base.height}`
        canvas.dataset.pdfPage = String(n)
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`)
        container.appendChild(canvas)
        slots.push({ n, canvas, baseWidth: base.width, baseHeight: base.height, wanted: false, drawn: false, task: null })
      }
      if (stopped()) return

      // One page is drawn at a time, the lowest-numbered wanted one first.
      let busy = false
      const pump = async () => {
        if (busy || stopped()) return
        const slot = slots.find(s => s.wanted && !s.drawn)
        if (!slot) return
        busy = true
        try {
          const page = await doc.getPage(slot.n)
          if (slot.wanted && !stopped()) {
            const viewport = page.getViewport({ scale: pageScale(slot.baseWidth, slot.baseHeight, width, window.devicePixelRatio || 1) })
            slot.canvas.width = Math.round(viewport.width)
            slot.canvas.height = Math.round(viewport.height)
            slot.task = page.render({ canvas: slot.canvas, viewport })
            await slot.task.promise
            slot.task = null
            slot.drawn = true
          }
          page.cleanup()
        }
        catch (err) {
          // Scrolled away (or closed) mid-draw: the slot was released by whoever cancelled it.
          // Anything else is a page pdf.js could not draw: say so once, and don't try it again on
          // every scroll.
          if (!(err instanceof RenderingCancelledException)) {
            slot.task = null
            slot.drawn = true
            onError?.(slot.n, err)
          }
        }
        finally {
          busy = false
        }
        void pump()
      }

      // A page holds its pixels while it is on screen or within a screen's height of it, and
      // gives them back when it is scrolled further away than that.
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const slot = slots.find(s => s.canvas === entry.target)
          if (!slot) continue
          slot.wanted = entry.isIntersecting
          if (!slot.wanted && (slot.drawn || slot.task)) release(slot)
        }
        void pump()
      }, { root: scroller, rootMargin: '100% 0px' })
      for (const slot of slots) observer.observe(slot.canvas)
    },
    destroy: () => {
      closed = true
      observer?.disconnect()
      observer = null
      for (const slot of slots) release(slot)
      void task.destroy()
    }
  }
}
