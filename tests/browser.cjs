const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4201';
const artifacts = path.resolve('.work/artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const report = {passed: [], errors: [], failedRequests: []};
(async () => {
 const browser = await chromium.launch({headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
 try {
  const context = await browser.newContext({viewport: {width:1200,height:800}});
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('requestfailed', r => report.failedRequests.push(r.url()));
  page.on('console', m => {if (m.type() === 'error') report.errors.push(m.text());});
  await page.goto(base);
  await page.waitForSelector('.globe-wrapper[data-state="ready"]');
  await page.evaluate(() => {window.originalCanvas = document.querySelector('#globe-3d');});
  for (const theme of ['green', 'autheo', 'white', 'green']) {
   await page.getByLabel('Theme', {exact:true}).selectOption(theme);
   assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
   assert.equal(await page.evaluate(() => window.originalCanvas === document.querySelector('#globe-3d')), true);
   assert.equal(await page.locator('#globe-3d').count(), 1);
   const expected = theme === 'white' ? 'rgb(255, 255, 255)' : 'rgb(6, 6, 6)';
   assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), expected);
   const box = await page.locator('#globe-3d').boundingBox();
   assert.ok(box.x >= 0 && box.y >= 0 && box.x+box.width <= 1200 && box.y+box.height <= 800);
   assert.equal(await page.evaluate(() => {
    const c=document.querySelector('#globe-3d'),r=c.getBoundingClientRect();
    return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===c;
   }),true);
   await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
   await page.waitForFunction(() => /°/.test(document.querySelector('.globe-popup').textContent));
   await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.globe-popup')).opacity) > .9);
   await page.screenshot({path:path.join(artifacts,`${theme}-desktop.png`)});
  }
  report.passed.push('All themes render, retain one canvas and allow coordinate selection');
  const selection = await page.locator('.globe-popup').textContent();
  await page.selectOption('#theme-select','white');
  assert.equal(await page.locator('.globe-popup').textContent(),selection);
  await page.reload();
  await page.waitForSelector('.globe-wrapper[data-state="ready"]');
  assert.equal(await page.inputValue('#theme-select'),'white');
  await page.goto(base);
  await page.waitForSelector('.globe-wrapper[data-state="ready"]');
  assert.equal(await page.inputValue('#theme-select'),'white');
  report.passed.push('Switch keeps selection; query and saved theme survive navigation/reload');
  const box = await page.locator('#globe-3d').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.8,box.y+box.height/2,{steps:8});
  await page.mouse.up();
  assert.equal(await page.locator('.globe-popup').textContent(),'');
  report.passed.push('Quick drag does not create an accidental selection');
  await page.setViewportSize({width:390,height:844});
  for(const theme of ['green','autheo','white']) {
   await page.selectOption('#theme-select',theme);
   const metrics=await page.evaluate(()=>{const r=document.querySelector('#globe-3d').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth}});
   assert.ok(metrics.x>=0 && metrics.y>=0 && metrics.right<=390 && metrics.bottom<=844 && !metrics.overflow);
   await page.screenshot({path:path.join(artifacts,`${theme}-mobile.png`)});
  }
  report.passed.push('All themes fit mobile without overflow');
  for(const theme of ['autheo','white']) {
   await page.goto(`${base}/themes/${theme}-html.html`);
   await page.waitForURL(`**/index.html?theme=${theme}`);
   await page.waitForSelector('.globe-wrapper[data-state="ready"]');
   assert.equal(await page.inputValue('#theme-select'),theme);
  }
  report.passed.push('Both legacy theme pages open the working corresponding theme');
  await page.goto(`${base}/?theme=unknown`);
  await page.waitForSelector('.globe-wrapper[data-state="ready"]');
  assert.equal(await page.inputValue('#theme-select'),'green');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);
  report.passed.push('Invalid theme falls back; normal flows have no browser errors or failed requests');
  const delayed=await context.newPage();
  delayed.on('pageerror',e=>report.errors.push(e.message));
  let release;
  const gate=new Promise(resolve=>release=resolve);
  await delayed.route('**/assets/earth-map-colored.png',async route=>{await gate;await route.continue();});
  await delayed.goto(base,{waitUntil:'domcontentloaded'});
  await delayed.setViewportSize({width:600,height:600});
  await delayed.selectOption('#theme-select','white');
  release();
  await delayed.waitForSelector('.globe-wrapper[data-state="ready"]');
  assert.equal(await delayed.inputValue('#theme-select'),'white');
  assert.deepEqual(report.errors,[]);
  await delayed.close();
  report.passed.push('Resize/theme changes during texture loading do not crash');
  const deniedStorage=await browser.newContext();
  await deniedStorage.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError')}});});
  const isolated=await deniedStorage.newPage();
  await isolated.goto(base);await isolated.waitForSelector('.globe-wrapper[data-state="ready"]');
  await isolated.selectOption('#theme-select','white');
  assert.equal(await isolated.inputValue('#theme-select'),'white');
  await deniedStorage.close();
  report.passed.push('Theme switching works with browser storage disabled');
  const broken=await context.newPage();
  await broken.route('**/assets/earth-map-colored.png',route=>route.abort());
  await broken.goto(base);await broken.waitForSelector('.globe-wrapper[data-state="error"]');
  assert.match(await broken.locator('#globe-status').textContent(),/map image could not load/i);
  await broken.close();
  report.passed.push('A missing texture shows an actionable message instead of a blank page');
  const noGL=await browser.newContext();
  await noGL.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args)};});
  const unsupported=await noGL.newPage();
  const unsupportedErrors=[];
  unsupported.on('pageerror',e=>unsupportedErrors.push(e.message));
  await unsupported.goto(base);await unsupported.waitForSelector('.globe-wrapper[data-state="error"]');
  await unsupported.setViewportSize({width:600,height:600});
  await unsupported.evaluate(()=>window.dispatchEvent(new Event('resize')));
  await unsupported.selectOption('#theme-select','white');
  assert.match(await unsupported.locator('#globe-status').textContent(),/WebGL/);
  assert.deepEqual(unsupportedErrors,[]);
  await noGL.close();
  report.passed.push('Unavailable WebGL reports clearly and remains safe during resize/theme changes');
  console.log(JSON.stringify(report,null,2));
 } finally {fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
