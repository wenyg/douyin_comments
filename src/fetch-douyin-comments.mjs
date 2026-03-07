#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { chromium } from "playwright";

const DEFAULT_COMMENT_PAGE_URL =
  "https://creator.douyin.com/creator-micro/interactive/comment";
const DEFAULT_USER_DATA_DIR = path.resolve(".playwright/douyin-profile");

function printHelp() {
  console.log(`
Usage:
  npm run comments -- [options]

Options:
  --list-works              Fetch and print all works from the side sheet
  --work-id <item_id>       Select a work by item_id
  --work-title <title>      Select a work by title
  --limit <n>               Max number of comments to collect (default: 200)
  --navigation-timeout-ms <ms>  Max wait for page navigation (default: 60000)
  --ui-timeout-ms <ms>      Max wait for key page elements to appear (default: 30000)
  --works-timeout-ms <ms>   Max wait for the works list to appear (default: 45000)
  --works-idle-ms <ms>      Works list idle window before stopping (default: 5000)
  --comments-timeout-ms <ms> Max wait for comment collection (default: 90000)
  --comments-idle-ms <ms>   Comment idle window before stopping (default: 5000)
  --output <path>           Write JSON result to a file
  --headless                Run Chromium in headless mode
  --user-data-dir <path>    Playwright persistent profile path
  --page-url <url>          Override the creator comment page URL
  --expand-replies          Best-effort expansion of "条回复" blocks before scraping
  --help                    Print this help
  `);
}

function normalizeText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function toPositiveInteger(rawValue, flagName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flagName} expects a positive integer, received: ${rawValue}`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    pageUrl: DEFAULT_COMMENT_PAGE_URL,
    userDataDir: DEFAULT_USER_DATA_DIR,
    output: "",
    workId: "",
    workTitle: "",
    listWorks: false,
    limit: 200,
    navigationTimeoutMs: 60000,
    uiTimeoutMs: 30000,
    worksTimeoutMs: 45000,
    worksIdleMs: 5000,
    commentsTimeoutMs: 90000,
    commentsIdleMs: 5000,
    headless: false,
    expandReplies: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--list-works":
        args.listWorks = true;
        break;
      case "--work-id":
        args.workId = normalizeText(argv[index + 1] ?? "");
        index += 1;
        break;
      case "--work-title":
        args.workTitle = normalizeText(argv[index + 1] ?? "");
        index += 1;
        break;
      case "--limit":
        args.limit = toPositiveInteger(argv[index + 1], "--limit");
        index += 1;
        break;
      case "--navigation-timeout-ms":
        args.navigationTimeoutMs = toPositiveInteger(
          argv[index + 1],
          "--navigation-timeout-ms"
        );
        index += 1;
        break;
      case "--ui-timeout-ms":
        args.uiTimeoutMs = toPositiveInteger(argv[index + 1], "--ui-timeout-ms");
        index += 1;
        break;
      case "--works-timeout-ms":
        args.worksTimeoutMs = toPositiveInteger(argv[index + 1], "--works-timeout-ms");
        index += 1;
        break;
      case "--works-idle-ms":
        args.worksIdleMs = toPositiveInteger(argv[index + 1], "--works-idle-ms");
        index += 1;
        break;
      case "--comments-timeout-ms":
        args.commentsTimeoutMs = toPositiveInteger(
          argv[index + 1],
          "--comments-timeout-ms"
        );
        index += 1;
        break;
      case "--comments-idle-ms":
        args.commentsIdleMs = toPositiveInteger(argv[index + 1], "--comments-idle-ms");
        index += 1;
        break;
      case "--output":
        args.output = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--headless":
        args.headless = true;
        break;
      case "--expand-replies":
        args.expandReplies = true;
        break;
      case "--user-data-dir":
        args.userDataDir = path.resolve(argv[index + 1] ?? "");
        index += 1;
        break;
      case "--page-url":
        args.pageUrl = argv[index + 1] ?? DEFAULT_COMMENT_PAGE_URL;
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatUnixSeconds(rawValue) {
  const seconds = Number(rawValue);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeWork(rawWork) {
  const itemId = String(
    rawWork?.item_id ?? rawWork?.aweme_id ?? rawWork?.id ?? rawWork?.itemId ?? ""
  );

  if (!itemId) {
    return null;
  }

  const title = normalizeText(
    rawWork?.title ?? rawWork?.desc ?? rawWork?.name ?? rawWork?.content ?? `作品-${itemId}`
  );

  const publishText = normalizeText(
    rawWork?.publish_time_desc ??
      rawWork?.create_time_desc ??
      rawWork?.publish_time_text ??
      rawWork?.publish_time ??
      formatUnixSeconds(rawWork?.create_time ?? rawWork?.aweme_create_time)
  );

  return {
    itemId,
    secItemId: String(rawWork?.sec_item_id ?? rawWork?.sec_aweme_id ?? ""),
    title,
    publishText,
    source: "api",
    raw: rawWork
  };
}

function createWorkCollector(page) {
  const worksById = new Map();
  let responseCount = 0;
  let lastResponseAt = 0;
  let lastChangeAt = 0;

  const onResponse = async (response) => {
    if (!response.url().includes("/aweme/v1/creator/item/list/")) {
      return;
    }

    responseCount += 1;
    lastResponseAt = Date.now();

    try {
      const payload = await response.json();
      const workList =
        payload?.work_list ??
        payload?.data?.work_list ??
        payload?.data?.list ??
        payload?.item_list ??
        [];

      if (!Array.isArray(workList)) {
        return;
      }

      for (const rawWork of workList) {
        const work = normalizeWork(rawWork);
        if (!work) {
          continue;
        }

        if (!worksById.has(work.itemId)) {
          lastChangeAt = Date.now();
        }
        worksById.set(work.itemId, work);
      }
    } catch (error) {
      console.warn(`Failed to parse works response: ${error.message}`);
    }
  };

  page.on("response", onResponse);

  return {
    values() {
      return [...worksById.values()];
    },
    state() {
      return {
        count: worksById.size,
        responseCount,
        lastResponseAt,
        lastChangeAt
      };
    },
    dispose() {
      page.off("response", onResponse);
    }
  };
}

async function promptForEnter(message) {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    await terminal.question(`${message}\n`);
  } finally {
    terminal.close();
  }
}

async function ensureCommentPageReady(page, pageUrl, options) {
  await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.navigationTimeoutMs
  });

  const selectWorkButton = page
    .locator('button:has-text("选择作品"), [role="button"]:has-text("选择作品")')
    .first();

  try {
    await selectWorkButton.waitFor({ state: "visible", timeout: options.uiTimeoutMs });
    return;
  } catch (error) {
    console.log("未检测到创作者评论页入口，请先在浏览器中完成登录。");
  }

  await promptForEnter("完成登录并进入创作者中心评论页后，按 Enter 继续");
  await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.navigationTimeoutMs
  });
  await selectWorkButton.waitFor({ state: "visible", timeout: options.uiTimeoutMs });
}

async function openWorksSideSheet(page, options) {
  const sideSheet = page.locator(".douyin-creator-interactive-sidesheet-body").first();

  if (await sideSheet.isVisible().catch(() => false)) {
    return sideSheet;
  }

  const trigger = page
    .locator('button:has-text("选择作品"), [role="button"]:has-text("选择作品")')
    .first();

  await trigger.click();
  await sideSheet.waitFor({ state: "visible", timeout: options.uiTimeoutMs });
  return sideSheet;
}

async function inspectWorksInSideSheet(sideSheet) {
  return sideSheet.evaluate((root) => {
    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    const splitLines = (value = "") =>
      value
        .split(/\n+/)
        .map((line) => normalize(line))
        .filter(Boolean);

    const getLines = (node) => splitLines(node.innerText || node.textContent || "");

    const isCandidate = (node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      const lines = getLines(node);
      if (lines.length < 2 || lines.length > 8) {
        return false;
      }

      const publishLines = lines.filter((line) => line.includes("发布于"));
      if (publishLines.length !== 1) {
        return false;
      }

      const nonPublishLines = lines.filter((line) => !line.includes("发布于"));
      if (nonPublishLines.length < 1) {
        return false;
      }

      const text = normalize(node.innerText || node.textContent || "");
      if (!text || text.length > 200) {
        return false;
      }

      const rect = node.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 24) {
        return false;
      }

      return true;
    };

    for (const marked of root.querySelectorAll("[data-codex-work-card]")) {
      marked.removeAttribute("data-codex-work-card");
    }

    const rawCandidates = Array.from(root.querySelectorAll("*")).filter(isCandidate);
    const candidates = rawCandidates.filter((candidate) => {
      return !rawCandidates.some((other) => other !== candidate && candidate.contains(other));
    });

    return candidates.map((node, index) => {
      node.setAttribute("data-codex-work-card", String(index));

      const lines = getLines(node);
      const publishText = lines.find((line) => line.includes("发布于")) || "";
      const title =
        lines.find((line) => line && !line.includes("发布于")) || `作品-${index + 1}`;

      return {
        index,
        itemId: "",
        secItemId: "",
        title,
        publishText,
        source: "dom_fallback"
      };
    });
  });
}

async function extractWorksFromSideSheet(sideSheet) {
  const works = await inspectWorksInSideSheet(sideSheet);

  const seen = new Set();
  return works.filter((work) => {
    const signature = `${work.title}|${work.publishText}`;
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

async function fetchAllWorks(page, workCollector, options) {
  const sideSheet = await openWorksSideSheet(page, options);
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let previousDomCount = -1;
  let previousApiCount = -1;
  let previousResponseCount = -1;
  let latestDomWorks = [];

  while (Date.now() - startedAt < options.timeoutMs) {
    latestDomWorks = await extractWorksFromSideSheet(sideSheet);
    const domCount = latestDomWorks.length;
    const collectorState = workCollector.state();
    const apiCount = collectorState.count;
    const responseCount = collectorState.responseCount;
    const hasSignal = domCount > 0 || responseCount > 0 || apiCount > 0;
    const changed =
      domCount !== previousDomCount ||
      apiCount !== previousApiCount ||
      responseCount !== previousResponseCount;

    if (changed) {
      lastProgressAt = Date.now();
    }

    if (hasSignal && Date.now() - lastProgressAt >= options.idleMs) {
      break;
    }

    previousDomCount = domCount;
    previousApiCount = apiCount;
    previousResponseCount = responseCount;

    await sideSheet.evaluate((element, hasSignalNow) => {
      if (!hasSignalNow) {
        element.scrollTop = 0;
        return;
      }

      element.scrollTop += Math.max(element.clientHeight * 1.5, 1200);
    }, hasSignal);
    await page.waitForTimeout(hasSignal ? 1500 : 800);
  }

  const apiWorks = workCollector.values();
  if (apiWorks.length > 0) {
    return apiWorks;
  }

  const domFallbackWorks = latestDomWorks.length > 0 ? latestDomWorks : await extractWorksFromSideSheet(sideSheet);
  if (domFallbackWorks.length > 0) {
    return domFallbackWorks;
  }

  const finalState = workCollector.state();
  if (finalState.responseCount === 0) {
    throw new Error(
      `Timed out waiting for works list after ${options.timeoutMs}ms. Try --works-timeout-ms 90000 or check login/network state.`
    );
  }

  return [];
}

function hasWorkIdentity(work) {
  return Boolean(work.itemId || work.title);
}

function formatWorkForOutput(work, index) {
  return {
    index,
    itemId: work.itemId,
    secItemId: work.secItemId,
    title: work.title,
    publishText: work.publishText,
    source: work.source ?? "unknown"
  };
}

function ensureSelectableWork(targetWork) {
  if (!hasWorkIdentity(targetWork)) {
    throw new Error("The selected work is missing both item_id and title, cannot continue.");
  }
}

function getWorksOutput(works) {
  return works.map((work, index) => formatWorkForOutput(work, index));
}

function getSelectedWorkOutput(work) {
  if (!work) {
    return null;
  }

  return {
    itemId: work.itemId,
    secItemId: work.secItemId,
    title: work.title,
    publishText: work.publishText,
    source: work.source ?? "unknown"
  };
}

async function scrollWorkCardIntoView(sideSheet, title) {
  await sideSheet.evaluate((element, titleNeedle) => {
    const compact = (value = "") => value.replace(/\s+/g, "");
    const target = Array.from(element.querySelectorAll("[data-codex-work-card]")).find((child) => {
      return child instanceof HTMLElement && compact(child.innerText || "").includes(titleNeedle);
    });

    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center" });
    }
  }, title.replace(/\s+/g, ""));
}

async function fetchAllWorksWithRetry(page, workCollector, options) {
  try {
    return await fetchAllWorks(page, workCollector, options);
  } catch (error) {
    const sideSheet = await openWorksSideSheet(page, options);
    await sideSheet.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForTimeout(1000);
    return fetchAllWorks(page, workCollector, options);
  }
}

function pickTargetWork(works, workId, workTitle) {
  if (workId) {
    const match = works.find((work) => work.itemId === workId);
    if (!match) {
      throw new Error(`No work matched item_id: ${workId}`);
    }
    return match;
  }

  if (!workTitle) {
    return null;
  }

  const normalizedTitle = normalizeText(workTitle).toLowerCase();
  const exactMatch = works.find(
    (work) => normalizeText(work.title).toLowerCase() === normalizedTitle
  );
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches = works.filter((work) =>
    normalizeText(work.title).toLowerCase().includes(normalizedTitle)
  );

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `Title matched multiple works, please refine --work-title or use --work-id. Matches: ${partialMatches
        .map((work) => `${work.itemId}:${work.title}`)
        .join(", ")}`
    );
  }

  throw new Error(`No work matched title: ${workTitle}`);
}

async function selectWorkFromSideSheet(page, targetWork, options) {
  ensureSelectableWork(targetWork);
  const sideSheet = await openWorksSideSheet(page, options);
  await inspectWorksInSideSheet(sideSheet);
  await scrollWorkCardIntoView(sideSheet, targetWork.title);

  const found = await sideSheet.evaluate((element, work) => {
    const compact = (value = "") => value.replace(/\s+/g, "");
    const titleNeedle = compact(work.title);
    const publishNeedle = compact(work.publishText);

    for (const child of Array.from(element.querySelectorAll("[data-codex-target-work]"))) {
      if (child instanceof HTMLElement) {
        child.removeAttribute("data-codex-target-work");
      }
    }

    const cards = Array.from(element.querySelectorAll("[data-codex-work-card]"));

    for (const child of cards) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      const text = compact(child.innerText || "");
      if (!text.includes(titleNeedle)) {
        continue;
      }

      if (publishNeedle && !text.includes(publishNeedle)) {
        continue;
      }

      child.setAttribute("data-codex-target-work", "true");
      return true;
    }

    for (const child of cards) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      const text = compact(child.innerText || "");
      if (!text.includes(titleNeedle)) {
        continue;
      }

      child.setAttribute("data-codex-target-work", "true");
      return true;
    }

    return false;
  }, targetWork);

  if (!found) {
    throw new Error(`Failed to find the target work card in the side sheet: ${targetWork.title}`);
  }

  const workCard = sideSheet.locator('[data-codex-target-work="true"]').first();
  await workCard.scrollIntoViewIfNeeded();
  await workCard.click();
  await page.waitForTimeout(1800);
}

async function waitForCommentsArea(page, options) {
  const candidates = [
    page.locator('[comment-item]').first(),
    page.locator('button:has-text("回复"), div:has-text("回复")').first()
  ];

  for (const locator of candidates) {
    try {
      await locator.waitFor({ state: "visible", timeout: options.uiTimeoutMs });
      return;
    } catch (error) {
      // Ignore and try the next locator.
    }
  }

  throw new Error(
    `Timed out waiting for the comment area after ${options.uiTimeoutMs}ms. Try --ui-timeout-ms 60000.`
  );
}

async function markCommentScrollContainer(page) {
  const marked = await page.evaluate(() => {
    const marker = "data-codex-comment-scroll";
    const elements = [document.documentElement, document.body, ...document.querySelectorAll("main, section, div")];

    for (const element of document.querySelectorAll(`[${marker}]`)) {
      element.removeAttribute(marker);
    }

    let bestElement = null;
    let bestScore = -1;

    for (const element of elements) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY;
      const hasScrollableOverflow =
        overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
      const scrollableDelta = element.scrollHeight - element.clientHeight;
      const markerCount = Array.from(element.querySelectorAll("button, div, span")).filter(
        (node) => {
          const text = (node.textContent || "").trim();
          return text === "回复" || text.includes("条回复") || text === "收起";
        }
      ).length;

      if (markerCount === 0) {
        continue;
      }

      const score =
        markerCount * 20 +
        (hasScrollableOverflow ? 100 : 0) +
        Math.max(scrollableDelta, 0) / 50 +
        Math.max(element.clientHeight, 0) / 25;

      if (score > bestScore) {
        bestScore = score;
        bestElement = element;
      }
    }

    const target =
      bestElement instanceof HTMLElement
        ? bestElement
        : document.scrollingElement instanceof HTMLElement
          ? document.scrollingElement
          : document.documentElement;

    target.setAttribute(marker, "true");
    return true;
  });

  if (!marked) {
    throw new Error("Failed to locate the comment scroll container.");
  }

  return page.locator('[data-codex-comment-scroll="true"]').first();
}

async function expandReplyThreads(page) {
  const expanded = await page.evaluate(() => {
    const toggles = Array.from(document.querySelectorAll("button, div"))
      .filter((node) => {
        const text = (node.textContent || "").trim();
        return text.includes("条回复") && text.length <= 20;
      })
      .slice(0, 12);

    let count = 0;
    for (const toggle of toggles) {
      if (!(toggle instanceof HTMLElement)) {
        continue;
      }

      toggle.click();
      count += 1;
    }

    return count;
  });

  if (expanded > 0) {
    await page.waitForTimeout(800);
  }
}

async function extractCommentSnapshot(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector('[data-codex-comment-scroll="true"]') || document.body;

    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    const metaPattern =
      /(分钟前|小时前|天前|昨天|前天|刚刚|IP属地|发布于|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}:\d{2}|赞|条回复|收起)/;
    const controlPattern = /^(回复|发送|收起)$/;
    const pureNumberPattern = /^\d+$/;

    const collectBlocks = () => {
      const explicitBlocks = Array.from(root.querySelectorAll("[comment-item]"));
      if (explicitBlocks.length > 0) {
        return explicitBlocks;
      }

      const replyButtons = Array.from(root.querySelectorAll("button, div, span")).filter(
        (node) => normalize(node.textContent || "") === "回复"
      );

      const blocks = [];
      const seen = new Set();

      const findBlock = (node) => {
        let current = node.parentElement;
        while (current && current !== root) {
          if (!(current instanceof HTMLElement)) {
            return null;
          }

          const text = normalize(current.innerText || "");
          const replyButtonCount = Array.from(current.querySelectorAll("button, div, span")).filter(
            (child) => normalize(child.textContent || "") === "回复"
          ).length;
          const hasAvatar = Boolean(
            current.querySelector('img, [class*="avatar"], [class*="Avatar"]')
          );

          if (hasAvatar && replyButtonCount >= 1 && replyButtonCount <= 3 && text.length <= 1200) {
            return current;
          }

          current = current.parentElement;
        }

        return null;
      };

      for (const replyButton of replyButtons) {
        const block = findBlock(replyButton);
        if (!block || seen.has(block)) {
          continue;
        }

        seen.add(block);
        blocks.push(block);
      }

      return blocks;
    };

    return collectBlocks()
      .map((block, order) => {
        const rawLines = (block.innerText || "")
          .split(/\n+/)
          .map((line) => normalize(line))
          .filter(Boolean);

        if (rawLines.length === 0) {
          return null;
        }

        const contentLines = rawLines.filter(
          (line) => !controlPattern.test(line) && !pureNumberPattern.test(line)
        );

        if (contentLines.length < 2) {
          return null;
        }

        const username = contentLines[0];
        let commentText = "";
        let publishText = "";
        const extraLines = [];

        for (let index = 1; index < contentLines.length; index += 1) {
          const line = contentLines[index];
          if (!commentText && !metaPattern.test(line)) {
            commentText = line;
            continue;
          }

          if (!publishText && metaPattern.test(line)) {
            publishText = line;
            continue;
          }

          extraLines.push(line);
        }

        if (!username || !commentText) {
          return null;
        }

        const replyThreadLine = rawLines.find((line) => line.includes("条回复")) || "";
        const replyCount = Number.parseInt(replyThreadLine.match(/\d+/)?.[0] ?? "0", 10);
        const hasAuthorReply = Array.from(block.querySelectorAll("span, div")).some(
          (node) => normalize(node.textContent || "") === "作者"
        );

        return {
          username,
          commentText,
          publishText,
          replyCount: Number.isNaN(replyCount) ? 0 : replyCount,
          hasAuthorReply,
          extraLines,
          rawText: normalize(block.innerText || ""),
          signature: [username, commentText, publishText].map(normalize).join("|"),
          order
        };
      })
      .filter(Boolean);
  });
}

async function collectComments(page, options) {
  await waitForCommentsArea(page, options);

  const scrollContainer = await markCommentScrollContainer(page);
  const commentsBySignature = new Map();
  const startedAt = Date.now();
  let lastProgressAt = startedAt;

  while (Date.now() - startedAt < options.timeoutMs) {
    if (options.expandReplies) {
      await expandReplyThreads(page);
    }

    const snapshot = await extractCommentSnapshot(page);
    let additions = 0;

    for (const comment of snapshot) {
      if (!comment.signature || commentsBySignature.has(comment.signature)) {
        continue;
      }

      commentsBySignature.set(comment.signature, comment);
      additions += 1;
      lastProgressAt = Date.now();

      if (commentsBySignature.size >= options.limit) {
        break;
      }
    }

    if (commentsBySignature.size >= options.limit) {
      break;
    }

    const scrollState = await scrollContainer.evaluate((element) => {
      const before = element.scrollTop;
      const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
      const next = Math.min(before + Math.max(element.clientHeight * 0.9, 900), maxScrollTop);
      element.scrollTop = next;
      return {
        before,
        after: element.scrollTop,
        maxScrollTop
      };
    });

    await page.waitForTimeout(1200);

    const idleElapsedMs = Date.now() - lastProgressAt;
    const reachedBottom =
      scrollState.after === scrollState.before || scrollState.after >= scrollState.maxScrollTop;

    if (reachedBottom && idleElapsedMs >= options.idleMs) {
      break;
    }
  }

  return [...commentsBySignature.values()]
    .slice(0, options.limit)
    .map(({ signature, ...comment }) => comment);
}

async function emitResult(result, outputPath) {
  const payload = JSON.stringify(result, null, 2);

  if (!outputPath) {
    console.log(payload);
    return;
  }

  const absolutePath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${payload}\n`, "utf8");
  console.log(`Wrote result to ${absolutePath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const context = await chromium.launchPersistentContext(args.userDataDir, {
    headless: args.headless,
    viewport: { width: 1440, height: 1200 }
  });

  const page = context.pages()[0] ?? (await context.newPage());
  context.setDefaultTimeout(args.uiTimeoutMs);
  context.setDefaultNavigationTimeout(args.navigationTimeoutMs);
  page.setDefaultTimeout(args.uiTimeoutMs);
  page.setDefaultNavigationTimeout(args.navigationTimeoutMs);
  const workCollector = createWorkCollector(page);

  try {
    await ensureCommentPageReady(page, args.pageUrl, {
      navigationTimeoutMs: args.navigationTimeoutMs,
      uiTimeoutMs: args.uiTimeoutMs
    });

    const needsWorks = args.listWorks || Boolean(args.workId || args.workTitle);
    let works = [];

    if (needsWorks) {
      works = await fetchAllWorksWithRetry(page, workCollector, {
        timeoutMs: args.worksTimeoutMs,
        idleMs: args.worksIdleMs,
        uiTimeoutMs: args.uiTimeoutMs
      });
    }

    if (args.listWorks) {
      await emitResult(
        {
          pageUrl: args.pageUrl,
          count: works.length,
          works: getWorksOutput(works)
        },
        args.output
      );
      return;
    }

    const targetWork = pickTargetWork(works, args.workId, args.workTitle);
    if (targetWork) {
      await selectWorkFromSideSheet(page, targetWork, {
        uiTimeoutMs: args.uiTimeoutMs
      });
    }

    const comments = await collectComments(page, {
      limit: args.limit,
      expandReplies: args.expandReplies,
      timeoutMs: args.commentsTimeoutMs,
      idleMs: args.commentsIdleMs,
      uiTimeoutMs: args.uiTimeoutMs
    });

    await emitResult(
      {
        fetchedAt: new Date().toISOString(),
        pageUrl: args.pageUrl,
        selectedWork: getSelectedWorkOutput(targetWork),
        count: comments.length,
        comments
      },
      args.output
    );
  } finally {
    workCollector.dispose();
    await context.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
