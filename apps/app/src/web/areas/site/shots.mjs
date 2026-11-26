import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";

const base = process.env.SITE_URL ?? "http://localhost:3231";
const out = process.env.SHOTS_DIR ?? "shots/sitecss";
const phase = process.env.SHOT_PHASE ?? "before";
const fixedNow = 1795694400000;

const routes = [
  ["home", "/"],
  ["pricing", "/pricing"],
  ["models", "/models"],
  ["model-detail", "/models/near-ai/black-forest-labs/FLUX.2-klein-4B"],
  ["inference", "/inference"],
  ["observability", "/observability"],
  ["compute", "/compute"],
  ["blackboxes", "/blackboxes"],
  ["dry-docks", "/dry-docks"],
  ["status", "/status"],
  ["verify", "/verify"],
  ["contact", "/contact"],
  ["contact-editorial", "/contact-1"],
  ["contact-routing", "/contact-2"],
  ["contact-correspondence", "/contact-3"],
  ["contact-signal", "/contact-4"],
  ["journal", "/blog"],
  ["journal-article", "/blog/read-a-gateway-trace"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["notfound", "/404"],
  ["docs", "/docs"],
  ["docs-quickstart", "/docs/quickstart"],
];

const routeFilter = (process.env.SHOT_FILTER ?? "").split(",").filter(Boolean);
const selectedRoutes = routeFilter.length ? routes.filter(([name]) => routeFilter.includes(name)) : routes;

const variants = [
  ["desktop", "light", { width: 1440, height: 900 }],
  ["desktop", "dark", { width: 1440, height: 900 }],
  ["mobile", "light", { width: 390, height: 844 }],
  ["mobile", "dark", { width: 390, height: 844 }],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buffer) {
  if (buffer.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) {
    throw new Error("not a png");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const ids = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      ids.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported png depth ${bitDepth} type ${colorType} interlace ${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(ids));
  const pixels = Buffer.alloc(width * height * 4);
  const prior = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let source = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[source++];
    raw.copy(line, 0, source, source + stride);
    source += stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = prior[x];
      const upperLeft = x >= channels ? prior[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + left) & 255;
      else if (filter === 2) line[x] = (line[x] + up) & 255;
      else if (filter === 3) line[x] = (line[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) line[x] = (line[x] + paeth(left, up, upperLeft)) & 255;
      else if (filter !== 0) throw new Error(`unsupported png filter ${filter}`);
    }
    line.copy(prior);
    for (let x = 0; x < width; x++) {
      const sourceIndex = x * channels;
      const targetIndex = (y * width + x) * 4;
      pixels[targetIndex] = line[sourceIndex];
      pixels[targetIndex + 1] = line[sourceIndex + 1];
      pixels[targetIndex + 2] = line[sourceIndex + 2];
      pixels[targetIndex + 3] = channels === 4 ? line[sourceIndex + 3] : 255;
    }
  }
  return { width, height, pixels };
}

async function comparePngs(beforePath, afterPath) {
  const beforeBuffer = await readFile(beforePath);
  const afterBuffer = await readFile(afterPath);
  const beforeSha256 = sha256(beforeBuffer);
  const afterSha256 = sha256(afterBuffer);
  if (beforeSha256 === afterSha256) {
    const decoded = decodePng(beforeBuffer);
    return {
      same: true,
      visuallySame: true,
      different: 0,
      isolatedDifferent: 0,
      clusteredDifferent: 0,
      maxChannelDelta: 0,
      total: decoded.width * decoded.height,
      ratio: 0,
      beforeSha256,
      afterSha256,
    };
  }
  const before = decodePng(beforeBuffer);
  const after = decodePng(afterBuffer);
  if (before.width !== after.width || before.height !== after.height) {
    return { same: false, visuallySame: false, dimensionMismatch: [before.width, before.height, after.width, after.height], beforeSha256, afterSha256 };
  }
  const total = before.width * before.height;
  const changed = new Uint8Array(total);
  let different = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < total; index++) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel++) {
      pixelDelta = Math.max(pixelDelta, Math.abs(before.pixels[index * 4 + channel] - after.pixels[index * 4 + channel]));
    }
    if (pixelDelta) {
      different++;
      changed[index] = 1;
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    }
  }
  let isolatedDifferent = 0;
  let clusteredDifferent = 0;
  for (let index = 0; index < total; index++) {
    if (!changed[index]) continue;
    const x = index % before.width;
    const y = Math.floor(index / before.width);
    let neighbor = false;
    for (let dy = -1; dy <= 1 && !neighbor; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < before.width && ny >= 0 && ny < before.height && changed[ny * before.width + nx]) {
          neighbor = true;
          break;
        }
      }
    }
    if (neighbor) clusteredDifferent++;
    else isolatedDifferent++;
  }
  return {
    same: false,
    visuallySame: maxChannelDelta < 5 && clusteredDifferent === 0,
    different,
    isolatedDifferent,
    clusteredDifferent,
    maxChannelDelta,
    total,
    ratio: different / total,
    beforeSha256,
    afterSha256,
  };
}

async function openPage(browser, viewport, theme) {
  const context = await browser.newContext({
    viewport,
    colorScheme: theme,
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  await context.addInitScript(({ theme, fixedNow }) => {
    try {
      localStorage.setItem("sonnely.theme", theme);
      localStorage.setItem("sonnely.ambient-motion", "off");
    } catch {}
    Date.now = () => fixedNow;
  }, { theme, fixedNow });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return { context, page, errors };
}

async function settle(page, path) {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".theme-root", { timeout: 10000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "::-webkit-scrollbar{width:0!important;height:0!important}" });
  await page.waitForTimeout(350);
}

async function measure(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [];
    for (const element of document.querySelectorAll("body *")) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (box.right > width + 0.5 || box.left < -0.5) {
        let clipped = false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowX;
          if (overflow !== "visible") {
            clipped = true;
            break;
          }
        }
        if (clipped) continue;
        const identity = element.tagName.toLowerCase() + (element.className && typeof element.className === "string" ? "." + element.className.trim().replace(/\s+/g, ".") : "");
        offenders.push({ identity, left: Math.round(box.left), right: Math.round(box.right) });
        if (offenders.length === 8) break;
      }
    }
    return {
      clientWidth: width,
      scrollWidth: document.documentElement.scrollWidth,
      overflowPx: Math.max(0, document.documentElement.scrollWidth - width),
      offenders,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
}

async function capture() {
  await mkdir(`${out}/${phase}`, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {};
  const failures = [];
  for (const [viewportName, theme, viewport] of variants) {
    for (const [name, path] of selectedRoutes) {
      const { context, page, errors } = await openPage(browser, viewport, theme);
      await settle(page, path);
      const key = `${theme}-${viewportName}-${name}`;
      report[key] = await measure(page);
      await page.screenshot({ path: `${out}/${phase}/${key}.png` });
      if (errors.length) failures.push(`${key}: ${[...new Set(errors)].join(" | ")}`);
      await context.close();
    }
  }
  await browser.close();
  await writeFile(`${out}/${phase}-measurements.json`, JSON.stringify({ report }, null, 2) + "\n");
  if (failures.length) {
    console.error("CONSOLE ERRORS:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log(`${phase} captures complete with zero console errors`);
}

async function interactions() {
  await mkdir(`${out}/${phase}`, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = {};
  for (const [viewportName, theme, viewport] of [
    ["desktop", "light", { width: 1440, height: 900 }],
    ["mobile", "dark", { width: 390, height: 844 }],
  ]) {
    const { context, page, errors } = await openPage(browser, viewport, theme);
    await settle(page, "/");
    if (viewportName === "desktop") {
      await page.click(".nav-products .nav-toggle");
      await page.waitForTimeout(180);
    } else {
      await page.click(".mobile-menu-control");
      await page.waitForTimeout(180);
    }
    results[`nav-${viewportName}`] = { errors: [...errors], open: await page.evaluate(() => Boolean(document.querySelector("[data-mobile-open]") || document.querySelector(".nav-products[open]"))), ...(await measure(page)) };
    await page.screenshot({ path: `${out}/${phase}/interaction-nav-${viewportName}-${theme}.png` });
    await context.close();
  }

  {
    const { context, page, errors } = await openPage(browser, { width: 390, height: 844 }, "light");
    await settle(page, "/");
    const before = await page.locator(".theme-switch").getAttribute("aria-checked");
    await page.click(".theme-switch");
    await page.waitForTimeout(180);
    const after = await page.locator(".theme-switch").getAttribute("aria-checked");
    results.themeToggle = { before, after, errors: [...errors], ...(await measure(page)) };
    await page.screenshot({ path: `${out}/${phase}/interaction-theme-toggle-mobile.png` });
    await context.close();
  }

  {
    const { context, page, errors } = await openPage(browser, { width: 1440, height: 900 }, "light");
    await settle(page, "/contact");
    results.contactForm = {
      visible: await page.locator(".cx-co-letter").isVisible(),
      topics: await page.locator(".cx-co-topic").count(),
      errors: [...errors],
      ...(await measure(page)),
    };
    await page.screenshot({ path: `${out}/${phase}/interaction-contact-desktop-light.png` });
    await context.close();
  }

  {
    const { context, page, errors } = await openPage(browser, { width: 1440, height: 900 }, "dark");
    await settle(page, "/pricing");
    const input = page.locator(".cor-estimate input[type='number']").first();
    if (await input.count()) {
      await input.fill("20000");
      await page.waitForTimeout(180);
    }
    results.pricingEstimator = {
      controls: await page.locator(".cor-estimate input[type='number']").count(),
      estimateVisible: await page.locator(".cor-invoice").isVisible().catch(() => false),
      estimate: await page.locator(".cor-invoice output").textContent(),
      errors: [...errors],
      ...(await measure(page)),
    };
    await page.screenshot({ path: `${out}/${phase}/interaction-pricing-estimator-desktop-dark.png` });
    await context.close();
  }
  await browser.close();
  await writeFile(`${out}/${phase}-interactions.json`, JSON.stringify(results, null, 2) + "\n");
  const failures = Object.entries(results).filter(([, value]) => value.errors?.length);
  if (failures.length) {
    console.error("INTERACTION CONSOLE ERRORS:\n" + failures.map(([key, value]) => `${key}: ${value.errors.join(" | ")}`).join("\n"));
    process.exit(1);
  }
  console.log(`${phase} interactions complete with zero console errors`);
}

async function compare() {
  const comparison = {};
  for (const [viewportName, theme] of variants.map(([viewportName, theme]) => [viewportName, theme])) {
    for (const [name] of selectedRoutes) {
      const key = `${theme}-${viewportName}-${name}`;
      comparison[key] = await comparePngs(`${out}/before/${key}.png`, `${out}/after/${key}.png`);
    }
  }
  for (const file of ["interaction-nav-desktop-light", "interaction-nav-mobile-dark"]) {
    comparison[file] = await comparePngs(`${out}/before/${file}.png`, `${out}/after/${file}.png`);
  }
  await writeFile(`${out}/comparison.json`, JSON.stringify(comparison, null, 2) + "\n");
  const failed = Object.entries(comparison).filter(([, value]) => !value.visuallySame);
  if (failed.length) {
    console.error("VISUAL DIFFERENCES:\n" + failed.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n"));
    process.exit(1);
  }
  console.log("all captures byte-identical or within isolated antialiasing noise");
}

const command = process.argv[2] ?? "capture";
if (command === "capture") await capture();
else if (command === "interactions") await interactions();
else if (command === "compare") await compare();
else throw new Error(`unknown command ${command}`);
