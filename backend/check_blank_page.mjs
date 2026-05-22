import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message, '\nSTACK:\n', error.stack));
  page.on('requestfailed', request =>
    console.log('REQUEST FAILED:', request.url(), request.failure().errorText)
  );

  await page.goto('https://acetrack-suggested.onrender.com/');
  // Wait a bit for JS to execute
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
