const puppeteer = require('puppeteer-core');
(async () => {
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage();
    page.on('console', msg => console.log('LOG:', msg.text()));
    page.on('pageerror', err => console.log('ERROR:', err.message));
    await page.goto('https://acetrack-suggested.onrender.com/');
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();
