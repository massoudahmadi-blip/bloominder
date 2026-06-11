// Bloominder PDF service: renders /rapport/<code> to a downloadable PDF.
// GET /pdf?code=69383&brand=MyAgency
const http = require('http');
const { chromium } = require('playwright');

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://bloominder.com').replace(/\/$/, '');
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
    const target = `${PUBLIC_URL}/rapport/${code}` + (brand ? `?brand=${encodeURIComponent(brand)}` : '');
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(900); // let charts/data settle
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
    res.writeHead(500); res.end('pdf error');
  } finally {
    if (page) await page.close().catch(() => {});
  }
}).listen(PORT, () => console.log(`Bloominder PDF service on :${PORT} → ${PUBLIC_URL}`));
