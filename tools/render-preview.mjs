// 실제 UI와 같은 코드/글꼴로 만드는 정적 홍보 이미지. AI 생성 이미지가 아니다.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
try { const page = await browser.newPage({ viewport:{ width:1200, height:630 }, deviceScaleFactor:1 });
  await page.goto(pathToFileURL(resolve('tools/preview.html')).href); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path:'web/media/dugout-preview.png' });
} finally { await browser.close(); }
