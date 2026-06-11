// Bloominder PDF service: renders /rapport/<code> to a downloadable PDF.
// GET /pdf?code=69383&brand=MyAgency
const http = require('http');
const { chromium } = require('playwright');

// RENDER_URL points at the web container on the internal Docker network
// (avoids public-hostname hairpin NAT); falls back to the public URL.
const RENDER_URL = (process.env.RENDER_URL || process.env.PUBLIC_URL || 'http://web:3000').replace(/\/$/, '');
const PORT = process.env.PORT || 3002;

let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
  return browser;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname !== '/pdf') { res.writeHead(404); return res.end('not found'); }

  const code = (u.searchParams.get('code') || '').replace(/[^0-9ABab]/g, '').slice(0, 6);
  const brand = (u.searchParams.get('brand') || '').slice(0, 60);
  if (!code) { res.writeHead(400); return res.end('code required'); }

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    const target = `${RENDER_URL}/rapport/${code}` + (brand ? `?brand=${encodeURIComponent(brand)}` : '');
    try {
      await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
      // Some pages keep polling and never hit "networkidle" — fall back.
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await page.waitForTimeout(1200); // let charts/data settle
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="bloominder-${code}.pdf"`,
      'Cache-Control': 'no-store',
    });
    res.end(pdf);
  } catch (e) {
    console.error('pdf error:', e && e.message ? e.message : e);
    res.writeHead(500); res.end(`pdf error: ${e && e.message ? e.message : 'unknown'}`);
  } finally {
    if (page) await page.close().catch(() => {});
  }
}).listen(PORT, () => console.log(`Bloominder PDF service on :${PORT} → ${RENDER_URL}`));
