import "server-only";

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "playwright-core";

import { PRINT_TOKEN_HEADER, signPrintToken } from "./print-token";

// PDFs are printed by headless Chromium from the app's own print pages, so
// they match the preview (RES-5, RES-7). One browser is shared by every
// render and relaunched if it crashes; a few pages print at once and the
// rest wait their turn. After a while without renders the browser closes to
// give its memory back, and the next render starts it again.

/**
 * Pages printed at the same time; the rest queue. Measured with 2 vCPUs and
 * 1 GB (E11-6): a render takes about 0.25 s, so more at once only shares the
 * CPU; six requested together finish in 1.4 s at a peak of 520 MB.
 */
export const MAX_CONCURRENT_RENDERS = 2;
/** Close the browser after this long without a render. */
const IDLE_MS = 5 * 60_000;
const NAVIGATION_TIMEOUT_MS = 20_000;

type Pool = {
  browser: Promise<Browser> | null;
  active: number;
  queue: (() => void)[];
  idleTimer: ReturnType<typeof setTimeout> | null;
};

// Kept on globalThis so the dev server's hot reloads don't leak browsers.
const globalForPdf = globalThis as unknown as { pdfPool?: Pool };
const pool: Pool = (globalForPdf.pdfPool ??= { browser: null, active: 0, queue: [], idleTimer: null });

/** Where the app itself is listening, for Chromium to open print pages. */
function appOrigin(): string {
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Finds a browser that is actually installed on the host. `playwright-core`
 * does not download one itself, and a local macOS install commonly has Chrome
 * but not Playwright's headless shell.
 */
export function browserExecutablePath(): string | undefined {
  const candidates = [
    process.env.DOSSIER_CHROME_PATH?.trim(),
    chromium.executablePath(),
    ...(process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          join(homedir(), "Applications/Chromium.app/Contents/MacOS/Chromium"),
        ]
      : process.platform === "win32"
        ? [
            join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
            join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
            join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"]),
  ];
  return candidates.find((candidate): candidate is string => candidate !== undefined && candidate !== "" && existsSync(candidate));
}

function browser(): Promise<Browser> {
  if (!pool.browser) {
    const executablePath = browserExecutablePath();
    if (!executablePath) {
      throw new Error(
        "No Chromium-compatible browser was found. Install Google Chrome or run `yarn playwright install --with-deps --only-shell chromium`, or set DOSSIER_CHROME_PATH.",
      );
    }
    const launching = chromium
      .launch({
        // Docker gives /dev/shm only 64 MB.
        args: ["--disable-dev-shm-usage"],
        executablePath,
      })
      .then((launched) => {
        // A crashed or closed browser is replaced on the next render.
        launched.on("disconnected", () => {
          if (pool.browser === launching) pool.browser = null;
        });
        return launched;
      });
    launching.catch(() => {
      if (pool.browser === launching) pool.browser = null;
    });
    pool.browser = launching;
  }
  return pool.browser;
}

async function acquire(): Promise<void> {
  if (pool.idleTimer) clearTimeout(pool.idleTimer);
  pool.idleTimer = null;
  if (pool.active < MAX_CONCURRENT_RENDERS) {
    pool.active += 1;
    return;
  }
  // The slot is handed over by release(), so `active` stays the same.
  await new Promise<void>((resolve) => pool.queue.push(resolve));
}

function release(): void {
  const next = pool.queue.shift();
  if (next) return next();
  pool.active -= 1;
  if (pool.active === 0) {
    pool.idleTimer = setTimeout(() => {
      const closing = pool.browser;
      pool.browser = null;
      void closing?.then((open) => open.close()).catch(() => {});
    }, IDLE_MS);
    pool.idleTimer.unref?.();
  }
}

/**
 * Prints an app page (e.g. "/print/base") to a PDF at the page size its
 * print CSS sets. Chromium may only talk to the app: anything else is
 * blocked, so fonts come from the bundle and nothing leaves the server.
 */
export async function renderPdf(path: string): Promise<Uint8Array> {
  await acquire();
  try {
    const origin = appOrigin();
    const context = await (await browser()).newContext({
      extraHTTPHeaders: { [PRINT_TOKEN_HEADER]: await signPrintToken(path) },
    });
    try {
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"),
      );
      const page = await context.newPage();
      const response = await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
      if (!response?.ok()) throw new Error(`The print page ${path} answered ${response?.status() ?? "nothing"}.`);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      return await page.pdf({ preferCSSPageSize: true, printBackground: true });
    } finally {
      await context.close();
    }
  } finally {
    release();
  }
}
