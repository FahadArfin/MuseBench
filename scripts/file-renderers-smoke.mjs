// Real Office/PDF fixtures exercise renderer output in an opaque sandbox. No Office or provider is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createFilePreviewFixtures } from './file-preview-fixtures.mjs';
await assert.doesNotReject(access('src/ui/file-preview/renderers.ts'), 'Local file rendering adapter must exist');
const files = await createFilePreviewFixtures();
const entry = `import {renderFile} from './src/ui/file-preview/renderers.ts';let active,abort;window.openFixture=async(kind,name)=>{abort?.abort();active?.destroy();abort=new AbortController();active=await renderFile({kind,name,path:name,rawUrl:new URL('/'+name,location.href).href,size:0,token:'fixture',taskId:'fixture',revision:'1',resourceBaseUrl:new URL('/',location.href).href},document.getElementById('root'),{signal:abort.signal,onPages:n=>window.pages=n,onPage:n=>window.current=n});return {pages:active.pages}};window.fixturePage=async n=>active.setPage(n);window.fixtureZoom=async n=>active.setZoom(n);window.closeFixture=()=>{abort.abort();active?.destroy()};`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome140', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
const errors = [], external = [];
let origin = '';
const csp = () => `default-src 'none'; script-src ${origin} 'unsafe-inline' blob:; style-src ${origin} 'unsafe-inline' blob:; img-src ${origin} blob: data:; font-src ${origin} blob: data:; connect-src ${origin} blob:; worker-src blob: ${origin}; frame-src ${origin}; base-uri 'none'; form-action 'none'`;
const server = createServer(async (req, res) => { try {
    const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<iframe title="Opaque file renderer" sandbox="allow-scripts" src="/frame.html" style="width:100%;height:900px"></iframe>');
    }
    else if (pathname === '/frame.html') {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Security-Policy', csp());
        res.end('<div id="root"></div><script src="/frame.js"></script>');
    }
    else if (pathname === '/frame.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(bundle.outputFiles[0].contents);
    }
    else if (files.has(pathname.slice(1))) {
        res.setHeader('Content-Type', pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream');
        res.setHeader('Content-Security-Policy', csp());
        res.end(files.get(pathname.slice(1)));
    }
    else if (/^\/(pdf.worker.min.mjs|cmaps\/[\w.-]+|standard_fonts\/[\w.-]+|wasm\/[\w.-]+)$/.test(pathname)) {
        res.setHeader('Content-Type', pathname.endsWith('.mjs') ? 'text/javascript' : pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.end(await readFile('node_modules/pdfjs-dist/' + (pathname.includes('/') && pathname.slice(1).includes('/') ? pathname.slice(1) : 'build/' + pathname.slice(1))));
    }
    else {
        res.statusCode = 404;
        res.end();
    }
}
catch (error) {
    res.statusCode = 500;
    res.end(String(error));
} });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
page.on('pageerror', error => errors.push(String(error)));
await page.route('**/*', route => { const url = route.request().url(); if (url.startsWith(origin) || url.startsWith('blob:') || url.startsWith('data:'))
    return route.continue(); external.push(url); return route.abort(); });
try {
    await page.goto(origin);
    const frame = page.frames()[1];
    await frame.waitForFunction(() => typeof window.openFixture === 'function');
    assert.equal(await frame.evaluate(() => self.origin), 'null');
    const open = (kind, name) => { console.log('Rendering', name); return frame.evaluate(([kind, name]) => window.openFixture(kind, name), [kind, name]); };
    assert.equal((await open('markdown', 'fixture.md')).pages, 1);
    await frame.getByRole('table').waitFor();
    assert.equal(await frame.locator('script').count(), 1);
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    await open('text', 'fixture.txt');
    assert.match(await frame.locator('pre').innerText(), /<script>Unsafe as HTML<\/script>/);
    assert.equal(await frame.locator('pre script').count(), 0);
    await open('image', 'fixture.svg');
    assert.equal(await frame.getByRole('img', { name: 'fixture.svg' }).evaluate(image => image.naturalWidth), 64);
    assert.equal(await frame.evaluate(() => window.hacked), undefined);
    await assert.rejects(() => open('text', 'large.txt'), /limit|large/i);
    await assert.rejects(() => open('docx', 'inflated.docx'), /limit/i);
    assert.equal((await open('docx', 'fixture.docx')).pages, 2);
    await frame.getByText('Word fixture first page', { exact: true }).waitFor();
    await frame.getByRole('cell', { name: 'Authored table cell' }).waitFor();
    await frame.getByText('Fixture header', { exact: true }).first().waitFor();
    await frame.getByText('Fixture footer', { exact: true }).first().waitFor();
    await frame.waitForFunction(() => Array.from(document.querySelectorAll('.docx img')).some(image => image.naturalWidth === 64));
    await frame.evaluate(() => window.fixturePage(2));
    await frame.getByText('Word fixture second page', { exact: true }).waitFor();
    await frame.evaluate(() => window.fixtureZoom(1.5));
    await mkdir('artifacts/file-renderers', { recursive: true });
    await page.screenshot({ path: 'artifacts/file-renderers/docx.png' });
    assert.equal((await open('pptx', 'fixture.pptx')).pages, 2);
    await frame.getByText('Slide fixture 1', { exact: true }).waitFor();
    await frame.evaluate(() => window.fixturePage(2));
    await frame.getByText('Slide fixture 2', { exact: true }).waitFor();
    assert.equal(await frame.getByText('Slide fixture 1', { exact: true }).count(), 0);
    await frame.evaluate(() => window.fixtureZoom(1.25));
    await page.screenshot({ path: 'artifacts/file-renderers/pptx.png' });
    assert.equal((await open('pdf', 'fixture.pdf')).pages, 2);
    await frame.locator('.pdf-page>canvas').waitFor();
    await frame.locator('.textLayer').getByText('PDF fixture page 1', { exact: true }).waitFor();
    const pixels = await frame.locator('.pdf-page>canvas').evaluate(canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let dark = 0; for (let i = 0; i < data.length; i += 4)
        if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100)
            dark++; return dark; });
    assert(pixels > 100, 'PDF canvas must contain rendered glyphs');
    await frame.evaluate(() => window.fixturePage(2));
    await frame.locator('.textLayer').getByText('PDF fixture page 2', { exact: true }).waitFor();
    await frame.evaluate(() => window.fixtureZoom(1.5));
    await page.screenshot({ path: 'artifacts/file-renderers/pdf.png' });
    await assert.rejects(() => open('pdf', 'corrupt.pdf'), /PDF|corrupt|invalid/i);
    await assert.rejects(() => open('docx', 'corrupt.docx'), /Word|DOCX|ZIP|corrupt|invalid/i);
    await open('html', 'fixture.html');
    await frame.locator('iframe').waitFor();
    await page.waitForFunction(() => document.querySelector('iframe'));
    const htmlFrame = frame.childFrames()[0];
    await htmlFrame.getByRole('heading', { name: 'HTML fixture' }).waitFor();
    assert.equal(await htmlFrame.getByRole('heading').evaluate(el => getComputedStyle(el).color), 'rgb(20, 60, 100)');
    assert.equal(await frame.evaluate(() => window.hacked), undefined);
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    assert.equal(await htmlFrame.evaluate(() => window.htmlFixtureRan && window.parentAccessBlocked), true);
    await frame.evaluate(() => window.closeFixture());
    assert.equal(await frame.locator('#root').innerHTML(), '');
    const cancelled = await frame.evaluate(async () => { const promise = window.openFixture('pdf', 'fixture.pdf'); window.closeFixture(); try {
        await promise;
        return false;
    }
    catch (error) {
        return error.name === 'AbortError';
    } });
    assert.equal(cancelled, true);
    assert.equal(await frame.locator('#root').innerHTML(), '');
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('PASS file renderers: opaque sandbox, GFM, escaped text, inert SVG image, paginated DOCX + header/footer/table/image, authored PPTX slides, PDF canvas + selectable text, zoom/navigation, corrupt files, inflation/text bounds, relative HTML and cancellation/cleanup');
    await writeFile('artifacts/file-renderers/result.json', JSON.stringify({ passed: true, externalRequests: external, errors, formats: ['markdown', 'text', 'image', 'docx', 'pptx', 'pdf', 'html'], guards: ['office-inflation', 'text-size', 'opaque-origin', 'html-relative-style', 'html-script-isolation', 'abort', 'destroy'] }, null, 2));
}
finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
