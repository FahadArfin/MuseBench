import type { PreviewFile } from '../../shared/file-preview-types';
export interface RenderOptions {
    onPages?: (pages: number) => void;
    onPage?: (page: number) => void;
    signal?: AbortSignal;
}
export interface FileRenderer {
    pages: number;
    setPage(page: number): Promise<void> | void;
    setZoom(zoom: number): Promise<void> | void;
    destroy(): void;
}
// Capture while the trusted IIFE is executing, before any asynchronous library imports.
const entryScript = (document.currentScript as HTMLScriptElement | null)?.src;
const assetBase = new URL('./', (window as Window & {
    __MUSEBENCH_FILE_ASSET_BASE__?: string;
}).__MUSEBENCH_FILE_ASSET_BASE__ || entryScript || location.href).href;
const MAX_BYTES = 40 * 1024 * 1024, MAX_TEXT = 2 * 1024 * 1024, MAX_INFLATED = 128 * 1024 * 1024, MAX_PART = 24 * 1024 * 1024, MAX_PAGES = 300, MAX_PIXELS = 16 * 1024 * 1024;
const CSS = `
.file-renderer{font:15px/1.6 system-ui,sans-serif;color:#20252e;min-height:100%;box-sizing:border-box;overflow:auto;padding:24px;background:#eef0f4;color-scheme:light}
.file-renderer *{box-sizing:border-box}
.file-renderer [hidden]{display:none!important}.file-renderer .file-markdown{background:white;max-width:960px;margin:0 auto;padding:40px;overflow-wrap:anywhere;box-shadow:0 2px 12px #0001}.file-renderer .file-markdown h1,.file-renderer .file-markdown h2,.file-renderer .file-markdown h3{line-height:1.3}.file-renderer .file-markdown pre{overflow:auto;padding:16px;background:#f4f5f8}.file-renderer .file-markdown code{font:13px/1.65 ui-monospace,monospace}.file-renderer table{border-collapse:collapse}.file-renderer .file-markdown td,.file-renderer .file-markdown th{border:1px solid #d6dbe4;padding:8px 12px}.file-renderer .file-markdown img{max-width:100%;height:auto}.file-renderer pre.file-source{margin:0;background:white;padding:24px;white-space:pre-wrap;tab-size:4;font:13px/1.7 ui-monospace,monospace}.file-renderer .file-image{display:block;max-width:100%;height:auto;margin:0 auto}.file-renderer .html-frame{display:block;border:0;background:white;width:100%;height:calc(100vh - 48px);min-height:400px}.file-renderer .docx-wrapper{padding:0;background:transparent;display:block}.file-renderer .docx-wrapper>section.docx{margin:0 auto!important;box-shadow:0 2px 12px #0002}.file-renderer .pdf-page{position:relative;margin:0 auto;background:white;box-shadow:0 2px 12px #0002;overflow:hidden}.file-renderer .pdf-page>canvas{display:block;width:100%;height:100%}.file-renderer .textLayer{position:absolute;text-align:initial;inset:0;overflow:clip;line-height:1;letter-spacing:normal;word-spacing:normal;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;caret-color:CanvasText;--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1/var(--min-font-size))}.file-renderer .textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0;user-select:text}.file-renderer .textLayer>:not(.markedContent),.file-renderer .textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor)*var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}.file-renderer .textLayer .markedContent{display:contents}.file-renderer .textLayer ::selection{background:#4285f460;color:transparent}.file-renderer .render-note{padding:8px 12px;background:#fff9e7;color:#69501e;font-size:12px;margin:8px auto;max-width:960px}
`;
function abortError() { return new DOMException('File preview was closed.', 'AbortError'); }
function pageIndex(value: number, pages: number) { return Math.max(1, Math.min(pages, Math.floor(Number.isFinite(value) ? value : 1))); }
function zoomValue(value: number) { return Math.max(.25, Math.min(3, Number.isFinite(value) ? value : 1)); }
function friendlyError(error: unknown, kind: string) {
    if (error instanceof DOMException && error.name === 'AbortError')
        return error;
    const message = error instanceof Error ? error.message : String(error);
    if (/password|encrypt/i.test(message))
        return new Error('This file is encrypted or password protected. Open the original in its desktop application.');
    if (/limit|too large|too many|exceed|preview supports|File access|No readable|Unsupported|image could not/i.test(message))
        return new Error(message);
    return new Error(`The ${kind.toUpperCase()} preview could not be rendered. The file may be corrupt or contain unsupported features. ${message.slice(0, 220)}`);
}
async function readBytes(file: PreviewFile, signal: AbortSignal): Promise<Uint8Array> {
    if (file.size > MAX_BYTES)
        throw new Error('This file is too large for the local preview (40 MB maximum).');
    const response = await fetch(file.rawUrl, { signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok)
        throw new Error(`File access failed (${response.status}). Refresh the preview to reopen the file.`);
    if (Number(response.headers.get('content-length')) > MAX_BYTES)
        throw new Error('This file is too large for the local preview (40 MB maximum).');
    if (!response.body) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > MAX_BYTES)
            throw new Error('This file is too large for the local preview.');
        return bytes;
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            length += value.length;
            if (length > MAX_BYTES) {
                await reader.cancel();
                throw new Error('This file is too large for the local preview (40 MB maximum).');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const result = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
        result.set(chunk, at);
        at += chunk.length;
    }
    return result;
}
// Check declared ZIP inflation before either Office parser begins allocating its document model.
// The host independently verifies archive structure and decompressed lengths before granting a URL.
async function officeArchive(bytes: Uint8Array, kind: 'docx' | 'pptx', check: () => void) {
    const { default: JSZip } = await import('jszip');
    check();
    const zip = await JSZip.loadAsync(bytes);
    check();
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    if (entries.length > 4000)
        throw new Error('This Office file has too many archive entries for a preview.');
    let total = 0;
    for (const entry of entries) {
        const size = (entry as unknown as {
            _data?: {
                uncompressedSize?: number;
            };
        })._data?.uncompressedSize ?? -1;
        if (!Number.isSafeInteger(size) || size < 0 || size > MAX_PART)
            throw new Error('An Office file part exceeds the preview resource limit.');
        total += size;
        if (total > MAX_INFLATED)
            throw new Error('This Office file exceeds the decompressed preview resource limit.');
    }
    const main = kind === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml';
    if (!zip.file(main))
        throw new Error(`No readable ${kind.toUpperCase()} document was found in the archive.`);
    const source = await zip.file(main)!.async('string');
    check();
    const xml = new DOMParser().parseFromString(source, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length)
        throw new Error('The Office document XML is invalid.');
    const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const count = kind === 'pptx' ? xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'sldId').length : Array.from(xml.getElementsByTagNameNS(wordNs, 'br')).filter(element => element.getAttributeNS(wordNs, 'type') === 'page').length + 1;
    if (count > MAX_PAGES)
        throw new Error(`The local preview supports at most ${MAX_PAGES} pages or slides.`);
    return zip;
}
export async function renderFile(file: PreviewFile, container: HTMLElement, options: RenderOptions = {}): Promise<FileRenderer> {
    const abort = new AbortController(), cleanups: Array<() => void> = [];
    let destroyed = false;
    const check = () => { if (destroyed || abort.signal.aborted)
        throw abortError(); };
    const destroy = () => { if (destroyed)
        return; destroyed = true; abort.abort(); options.signal?.removeEventListener('abort', destroy); for (const cleanup of cleanups.splice(0).reverse()) {
        try {
            cleanup();
        }
        catch { /* Cleanup must continue after a partially loaded document. */ }
    } container.replaceChildren(); };
    options.signal?.addEventListener('abort', destroy, { once: true });
    if (options.signal?.aborted) {
        destroy();
        throw abortError();
    }
    const host = document.createElement('div');
    host.className = 'file-renderer';
    host.dataset.kind = file.kind;
    const style = document.createElement('style');
    style.textContent = CSS;
    host.append(style);
    container.replaceChildren(host);
    // Office/Markdown links remain inert inside the renderer; opening originals is a parent-owned action.
    host.addEventListener('click', event => { if ((event.target as Element).closest?.('a'))
        event.preventDefault(); });
    const done = (renderer: Omit<FileRenderer, 'destroy'>): FileRenderer => { check(); options.onPages?.(renderer.pages); options.onPage?.(1); return { ...renderer, destroy }; };
    const single = (element: HTMLElement) => { element.dataset.previewPage = '1'; host.append(element); return done({ pages: 1, setPage() { check(); options.onPage?.(1); }, setZoom(zoom) { check(); element.style.zoom = String(zoomValue(zoom)); } }); };
    try {
        if (file.kind === 'html') {
            if (file.size > MAX_BYTES)
                throw new Error('This HTML file is too large for a local preview.');
            const frame = document.createElement('iframe');
            frame.className = 'html-frame';
            frame.title = file.name;
            frame.sandbox.add('allow-scripts');
            frame.referrerPolicy = 'no-referrer';
            frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
            frame.src = file.rawUrl;
            cleanups.push(() => { frame.src = 'about:blank'; frame.remove(); });
            return single(frame);
        }
        const bytes = await readBytes(file, abort.signal);
        check();
        if ((file.kind === 'text' || file.kind === 'markdown') && bytes.length > MAX_TEXT)
            throw new Error('This text file exceeds the local preview limit (2 MB). Download the original to open it in an editor.');
        if (file.kind === 'text') {
            const pre = document.createElement('pre');
            pre.className = 'file-source';
            pre.textContent = new TextDecoder().decode(bytes);
            return single(pre);
        }
        if (file.kind === 'markdown') {
            const [{ createElement }, { createRoot }, { flushSync }, { default: Markdown }, { default: gfm }] = await Promise.all([import('react'), import('react-dom/client'), import('react-dom'), import('react-markdown'), import('remark-gfm')]);
            check();
            const article = document.createElement('article');
            article.className = 'file-markdown';
            const root = createRoot(article);
            cleanups.push(() => root.unmount());
            flushSync(() => root.render(createElement(Markdown, { remarkPlugins: [gfm], skipHtml: true, components: { img: ({ src, alt }) => { if (!src)
                        return null; let safe = ''; try {
                        const target = new URL(src, file.resourceBaseUrl);
                        const base = new URL(file.resourceBaseUrl);
                        if (target.protocol === base.protocol && target.host === base.host && target.pathname.startsWith(base.pathname) && !target.username && !target.password)
                            safe = target.href;
                    }
                    catch { } return safe ? createElement('img', { src: safe, alt: alt || '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : createElement('span', null, alt || 'External image omitted'); } }, children: new TextDecoder().decode(bytes) })));
            return single(article);
        }
        if (file.kind === 'image') {
            const mime: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon' };
            const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime[file.name.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream' }));
            cleanups.push(() => URL.revokeObjectURL(url));
            const image = document.createElement('img');
            image.className = 'file-image';
            image.alt = file.name;
            image.src = url;
            await new Promise<void>((resolve, reject) => { const stop = () => reject(abortError()); abort.signal.addEventListener('abort', stop, { once: true }); image.onload = () => { abort.signal.removeEventListener('abort', stop); resolve(); }; image.onerror = () => { abort.signal.removeEventListener('abort', stop); reject(new Error('The image could not be decoded. It may be corrupt or unsupported.')); }; });
            check();
            if (image.naturalWidth * image.naturalHeight > MAX_PIXELS)
                throw new Error('This image exceeds the local preview pixel limit.');
            return single(image);
        }
        if (file.kind === 'docx') {
            const zip = await officeArchive(bytes, 'docx', check);
            let sanitized = false;
            // Remove external relationships before docx-preview sees them, including linked images/fonts.
            for (const entry of Object.values(zip.files)) {
                if (!entry.name.endsWith('.rels'))
                    continue;
                const text = await entry.async('string');
                check();
                const xml = new DOMParser().parseFromString(text, 'application/xml');
                if (xml.getElementsByTagName('parsererror').length)
                    throw new Error('The Word relationship XML is invalid.');
                let changed = false;
                for (const rel of Array.from(xml.getElementsByTagNameNS('*', 'Relationship'))) {
                    if (rel.getAttribute('TargetMode')?.toLowerCase() === 'external') {
                        rel.remove();
                        changed = true;
                    }
                }
                if (changed) {
                    zip.file(entry.name, new XMLSerializer().serializeToString(xml));
                    sanitized = true;
                }
            }
            const data = sanitized ? await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }) : bytes;
            check();
            const { renderAsync } = await import('docx-preview');
            check();
            const documentHost = document.createElement('div');
            host.append(documentHost);
            await renderAsync(data, documentHost, documentHost, { className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, renderAltChunks: false, useBase64URL: true, ignoreFonts: false });
            check();
            const pages = Array.from(documentHost.querySelectorAll<HTMLElement>('section.docx'));
            if (!pages.length)
                throw new Error('No readable Word pages were found.');
            if (pages.length > MAX_PAGES)
                throw new Error(`The local preview supports at most ${MAX_PAGES} pages.`);
            pages.forEach((page, index) => { page.hidden = index !== 0; page.dataset.previewPage = String(index + 1); });
            return done({ pages: pages.length, setPage(value) { check(); const page = pageIndex(value, pages.length); pages.forEach((element, index) => element.hidden = index !== page - 1); host.scrollTop = 0; options.onPage?.(page); }, setZoom(value) { check(); documentHost.style.zoom = String(zoomValue(value)); } });
        }
        if (file.kind === 'pptx') {
            await officeArchive(bytes, 'pptx', check);
            check();
            const { PptxViewer } = await import('@aiden0z/pptx-renderer');
            check();
            const slideHost = document.createElement('div');
            host.append(slideHost);
            const viewer = new PptxViewer(slideHost, { externalMedia: 'block', fitMode: 'contain', pdfjs: false, zipLimits: { maxEntries: 4000, maxEntryUncompressedBytes: MAX_PART, maxTotalUncompressedBytes: MAX_INFLATED, maxMediaBytes: 64 * 1024 * 1024, maxConcurrency: 4 }, onSlideChange: index => { if (!destroyed)
                    options.onPage?.(index + 1); }, onSlideRendered: (index, element) => { element.dataset.previewPage = String(index + 1); } });
            cleanups.push(() => viewer.destroy());
            await viewer.open(bytes, { renderMode: 'slide', lazySlides: true, lazyMedia: true, signal: abort.signal });
            check();
            if (!viewer.slideCount)
                throw new Error('No readable PowerPoint slides were found.');
            if (viewer.slideCount > MAX_PAGES)
                throw new Error(`The local preview supports at most ${MAX_PAGES} slides.`);
            return done({ pages: viewer.slideCount, async setPage(value) { check(); await viewer.goToSlide(pageIndex(value, viewer.slideCount) - 1); check(); }, async setZoom(value) { check(); await viewer.setZoom(zoomValue(value) * 100); check(); } });
        }
        if (file.kind === 'pdf') {
            const pdfjs = await import('pdfjs-dist');
            check();
            const workerUrl = new URL('pdf.worker.min.mjs', assetBase).href;
            // Chromium rejects module blob workers in opaque frames. A classic blob worker
            // can dynamically import our local, CORS-enabled PDF.js module without gaining an origin.
            const workerBlob = URL.createObjectURL(new Blob([`import(${JSON.stringify(workerUrl)}).catch(error=>{throw error;});`], { type: 'text/javascript' }));
            cleanups.push(() => URL.revokeObjectURL(workerBlob));
            const worker = new Worker(workerBlob);
            cleanups.push(() => worker.terminate());
            await new Promise<void>((resolve, reject) => { const cleanup = () => { clearTimeout(timer); worker.removeEventListener('message', ready); worker.removeEventListener('error', failed); abort.signal.removeEventListener('abort', stopped); }; const ready = (event: MessageEvent) => { if (event.data?.action === 'ready') {
                cleanup();
                resolve();
            } }; const failed = (event?: ErrorEvent) => { cleanup(); reject(new Error('The local PDF worker could not start. ' + (event?.message || 'Refresh the preview.'))); }; const stopped = () => { cleanup(); reject(abortError()); }; const timer = setTimeout(() => failed(), 15000); worker.addEventListener('message', ready); worker.addEventListener('error', failed); abort.signal.addEventListener('abort', stopped, { once: true }); });
            check();
            const pdfWorker = pdfjs.PDFWorker.create({ port: worker });
            cleanups.push(() => pdfWorker.destroy());
            const task = pdfjs.getDocument({ data: bytes, worker: pdfWorker, enableXfa: false, maxImageSize: MAX_PIXELS, canvasMaxAreaInBytes: MAX_PIXELS * 4, cMapUrl: new URL('cmaps/', assetBase).href, standardFontDataUrl: new URL('standard_fonts/', assetBase).href, wasmUrl: new URL('wasm/', assetBase).href, useWorkerFetch: true, stopAtErrors: true });
            cleanups.push(() => { void task.destroy().catch(() => { }); });
            let passwordRequested = false;
            task.onPassword = () => { passwordRequested = true; void task.destroy().catch(() => { }); };
            const doc = await task.promise.catch(error => { if (passwordRequested)
                throw new Error('This PDF is password protected. Open the original in its desktop application.'); throw error; });
            check();
            if (doc.numPages > 1000)
                throw new Error('The local PDF preview supports at most 1000 pages.');
            const pageHost = document.createElement('div');
            pageHost.className = 'pdf-page';
            host.append(pageHost);
            let current = 1, zoom = 1, generation = 0, chain = Promise.resolve();
            let activeRender: ReturnType<Awaited<ReturnType<typeof doc.getPage>>['render']> | undefined;
            let textLayer: InstanceType<typeof pdfjs.TextLayer> | undefined;
            cleanups.push(() => { generation++; activeRender?.cancel(); textLayer?.cancel(); pdfjs.TextLayer.cleanup(); for (const canvas of pageHost.querySelectorAll('canvas')) {
                canvas.width = 0;
                canvas.height = 0;
            } });
            const render = () => {
                const own = ++generation;
                activeRender?.cancel();
                textLayer?.cancel();
                const work = async () => {
                    check();
                    if (own !== generation)
                        return;
                    const page = await doc.getPage(current);
                    check();
                    if (own !== generation) {
                        page.cleanup();
                        return;
                    }
                    const natural = page.getViewport({ scale: 1 });
                    const fit = Math.max(.1, (host.clientWidth - 48) / natural.width);
                    const scale = Math.min(fit, 1.5) * zoom;
                    const viewport = page.getViewport({ scale });
                    if (viewport.width > 16384 || viewport.height > 16384 || viewport.width * viewport.height > MAX_PIXELS)
                        throw new Error('This PDF page exceeds the local preview pixel limit at this zoom.');
                    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.ceil(viewport.width * ratio);
                    canvas.height = Math.ceil(viewport.height * ratio);
                    pageHost.style.width = `${viewport.width}px`;
                    pageHost.style.height = `${viewport.height}px`;
                    pageHost.style.setProperty('--total-scale-factor', String(scale));
                    pageHost.dataset.previewPage = String(current);
                    for (const previous of pageHost.querySelectorAll('canvas')) {
                        previous.width = 0;
                        previous.height = 0;
                    }
                    pageHost.replaceChildren(canvas);
                    activeRender = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
                    try {
                        await activeRender.promise;
                    }
                    catch (error) {
                        if (own !== generation || destroyed)
                            return;
                        throw error;
                    }
                    check();
                    if (own !== generation)
                        return;
                    const text = document.createElement('div');
                    text.className = 'textLayer';
                    pageHost.append(text);
                    textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
                    try {
                        await textLayer.render();
                    }
                    catch (error) {
                        if (own !== generation || destroyed)
                            return;
                        throw error;
                    }
                    check();
                    if (own === generation) {
                        host.scrollTop = 0;
                        options.onPage?.(current);
                    }
                    page.cleanup();
                };
                chain = chain.catch(() => { }).then(work);
                return chain;
            };
            await render();
            return done({ pages: doc.numPages, setPage(value) { check(); current = pageIndex(value, doc.numPages); return render(); }, setZoom(value) { check(); zoom = zoomValue(value); return render(); } });
        }
        throw new Error('Unsupported file type. Download the original to open it in its application.');
    }
    catch (error) {
        const interrupted = destroyed;
        destroy();
        throw interrupted ? abortError() : friendlyError(error, file.kind);
    }
}
