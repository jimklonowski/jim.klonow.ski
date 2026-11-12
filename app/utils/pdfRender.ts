// A PDF drawn to canvases, for the in-app viewer (app/components/PdfViewer.vue). Loaded lazily,
// only when a source document is opened: pdf.js is about 0.5 MB plus a 1.3 MB worker, both served
// from this site's own assets (the CSP's worker-src allows no other origin). The legacy build is
// the one that runs on older Safari. A home-screen app has no browser chrome, so a PDF opened as
// a plain link left no way back — which is why the pages are drawn inside the app instead.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

/** Backing pixels per CSS pixel: sharp on a 3× phone without a canvas iOS refuses to allocate. */
const MAX_DENSITY = 3
const MAX_CANVAS_PIXELS = 12_000_000

export interface OpenPdf {
  pages: number
  /** Appends one canvas per page to `container`, each `width` CSS pixels wide at fit. */
  renderInto: (container: HTMLElement, width: number, cancelled: () => boolean) => Promise<void>
  destroy: () => void
}

export async function openPdf(data: ArrayBuffer): Promise<OpenPdf> {
  const task = getDocument({ data })
  const doc = await task.promise
  return {
    pages: doc.numPages,
    async renderInto(container, width, cancelled) {
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled()) return
        const page = await doc.getPage(n)
        const base = page.getViewport({ scale: 1 })
        let scale = (width * Math.min(window.devicePixelRatio || 1, MAX_DENSITY)) / base.width
        const pixels = base.width * base.height * scale * scale
        if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        canvas.className = 'block w-full h-auto bg-white border border-line-soft'
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`)
        container.appendChild(canvas)
        await page.render({ canvas, viewport }).promise
        page.cleanup()
      }
    },
    destroy: () => { void task.destroy() }
  }
}
