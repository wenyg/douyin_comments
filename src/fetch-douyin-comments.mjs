#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { chromium } from "playwright";

const DEFAULT_COMMENT_PAGE_URL =
  "https://creator.douyin.com/creator-micro/interactive/comment";
const DEFAULT_USER_DATA_DIR = path.resolve(".playwright/douyin-profile");
const DEFAULT_REPLY_HISTORY_FILE = path.resolve(".playwright/reply-history.json");

function printHelp() {
  console.log(`
Usage:
  npm run comments -- [options]

Options:
  --list-works              Fetch and print all works from the side sheet
  --work-id <item_id>       Select a work by item_id
  --work-title <title>      Select a work by title
  --unreplied-only          Collect only unreplied comments without sending replies
  --reply-message <text>    Reply to unreplied comments with the given text
  --reply-plan-file <path>  Reply to specific comments from a JSON plan file
  --reply-dry-run           Enter reply mode but stop before sending any reply
  --reply-limit <n>         Max number of replies to send (default: 20)
  --reply-timeout-ms <ms>   Max wait for one reply flow (default: 30000)
  --reply-settle-ms <ms>    Wait after sending one reply (default: 1800)
  --reply-type-delay-ms <ms> Delay between typed chars (default: 100)
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
  --expand-replies          Expand nested replies before scraping (default behavior)
  --no-expand-replies       Disable nested reply expansion during scraping
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
    unrepliedOnly: false,
    replyMessage: "",
    replyPlanFile: "",
    replyDryRun: false,
    replyLimit: 20,
    replyTimeoutMs: 30000,
    replySettleMs: 1800,
    replyTypeDelayMs: 100,
    listWorks: false,
    limit: 200,
    navigationTimeoutMs: 60000,
    uiTimeoutMs: 30000,
    worksTimeoutMs: 45000,
    worksIdleMs: 5000,
    commentsTimeoutMs: 90000,
    commentsIdleMs: 5000,
    headless: false,
    expandReplies: true
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
      case "--unreplied-only":
        args.unrepliedOnly = true;
        break;
      case "--reply-message":
        args.replyMessage = String(argv[index + 1] ?? "").trim();
        index += 1;
        break;
      case "--reply-plan-file":
        args.replyPlanFile = path.resolve(argv[index + 1] ?? "");
        index += 1;
        break;
      case "--reply-dry-run":
        args.replyDryRun = true;
        break;
      case "--reply-limit":
        args.replyLimit = toPositiveInteger(argv[index + 1], "--reply-limit");
        index += 1;
        break;
      case "--reply-timeout-ms":
        args.replyTimeoutMs = toPositiveInteger(argv[index + 1], "--reply-timeout-ms");
        index += 1;
        break;
      case "--reply-settle-ms":
        args.replySettleMs = toPositiveInteger(argv[index + 1], "--reply-settle-ms");
        index += 1;
        break;
      case "--reply-type-delay-ms":
        args.replyTypeDelayMs = toPositiveInteger(argv[index + 1], "--reply-type-delay-ms");
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
      case "--no-expand-replies":
        args.expandReplies = false;
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

function normalizeLookupText(value = "") {
  return normalizeText(value).toLowerCase();
}

function logReplyFilterDebug(message, details = null) {
  if (details === null || details === undefined) {
    console.error(`[reply-filter] ${message}`);
    return;
  }

  const suffix =
    typeof details === "string" ? details : JSON.stringify(details, null, 2);
  console.error(`[reply-filter] ${message}: ${suffix}`);
}

function getCommentSignature(comment) {
  if (comment?.signature) {
    return comment.signature;
  }

  return [
    normalizeText(comment?.username ?? ""),
    normalizeText(comment?.commentText ?? ""),
    normalizeText(comment?.publishText ?? "")
  ].join("|");
}

function mergeReplyArrays(existingReplies = [], incomingReplies = []) {
  const repliesBySignature = new Map();

  for (const reply of existingReplies) {
    const signature = getCommentSignature(reply);
    if (!signature) {
      continue;
    }

    repliesBySignature.set(signature, reply);
  }

  let additions = 0;
  for (const reply of incomingReplies) {
    const signature = getCommentSignature(reply);
    if (!signature) {
      continue;
    }

    const existingReply = repliesBySignature.get(signature);
    if (!existingReply) {
      repliesBySignature.set(signature, reply);
      additions += 1;
      continue;
    }

    repliesBySignature.set(signature, {
      ...existingReply,
      ...reply,
      publishText:
        reply.publishText && reply.publishText.length >= (existingReply.publishText ?? "").length
          ? reply.publishText
          : existingReply.publishText,
      extraLines:
        Array.isArray(reply.extraLines) &&
        reply.extraLines.length >= (existingReply.extraLines?.length ?? 0)
          ? reply.extraLines
          : existingReply.extraLines,
      rawText:
        (reply.rawText ?? "").length >= (existingReply.rawText ?? "").length
          ? reply.rawText
          : existingReply.rawText,
      hasAuthorBadge: Boolean(existingReply.hasAuthorBadge || reply.hasAuthorBadge),
      order:
        typeof existingReply.order === "number" && typeof reply.order === "number"
          ? Math.min(existingReply.order, reply.order)
          : typeof existingReply.order === "number"
            ? existingReply.order
            : reply.order
    });
  }

  return {
    replies: [...repliesBySignature.values()].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0)
    ),
    additions
  };
}

function sanitizeCollectedReply(reply) {
  const { signature, order, replyTo = null, ...rest } = reply;
  return {
    ...rest,
    replyTo,
    reply_to: replyTo
  };
}

function sanitizeCollectedComment(comment) {
  const replies = Array.isArray(comment.replies)
    ? comment.replies
        .slice()
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        .map(sanitizeCollectedReply)
    : [];
  const { signature, domIndex, order, replyTo = null, ...rest } = comment;

  return {
    ...rest,
    replyTo,
    reply_to: replyTo,
    collectedReplyCount: replies.length,
    replies
  };
}

function getSelectedWorkIdentity(work) {
  if (!work) {
    return "all-works";
  }

  if (work.itemId) {
    return `item:${work.itemId}`;
  }

  return `title:${normalizeLookupText(work.title)}|publish:${normalizeLookupText(work.publishText)}`;
}

function getReplyHistoryKey(selectedWork, comment, replyMessage) {
  return [
    getSelectedWorkIdentity(selectedWork),
    getCommentSignature(comment),
    normalizeLookupText(replyMessage)
  ].join("::");
}

async function loadReplyHistory(filePath = DEFAULT_REPLY_HISTORY_FILE) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [];
    const normalizedEntries = entries
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        key: String(entry.key ?? ""),
        selectedWork: entry.selectedWork ?? null,
        username: normalizeText(String(entry.username ?? "")),
        commentText: normalizeText(String(entry.commentText ?? "")),
        publishText: normalizeText(String(entry.publishText ?? "")),
        replyMessage: String(entry.replyMessage ?? "").trim(),
        repliedAt: String(entry.repliedAt ?? "")
      }))
      .filter((entry) => entry.key && entry.replyMessage);

    return {
      filePath,
      entries: normalizedEntries,
      keys: new Set(normalizedEntries.map((entry) => entry.key))
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        filePath,
        entries: [],
        keys: new Set()
      };
    }

    throw new Error(
      `Failed to load reply history from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function persistReplyHistory(history) {
  const payload = JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      entries: history.entries
    },
    null,
    2
  );

  await fs.mkdir(path.dirname(history.filePath), { recursive: true });
  await fs.writeFile(history.filePath, `${payload}\n`, "utf8");
}

function findReplyHistoryEntry(history, selectedWork, comment, replyMessage) {
  if (!history) {
    return null;
  }

  const key = getReplyHistoryKey(selectedWork, comment, replyMessage);
  return history.entries.find((entry) => entry.key === key) ?? null;
}

async function recordReplyHistory(history, selectedWork, comment, replyMessage) {
  if (!history) {
    return;
  }

  const key = getReplyHistoryKey(selectedWork, comment, replyMessage);
  if (history.keys.has(key)) {
    return;
  }

  history.keys.add(key);
  history.entries.push({
    key,
    selectedWork: selectedWork
      ? {
          itemId: selectedWork.itemId,
          title: selectedWork.title,
          publishText: selectedWork.publishText
        }
      : null,
    username: normalizeText(comment.username ?? ""),
    commentText: normalizeText(comment.commentText ?? ""),
    publishText: normalizeText(comment.publishText ?? ""),
    replyMessage,
    repliedAt: new Date().toISOString()
  });
  await persistReplyHistory(history);
}

function normalizeReplyPlanEntry(rawEntry, index, fallbackReplyMessage) {
  if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
    throw new Error(`reply plan item ${index + 1} must be an object`);
  }

  const username = normalizeText(String(rawEntry.username ?? ""));
  const commentText = normalizeText(
    String(rawEntry.commentText ?? rawEntry.comment ?? rawEntry.text ?? "")
  );
  const publishText = normalizeText(
    String(rawEntry.publishText ?? rawEntry.publish ?? rawEntry.time ?? "")
  );
  const replyMessage = String(rawEntry.replyMessage ?? fallbackReplyMessage ?? "").trim();

  if (!commentText) {
    throw new Error(`reply plan item ${index + 1} requires commentText`);
  }

  if (!replyMessage) {
    throw new Error(
      `reply plan item ${index + 1} requires replyMessage, or provide --reply-message as fallback`
    );
  }

  return {
    id: index + 1,
    username,
    commentText,
    publishText,
    replyMessage
  };
}

function getReplyPlanIdentity(entry) {
  return [
    normalizeText(entry.username).toLowerCase(),
    normalizeText(entry.commentText).toLowerCase(),
    normalizeText(entry.publishText).toLowerCase()
  ].join("|");
}

async function loadReplyPlan(replyPlanFile, fallbackReplyMessage) {
  const rawContent = await fs.readFile(replyPlanFile, "utf8");
  let parsed;

  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(
      `Failed to parse reply plan JSON at ${replyPlanFile}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const rawEntries = Array.isArray(parsed) ? parsed : parsed?.replies;
  if (!Array.isArray(rawEntries)) {
    throw new Error("reply plan file must be a JSON array or an object with a replies array");
  }

  const plans = rawEntries.map((entry, index) =>
    normalizeReplyPlanEntry(entry, index, fallbackReplyMessage)
  );

  const seen = new Set();
  for (const plan of plans) {
    const identity = getReplyPlanIdentity(plan);
    if (seen.has(identity)) {
      throw new Error(
        `Duplicate reply plan target detected for username="${plan.username}" commentText="${plan.commentText}" publishText="${plan.publishText}"`
      );
    }
    seen.add(identity);
  }

  return plans;
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
      node.setAttribute("data-codex-work-title-key", normalize(title).toLowerCase());
      node.setAttribute("data-codex-work-publish-key", normalize(publishText).toLowerCase());

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

function getWorkKey(work) {
  if (work.itemId) {
    return `id:${work.itemId}`;
  }

  return `text:${normalizeText(work.title).toLowerCase()}|${normalizeText(work.publishText).toLowerCase()}`;
}

function mergeWorkRecords(...works) {
  const availableWorks = works.filter(Boolean);
  if (availableWorks.length === 0) {
    return null;
  }

  const merged = {
    itemId: "",
    secItemId: "",
    title: "",
    publishText: "",
    source: "unknown"
  };

  for (const work of availableWorks) {
    if (!merged.itemId && work.itemId) {
      merged.itemId = work.itemId;
    }

    if (!merged.secItemId && work.secItemId) {
      merged.secItemId = work.secItemId;
    }

    if (!merged.title && work.title) {
      merged.title = work.title;
    }

    if (!merged.publishText && work.publishText) {
      merged.publishText = work.publishText;
    }

    if (merged.source === "unknown" && work.source) {
      merged.source = work.source;
    }
  }

  if (availableWorks.some((work) => work.source === "api")) {
    merged.source = "api";
  }

  return merged;
}

function mergeWorkLists(...lists) {
  const mergedByKey = new Map();

  for (const list of lists) {
    for (const work of list) {
      const key = getWorkKey(work);
      const existing = mergedByKey.get(key);
      mergedByKey.set(key, mergeWorkRecords(existing, work));
    }
  }

  return [...mergedByKey.values()];
}

function findExactTargetWork(works, workId, workTitle) {
  if (workId) {
    return works.find((work) => work.itemId === workId) ?? null;
  }

  if (!workTitle) {
    return null;
  }

  const normalizedTitle = normalizeLookupText(workTitle);
  return (
    works.find((work) => normalizeLookupText(work.title) === normalizedTitle) ?? null
  );
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

async function findTargetWork(page, workCollector, options) {
  const sideSheet = await openWorksSideSheet(page, options);
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let previousDomCount = -1;
  let previousApiCount = -1;
  let previousResponseCount = -1;
  let latestDomWorks = [];
  let bestApiMatch = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    latestDomWorks = await extractWorksFromSideSheet(sideSheet);
    const apiWorks = workCollector.values();
    const collectorState = workCollector.state();
    const domCount = latestDomWorks.length;
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

    const exactDomMatch = findExactTargetWork(
      latestDomWorks,
      options.workId,
      options.workTitle
    );
    const exactApiMatch = findExactTargetWork(apiWorks, options.workId, options.workTitle);
    if (exactApiMatch) {
      bestApiMatch = mergeWorkRecords(bestApiMatch, exactApiMatch);
    }

    if (exactDomMatch) {
      return mergeWorkRecords(exactDomMatch, exactApiMatch, bestApiMatch);
    }

    previousDomCount = domCount;
    previousApiCount = apiCount;
    previousResponseCount = responseCount;

    if (hasSignal && Date.now() - lastProgressAt >= options.idleMs) {
      break;
    }

    await sideSheet.evaluate((element, hasSignalNow) => {
      if (!hasSignalNow) {
        element.scrollTop = 0;
        return;
      }

      element.scrollTop += Math.max(element.clientHeight * 1.5, 1200);
    }, hasSignal);
    await page.waitForTimeout(hasSignal ? 1500 : 800);
  }

  const fallbackWorks = mergeWorkLists(workCollector.values(), latestDomWorks);
  if (bestApiMatch) {
    const fallbackMatch = pickTargetWork(
      mergeWorkLists([bestApiMatch], fallbackWorks),
      options.workId,
      options.workTitle
    );
    return mergeWorkRecords(bestApiMatch, fallbackMatch);
  }
  return pickTargetWork(fallbackWorks, options.workId, options.workTitle);
}

async function findTargetWorkWithRetry(page, workCollector, options) {
  try {
    return await findTargetWork(page, workCollector, options);
  } catch (error) {
    const sideSheet = await openWorksSideSheet(page, options);
    await sideSheet.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForTimeout(1000);
    return findTargetWork(page, workCollector, options);
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

  const normalizedTitle = normalizeLookupText(workTitle);
  const exactMatch = works.find(
    (work) => normalizeLookupText(work.title) === normalizedTitle
  );
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches = works.filter((work) =>
    normalizeLookupText(work.title).includes(normalizedTitle)
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
  const startedAt = Date.now();

  while (Date.now() - startedAt < options.timeoutMs) {
    await inspectWorksInSideSheet(sideSheet);
    const selectionState = await sideSheet.evaluate((element, work) => {
      const normalize = (value = "") => value.replace(/\s+/g, " ").trim().toLowerCase();
      const targetTitle = normalize(work.title);
      const targetPublish = normalize(work.publishText);

      for (const child of Array.from(element.querySelectorAll("[data-codex-target-work]"))) {
        if (child instanceof HTMLElement) {
          child.removeAttribute("data-codex-target-work");
        }
      }

      const cards = Array.from(element.querySelectorAll("[data-codex-work-card]")).filter(
        (child) => child instanceof HTMLElement
      );
      const exactTitleMatches = cards.filter((child) => {
        return child.getAttribute("data-codex-work-title-key") === targetTitle;
      });
      const publishCompatibleMatches = exactTitleMatches.filter((child) => {
        const publishKey = child.getAttribute("data-codex-work-publish-key") || "";
        if (!targetPublish) {
          return true;
        }
        return (
          publishKey === targetPublish ||
          publishKey.includes(targetPublish) ||
          targetPublish.includes(publishKey)
        );
      });

      const finalMatches =
        publishCompatibleMatches.length > 0 ? publishCompatibleMatches : exactTitleMatches;

      if (finalMatches.length === 1) {
        finalMatches[0].setAttribute("data-codex-target-work", "true");
        return {
          status: "found"
        };
      }

      if (finalMatches.length > 1) {
        return {
          status: "ambiguous",
          count: finalMatches.length
        };
      }

      return {
        status: "not_found"
      };
    }, targetWork);

    if (selectionState.status === "found") {
      const workCard = sideSheet.locator('[data-codex-target-work="true"]').first();
      await workCard.scrollIntoViewIfNeeded();
      await workCard.click();
      await page.waitForTimeout(1800);
      return;
    }

    if (selectionState.status === "ambiguous") {
      throw new Error(
        `Multiple visible works matched title "${targetWork.title}". Please use --work-id for an exact selection.`
      );
    }

    const scrollState = await sideSheet.evaluate((element) => {
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

    if (scrollState.after === scrollState.before || scrollState.after >= scrollState.maxScrollTop) {
      break;
    }

    await page.waitForTimeout(800);
  }

  throw new Error(`Failed to find the target work card in the side sheet: ${targetWork.title}`);
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

async function markCommentStatusFilter(page) {
  const marked = await page.evaluate(() => {
    const marker = "data-codex-comment-status-filter";
    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    const knownFilterLabels = new Set(["全部评论", "未回复", "已回复"]);

    for (const element of document.querySelectorAll(`[${marker}]`)) {
      element.removeAttribute(marker);
    }

    const candidates = Array.from(
      document.querySelectorAll('[role="combobox"].douyin-creator-interactive-select')
    ).filter((node) => node instanceof HTMLElement);

    const target =
      candidates.find((node) => {
        const text = normalize(node.innerText || node.textContent || "");
        return knownFilterLabels.has(text);
      }) ??
      candidates.find((node) => {
        const text = normalize(node.innerText || node.textContent || "");
        return (
          text.includes("全部评论") || text.includes("未回复") || text.includes("已回复")
        );
      });

    if (!(target instanceof HTMLElement)) {
      return false;
    }

    target.setAttribute(marker, "true");
    return true;
  });

  return marked ? page.locator('[data-codex-comment-status-filter="true"]').first() : null;
}

async function waitForCommentStatusFilter(page, options) {
  const startedAt = Date.now();
  let lastLoggedAt = 0;

  while (Date.now() - startedAt < options.uiTimeoutMs) {
    const filterTrigger = await markCommentStatusFilter(page);
    if (filterTrigger) {
      const currentText = normalizeText(await filterTrigger.textContent());
      logReplyFilterDebug("found comment status filter", { text: currentText });
      return filterTrigger;
    }

    if (Date.now() - lastLoggedAt >= 1000) {
      const availableComboboxes = await page.evaluate(() => {
        const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
        return Array.from(document.querySelectorAll("[role=\"combobox\"]"))
          .filter((node) => node instanceof HTMLElement)
          .map((node) => normalize(node.innerText || node.textContent || ""))
          .filter(Boolean)
          .slice(0, 10);
      });
      logReplyFilterDebug("waiting for comment status filter", {
        elapsedMs: Date.now() - startedAt,
        availableComboboxes
      });
      lastLoggedAt = Date.now();
    }

    await page.waitForTimeout(200);
  }

  const availableComboboxes = await page.evaluate(() => {
    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    return Array.from(document.querySelectorAll("[role=\"combobox\"]"))
      .filter((node) => node instanceof HTMLElement)
      .map((node) => normalize(node.innerText || node.textContent || ""))
      .filter(Boolean)
      .slice(0, 10);
  });
  throw new Error(
    `Timed out waiting for the comment status filter after ${options.uiTimeoutMs}ms. Visible comboboxes: ${JSON.stringify(
      availableComboboxes
    )}. Try --ui-timeout-ms 60000.`
  );
}

async function captureCommentListFingerprint(page) {
  return page.evaluate(() => {
    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();

    return Array.from(document.querySelectorAll("[comment-item], div.container-sXKyMs"))
      .filter((node) => node instanceof HTMLElement)
      .slice(0, 5)
      .map((node) => normalize((node.innerText || node.textContent || "").slice(0, 160)))
      .filter(Boolean)
      .join("||");
  });
}

async function applyUnrepliedCommentsFilter(page, options) {
  const filterTrigger = await waitForCommentStatusFilter(page, options);

  try {
    await filterTrigger.scrollIntoViewIfNeeded().catch(() => {});
    const currentText = normalizeText(await filterTrigger.textContent());
    logReplyFilterDebug("current comment filter text", currentText);
    if (currentText.includes("未回复")) {
      logReplyFilterDebug("comment filter already set to unreplied");
      return {
        applied: true,
        reason: "already_selected"
      };
    }

    const previousFingerprint = await captureCommentListFingerprint(page);
    await filterTrigger.click();

    const optionsLocator = page.locator(".douyin-creator-interactive-select-option");
    await optionsLocator.first().waitFor({ state: "visible", timeout: options.uiTimeoutMs });

    const optionCount = await optionsLocator.count();
    const optionTexts = [];
    for (let index = 0; index < optionCount; index += 1) {
      optionTexts.push(normalizeText(await optionsLocator.nth(index).textContent()));
    }
    logReplyFilterDebug("comment filter dropdown options", optionTexts);
    const refreshTimeoutMs = Math.min(options.uiTimeoutMs, 8000);

    for (let index = 0; index < optionCount; index += 1) {
      const option = optionsLocator.nth(index);
      const text = optionTexts[index];
      if (text !== "未回复") {
        continue;
      }

      const responseWait = page
        .waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            response.ok() &&
            response.url().includes("/aweme/v1/web/comment/list/select/"),
          { timeout: refreshTimeoutMs }
        )
        .then(() => true)
        .catch(() => false);

      const domWait = page
        .waitForFunction(
          (fingerprint) => {
            const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
            const filterSelected = Array.from(
              document.querySelectorAll('div[role="combobox"].douyin-creator-interactive-select')
            ).some((node) =>
              normalize(node.innerText || node.textContent || "").includes("未回复")
            );

            if (!filterSelected) {
              return false;
            }

            const currentFingerprint = Array.from(
              document.querySelectorAll("[comment-item], div.container-sXKyMs")
            )
              .filter((node) => node instanceof HTMLElement)
              .slice(0, 5)
              .map((node) => normalize((node.innerText || node.textContent || "").slice(0, 160)))
              .filter(Boolean)
              .join("||");

            return currentFingerprint !== fingerprint || currentFingerprint.length === 0;
          },
          previousFingerprint,
          { timeout: refreshTimeoutMs }
        )
        .then(() => true)
        .catch(() => false);

      await option.click();
      const [responseSeen, domUpdated] = await Promise.all([responseWait, domWait]);
      logReplyFilterDebug("applied unreplied filter", {
        responseSeen,
        domUpdated
      });

      if (!responseSeen && !domUpdated) {
        await page.waitForTimeout(1000);
      } else {
        await page.waitForTimeout(350);
      }

      return {
        applied: true,
        reason: "selected"
      };
    }

    await page.keyboard.press("Escape").catch(() => {});
    throw new Error("评论状态过滤下拉框中未找到“未回复”选项。");
  } catch (error) {
    await page.keyboard.press("Escape").catch(() => {});
    throw new Error(
      `切换“未回复”过滤失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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
    const root =
      document.querySelector('[data-codex-comment-scroll="true"]') || document.body;
    const toggles = Array.from(root.querySelectorAll("button, div, span"))
      .filter((node) => {
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        return text.includes("条回复") && text.length <= 20;
      })
      .slice(0, 20);

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
    await page.waitForTimeout(1500);
  }
}

async function advanceCommentScroll(page, scrollContainer) {
  const containerState = await scrollContainer.evaluate((element) => {
    const before = element.scrollTop;
    const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
    const next = Math.min(before + Math.max(element.clientHeight * 0.9, 900), maxScrollTop);
    element.scrollTop = next;
    return {
      before,
      after: element.scrollTop,
      maxScrollTop,
      strategy: "container"
    };
  });

  if (containerState.after > containerState.before) {
    return containerState;
  }

  await scrollContainer.scrollIntoViewIfNeeded().catch(() => {});
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(150);

  const wheelState = await scrollContainer.evaluate((element, before) => {
    return {
      before,
      after: element.scrollTop,
      maxScrollTop: Math.max(element.scrollHeight - element.clientHeight, 0),
      strategy: "wheel"
    };
  }, containerState.after);

  if (
    wheelState.after > wheelState.before ||
    wheelState.maxScrollTop > containerState.maxScrollTop
  ) {
    return wheelState;
  }

  return page.evaluate(() => {
    const element =
      document.scrollingElement instanceof HTMLElement
        ? document.scrollingElement
        : document.documentElement;
    const before = element.scrollTop;
    const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
    const next = Math.min(before + Math.max(window.innerHeight * 0.9, 900), maxScrollTop);
    element.scrollTop = next;
    return {
      before,
      after: element.scrollTop,
      maxScrollTop,
      strategy: "page"
    };
  });
}

async function extractCommentSnapshot(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector('[data-codex-comment-scroll="true"]') || document.body;

    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    const metaPattern =
      /(分钟前|小时前|天前|昨天|前天|刚刚|IP属地|发布于|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}:\d{2}|赞)/;
    const replyThreadPattern = /(条回复|收起)/;
    const controlPattern = /^(回复|发送|收起)$/;
    const pureNumberPattern = /^\d+$/;
    const avatarSelector = 'img, [class*="avatar"], [class*="Avatar"]';
    const xBandTolerance = 12;
    const replyIndentMinDelta = 16;

    const splitLines = (value = "") =>
      value
        .split(/\n+/)
        .map((line) => normalize(line))
        .filter(Boolean);

    const normalizeNameLine = (value = "") => {
      let username = normalize(value);
      let hasAuthorBadge = false;

      if (username.endsWith(" 作者")) {
        username = normalize(username.slice(0, -3));
        hasAuthorBadge = true;
      } else if (username.endsWith("作者") && username.length > 2) {
        username = normalize(username.slice(0, -2));
        hasAuthorBadge = true;
      }

      return {
        username,
        hasAuthorBadge
      };
    };

    const extractReplyTarget = (value = "") => {
      const match = normalize(value).match(/^回复\s*([^:：]+)\s*[:：]/);
      return normalize(match?.[1] || "");
    };

    const isNoiseLine = (line) => controlPattern.test(line) || pureNumberPattern.test(line);

    const parseStructuredEntry = (rawLines, order) => {
      const lines = rawLines.filter((line) => !isNoiseLine(line));
      if (lines.length < 2) {
        return null;
      }

      let cursor = 0;
      const usernameLine = normalizeNameLine(lines[cursor]);
      let username = usernameLine.username;
      let hasAuthorBadge = usernameLine.hasAuthorBadge;
      cursor += 1;

      while (cursor < lines.length && lines[cursor] === "作者") {
        hasAuthorBadge = true;
        cursor += 1;
      }

      if (!username && cursor < lines.length) {
        const fallbackNameLine = normalizeNameLine(lines[cursor]);
        username = fallbackNameLine.username;
        hasAuthorBadge = hasAuthorBadge || fallbackNameLine.hasAuthorBadge;
        cursor += 1;
      }

      const commentSegments = [];
      while (cursor < lines.length) {
        const line = lines[cursor];
        if (line === "作者") {
          hasAuthorBadge = true;
          cursor += 1;
          continue;
        }

        if (replyThreadPattern.test(line)) {
          break;
        }

        if (!metaPattern.test(line)) {
          commentSegments.push(line);
        }
        cursor += 1;
      }

      const commentText = normalize(commentSegments.join(" "));
      if (!username || !commentText) {
        return null;
      }

      const consumedLineCount = cursor;
      const publishText = normalize(
        lines
          .slice(1, consumedLineCount)
          .filter((line) => line !== "作者" && metaPattern.test(line))
          .join(" ")
      );
      const extraLines = lines
        .slice(consumedLineCount)
        .filter((line) => line !== "作者" && !replyThreadPattern.test(line));

      return {
        username,
        commentText,
        replyTo: extractReplyTarget(commentText) || null,
        publishText,
        hasAuthorBadge,
        extraLines,
        consumedLineCount,
        order,
        signature: [username, commentText, publishText].map(normalize).join("|")
      };
    };

    const parseRepliesFromLines = (rawLines, mainEntry) => {
      if (!mainEntry) {
        return [];
      }

      const remainingLines = rawLines
        .filter((line) => !isNoiseLine(line))
        .slice(mainEntry.consumedLineCount)
        .filter((line) => !replyThreadPattern.test(line));
      const replies = [];
      let cursor = 0;

      while (cursor < remainingLines.length) {
        const replyEntry = parseStructuredEntry(remainingLines.slice(cursor), replies.length);
        if (!replyEntry) {
          cursor += 1;
          continue;
        }

        replies.push({
          username: replyEntry.username,
          commentText: replyEntry.commentText,
          replyTo: replyEntry.replyTo ?? null,
          publishText: replyEntry.publishText,
          hasAuthorBadge: replyEntry.hasAuthorBadge,
          extraLines: replyEntry.extraLines,
          rawText: normalize(
            [
              replyEntry.username,
              replyEntry.commentText,
              replyEntry.publishText,
              ...replyEntry.extraLines
            ]
              .filter(Boolean)
              .join(" ")
          ),
          signature: replyEntry.signature,
          order: replies.length
        });

        cursor += Math.max(replyEntry.consumedLineCount, 1);
      }

      return replies;
    };

    const extractStructuredEntryFromBlock = (block, order) => {
      if (!(block instanceof HTMLElement)) {
        return null;
      }

      const contentNode = Array.from(block.children).find(
        (child) =>
          child instanceof HTMLElement && child.classList.contains("content-FM0UMi")
      );
      if (!(contentNode instanceof HTMLElement)) {
        return null;
      }

      const contentHost =
        Array.from(contentNode.children).find((child) => child instanceof HTMLElement) ||
        contentNode;
      if (!(contentHost instanceof HTMLElement)) {
        return null;
      }

      const directChildren = Array.from(contentHost.children).filter(
        (child) => child instanceof HTMLElement
      );
      const usernameNode = directChildren.find((child) =>
        child.classList.contains("username-aLgaNB")
      );
      const timeNode = directChildren.find((child) =>
        child.classList.contains("time-NRtTXO")
      );
      const commentNode = directChildren.find((child) =>
        child.classList.contains("comment-content-text-JvmAKq")
      );

      const usernameText = normalize(usernameNode?.innerText || "");
      const commentText = normalize(commentNode?.innerText || "") || (
        commentNode?.querySelector("img") ? "[image]" : ""
      );
      if (!usernameText || !commentText) {
        return null;
      }

      const usernameLine = normalizeNameLine(usernameText);
      const publishText = normalize(timeNode?.innerText || "");
      const replyTo =
        normalize(commentNode?.querySelector(".reply-to-lFblpf .name-IHGGka")?.textContent || "") ||
        normalize(commentNode?.querySelector(".reply-to-lFblpf")?.textContent || "")
          .replace(/^回复/, "")
          .replace(/[:：]\s*$/, "")
          .trim() ||
        extractReplyTarget(commentText) ||
        null;
      const replyThreadTexts = Array.from(block.querySelectorAll(".load-more-pDyh1o"))
        .map((node) => normalize(node.textContent || ""))
        .filter(Boolean);
      const replyCount = Math.max(
        0,
        ...replyThreadTexts.map((text) =>
          Number.parseInt(text.match(/\d+/)?.[0] ?? "0", 10) || 0
        )
      );

      return {
        entry: {
          username: usernameLine.username,
          commentText,
          replyTo,
          publishText,
          hasAuthorBadge:
            usernameLine.hasAuthorBadge ||
            Boolean(usernameNode?.querySelector(".tag-DAEcKE")),
          extraLines: [],
          consumedLineCount: 0,
          order,
          signature: [usernameLine.username, commentText, publishText]
            .map(normalize)
            .join("|")
        },
        replyCount,
        rawText: normalize([usernameText, publishText, commentText].filter(Boolean).join(" ")),
        inlineReplies: []
      };
    };

    const dedupeReplies = (replies = []) => {
      const repliesBySignature = new Map();

      for (const reply of replies) {
        if (!reply?.signature) {
          continue;
        }

        const existingReply = repliesBySignature.get(reply.signature);
        if (!existingReply) {
          repliesBySignature.set(reply.signature, reply);
          continue;
        }

        repliesBySignature.set(reply.signature, {
          ...existingReply,
          ...reply,
          publishText:
            reply.publishText && reply.publishText.length >= (existingReply.publishText || "").length
              ? reply.publishText
              : existingReply.publishText,
          extraLines:
            Array.isArray(reply.extraLines) &&
            reply.extraLines.length >= (existingReply.extraLines?.length || 0)
              ? reply.extraLines
              : existingReply.extraLines,
          rawText:
            (reply.rawText || "").length >= (existingReply.rawText || "").length
              ? reply.rawText
              : existingReply.rawText,
          hasAuthorBadge: Boolean(existingReply.hasAuthorBadge || reply.hasAuthorBadge),
          order:
            typeof existingReply.order === "number" && typeof reply.order === "number"
              ? Math.min(existingReply.order, reply.order)
              : typeof existingReply.order === "number"
                ? existingReply.order
                : reply.order
        });
      }

      return [...repliesBySignature.values()].sort(
        (left, right) => (left.order ?? 0) - (right.order ?? 0)
      );
    };

    const parseRepliesFromNodes = (block, mainEntry) => {
      if (!(block instanceof HTMLElement) || !mainEntry) {
        return [];
      }

      const candidateNodes = Array.from(block.querySelectorAll("div, li, article, section")).filter(
        (node) => {
          if (!(node instanceof HTMLElement) || node === block) {
            return false;
          }

          const text = normalize(node.innerText || "");
          if (!text || text.length > 900) {
            return false;
          }

          const avatarCount = node.querySelectorAll(avatarSelector).length;
          if (avatarCount !== 1) {
            return false;
          }

          const meaningfulLines = splitLines(text).filter((line) => !isNoiseLine(line));
          if (meaningfulLines.length < 2) {
            return false;
          }

          const replyButtonCount = Array.from(node.querySelectorAll("button, div, span")).filter(
            (child) => normalize(child.textContent || "") === "回复"
          ).length;

          return replyButtonCount >= 1 && replyButtonCount <= 2;
        }
      );

      const leafNodes = candidateNodes.filter(
        (node) => !candidateNodes.some((other) => other !== node && node.contains(other))
      );
      const replies = [];
      const seen = new Set();
      const mainSignature = mainEntry.signature;

      for (const [index, node] of leafNodes.entries()) {
        const replyEntry = parseStructuredEntry(splitLines(node.innerText || ""), index);
        if (!replyEntry || !replyEntry.signature || replyEntry.signature === mainSignature) {
          continue;
        }

        if (seen.has(replyEntry.signature)) {
          continue;
        }

        seen.add(replyEntry.signature);
        replies.push({
          username: replyEntry.username,
          commentText: replyEntry.commentText,
          replyTo: replyEntry.replyTo ?? null,
          publishText: replyEntry.publishText,
          hasAuthorBadge: replyEntry.hasAuthorBadge,
          extraLines: replyEntry.extraLines,
          rawText: normalize(node.innerText || ""),
          signature: replyEntry.signature,
          order: index
        });
      }

      return replies;
    };

    for (const marked of root.querySelectorAll("[data-codex-comment-block]")) {
      marked.removeAttribute("data-codex-comment-block");
    }

    const collectBlocks = () => {
      const classBlocks = Array.from(root.querySelectorAll("div.container-sXKyMs")).filter(
        (node) => {
          if (!(node instanceof HTMLElement)) {
            return false;
          }

          const text = normalize(node.innerText || "");
          if (!text || !text.includes("回复")) {
            return false;
          }

          const rect = node.getBoundingClientRect();
          return rect.width >= 300 && rect.height >= 60;
        }
      );
      if (classBlocks.length > 0) {
        return classBlocks;
      }

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
          const avatarCount = current.querySelectorAll(
            'img, [class*="avatar"], [class*="Avatar"]'
          ).length;

          if (
            avatarCount >= 1 &&
            avatarCount <= 12 &&
            replyButtonCount >= 1 &&
            replyButtonCount <= 20 &&
            text.length <= 4000
          ) {
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

    const rawBlocks = collectBlocks()
      .map((block, domIndex) => {
        if (block instanceof HTMLElement) {
          block.setAttribute("data-codex-comment-block", String(domIndex));
        }

        const rawLines = splitLines(block.innerText || "");

        if (rawLines.length === 0) {
          return null;
        }

        const rect = block instanceof HTMLElement ? block.getBoundingClientRect() : null;
        const structuredBlock = extractStructuredEntryFromBlock(block, domIndex);
        if (structuredBlock) {
          return {
            domIndex,
            left: Number.isFinite(rect?.left) ? rect.left : 0,
            top: Number.isFinite(rect?.top) ? rect.top : domIndex,
            replyCount: structuredBlock.replyCount,
            rawText: structuredBlock.rawText,
            inlineReplies: structuredBlock.inlineReplies,
            entry: structuredBlock.entry
          };
        }

        const mainEntry = parseStructuredEntry(rawLines, domIndex);
        if (!mainEntry) {
          return null;
        }

        const replyThreadLine = rawLines.find((line) => line.includes("条回复")) || "";
        const replyCount = Number.parseInt(replyThreadLine.match(/\d+/)?.[0] ?? "0", 10);
        const repliesFromNodes = parseRepliesFromNodes(block, mainEntry);
        const repliesFromLines =
          repliesFromNodes.length > 0 ? [] : parseRepliesFromLines(rawLines, mainEntry);
        const inlineReplies = dedupeReplies([...repliesFromNodes, ...repliesFromLines]);

        return {
          domIndex,
          left: Number.isFinite(rect?.left) ? rect.left : 0,
          top: Number.isFinite(rect?.top) ? rect.top : domIndex,
          replyCount: Number.isNaN(replyCount) ? 0 : replyCount,
          rawText: normalize(block.innerText || ""),
          inlineReplies,
          entry: mainEntry
        };
      })
      .filter(Boolean);

    const resolveReplyIndentThreshold = (blocks) => {
      const leftPositions = blocks
        .map((block) => block.left)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);

      if (leftPositions.length === 0) {
        return Number.POSITIVE_INFINITY;
      }

      const bands = [];
      for (const left of leftPositions) {
        const lastBand = bands[bands.length - 1];
        if (!lastBand || Math.abs(left - lastBand.max) > xBandTolerance) {
          bands.push({
            min: left,
            max: left,
            values: [left]
          });
          continue;
        }

        lastBand.max = left;
        lastBand.values.push(left);
      }

      if (bands.length < 2) {
        return Number.POSITIVE_INFINITY;
      }

      const mainBand = bands[0];
      const mainAnchor =
        mainBand.values.reduce((sum, value) => sum + value, 0) / mainBand.values.length;
      const replyBand = bands.find(
        (band, index) => index > 0 && band.min - mainAnchor >= replyIndentMinDelta
      );

      if (!replyBand) {
        return Number.POSITIVE_INFINITY;
      }

      return (mainAnchor + replyBand.min) / 2;
    };

    const replyIndentThreshold = resolveReplyIndentThreshold(rawBlocks);
    const orderedBlocks = rawBlocks
      .slice()
      .sort((left, right) =>
        left.top === right.top ? left.left - right.left : left.top - right.top
      );

    const comments = [];
    let currentMainComment = null;

    const flushCurrentMainComment = () => {
      if (!currentMainComment) {
        return;
      }

      const replies = dedupeReplies([
        ...currentMainComment.inlineReplies,
        ...currentMainComment.replies
      ]);

      comments.push({
        domIndex: currentMainComment.domIndex,
        username: currentMainComment.username,
        commentText: currentMainComment.commentText,
        replyTo: currentMainComment.replyTo ?? null,
        publishText: currentMainComment.publishText,
        replyCount: Math.max(currentMainComment.replyCount, replies.length),
        hasAuthorReply: replies.some((reply) => reply.hasAuthorBadge),
        extraLines: replies.length > 0 ? [] : currentMainComment.extraLines,
        rawText: currentMainComment.rawText,
        replies,
        signature: currentMainComment.signature,
        order: currentMainComment.order
      });

      currentMainComment = null;
    };

    for (const block of orderedBlocks) {
      const entry = block.entry;
      if (!entry?.signature) {
        continue;
      }

      const isReplyBlock =
        Number.isFinite(replyIndentThreshold) && block.left >= replyIndentThreshold;

      if (!isReplyBlock || !currentMainComment) {
        flushCurrentMainComment();
        currentMainComment = {
          domIndex: block.domIndex,
          username: entry.username,
          commentText: entry.commentText,
          replyTo: entry.replyTo ?? null,
          publishText: entry.publishText,
          replyCount: block.replyCount,
          extraLines: entry.extraLines,
          rawText: block.rawText,
          inlineReplies: block.inlineReplies,
          replies: [],
          signature: entry.signature,
          order: block.domIndex
        };
        continue;
      }

      currentMainComment.replies.push({
        username: entry.username,
        commentText: entry.commentText,
        replyTo: entry.replyTo ?? null,
        publishText: entry.publishText,
        hasAuthorBadge: entry.hasAuthorBadge,
        extraLines: entry.extraLines,
        rawText: block.rawText,
        signature: `${entry.signature}|slot:${currentMainComment.inlineReplies.length + currentMainComment.replies.length}`,
        order: currentMainComment.inlineReplies.length + currentMainComment.replies.length
      });

      if (Array.isArray(block.inlineReplies) && block.inlineReplies.length > 0) {
        const baseOrder =
          currentMainComment.inlineReplies.length + currentMainComment.replies.length;
        currentMainComment.replies.push(
          ...block.inlineReplies.map((reply, index) => ({
            ...reply,
            order:
              typeof reply.order === "number" ? baseOrder + reply.order : baseOrder + index
          }))
        );
      }
    }

    flushCurrentMainComment();
    return comments;
  });
}

function addCommentsFromSnapshot(commentsBySignature, snapshot) {
  let additions = 0;

  for (const comment of snapshot) {
    if (!comment.signature) {
      continue;
    }

    const existingComment = commentsBySignature.get(comment.signature);
    if (!existingComment) {
      commentsBySignature.set(comment.signature, comment);
      additions += 1;
      continue;
    }

    const mergedReplies = mergeReplyArrays(existingComment.replies, comment.replies);
    commentsBySignature.set(comment.signature, {
      ...existingComment,
      ...comment,
      publishText:
        comment.publishText && comment.publishText.length >= (existingComment.publishText ?? "").length
          ? comment.publishText
          : existingComment.publishText,
      extraLines:
        Array.isArray(comment.extraLines) &&
        comment.extraLines.length >= (existingComment.extraLines?.length ?? 0)
          ? comment.extraLines
          : existingComment.extraLines,
      rawText:
        (comment.rawText ?? "").length >= (existingComment.rawText ?? "").length
          ? comment.rawText
          : existingComment.rawText,
      replyCount: Math.max(existingComment.replyCount ?? 0, comment.replyCount ?? 0),
      hasAuthorReply: Boolean(existingComment.hasAuthorReply || comment.hasAuthorReply),
      replies: mergedReplies.replies,
      order:
        typeof existingComment.order === "number" && typeof comment.order === "number"
          ? Math.min(existingComment.order, comment.order)
          : typeof existingComment.order === "number"
            ? existingComment.order
            : comment.order
    });
    additions += mergedReplies.additions;
  }

  return additions;
}

function matchReplyPlan(comment, replyPlans, processedPlanIds) {
  if (!Array.isArray(replyPlans) || replyPlans.length === 0) {
    return null;
  }

  const commentUsername = normalizeText(comment.username).toLowerCase();
  const commentText = normalizeText(comment.commentText).toLowerCase();
  const commentPublishText = normalizeText(comment.publishText).toLowerCase();

  for (const plan of replyPlans) {
    if (processedPlanIds.has(plan.id)) {
      continue;
    }

    if (normalizeText(plan.commentText).toLowerCase() !== commentText) {
      continue;
    }

    if (plan.username && normalizeText(plan.username).toLowerCase() !== commentUsername) {
      continue;
    }

    if (plan.publishText && normalizeText(plan.publishText).toLowerCase() !== commentPublishText) {
      continue;
    }

    return plan;
  }

  return null;
}

function getNextReplyTarget(snapshot, options, processedSignatures, processedPlanIds) {
  if (options.replyPlanMode) {
    if (!Array.isArray(options.replyPlans) || options.replyPlans.length === 0) {
      return null;
    }

    for (const comment of snapshot) {
      if (!comment.signature || processedSignatures.has(comment.signature)) {
        continue;
      }

      const plan = matchReplyPlan(comment, options.replyPlans, processedPlanIds);
      if (!plan) {
        continue;
      }

      return {
        comment,
        plan,
        replyMessage: plan.replyMessage
      };
    }

    return null;
  }

  if (!Array.isArray(options.replyPlans) || options.replyPlans.length === 0) {
    const comment = snapshot.find(
      (candidate) => candidate.signature && !processedSignatures.has(candidate.signature)
    );
    if (!comment) {
      return null;
    }

    return {
      comment,
      plan: null,
      replyMessage: options.replyMessage
    };
  }

  return null;
}

async function inspectCommentActions(commentLocator, intendedReplyMessage = "") {
  return commentLocator.evaluate((root, replyMessage) => {
    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    const normalizedReplyMessage = normalize(replyMessage);

    for (const marked of root.querySelectorAll("[data-codex-toggle-action]")) {
      marked.removeAttribute("data-codex-toggle-action");
    }

    for (const marked of root.querySelectorAll("[data-codex-reply-action]")) {
      marked.removeAttribute("data-codex-reply-action");
    }

    const candidates = Array.from(root.querySelectorAll("button, div, span"));
    const toggleCandidate = candidates.find((node) => {
      const text = normalize(node.textContent || "");
      return (text.includes("条回复") || text === "收起") && text.length <= 20;
    });
    const replyCandidate = candidates.find((node) => normalize(node.textContent || "") === "回复");
    const hasAuthorReply = candidates.some((node) => normalize(node.textContent || "") === "作者");
    const hasDuplicateReplyMessage =
      Boolean(normalizedReplyMessage) &&
      hasAuthorReply &&
      normalize(root.innerText || "").includes(normalizedReplyMessage);

    if (toggleCandidate instanceof HTMLElement) {
      toggleCandidate.setAttribute("data-codex-toggle-action", "true");
    }

    if (replyCandidate instanceof HTMLElement) {
      replyCandidate.setAttribute("data-codex-reply-action", "true");
    }

    return {
      hasToggle: toggleCandidate instanceof HTMLElement,
      toggleText: normalize(toggleCandidate?.textContent || ""),
      hasReplyButton: replyCandidate instanceof HTMLElement,
      hasAuthorReply,
      hasDuplicateReplyMessage
    };
  }, intendedReplyMessage);
}

async function waitForReplySendReady(page, commentLocator, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ready = await commentLocator.evaluate((root) => {
      const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
      const sendCandidate = Array.from(root.querySelectorAll("button, div, span")).find(
        (node) => normalize(node.textContent || "") === "发送"
      );

      if (!(sendCandidate instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(sendCandidate);
      const isButton = sendCandidate instanceof HTMLButtonElement;
      const disabled =
        (isButton && sendCandidate.disabled) ||
        sendCandidate.getAttribute("disabled") !== null ||
        sendCandidate.getAttribute("aria-disabled") === "true";

      return !disabled && style.pointerEvents !== "none" && style.visibility !== "hidden";
    });

    if (ready) {
      return;
    }

    await page.waitForTimeout(120);
  }

  throw new Error(`Timed out waiting for the send button after ${timeoutMs}ms.`);
}

async function safeReplyToComment(page, commentLocator, comment, options) {
  const result = {
    username: comment.username,
    commentText: comment.commentText,
    publishText: comment.publishText,
    status: "pending"
  };

  try {
    const normalizedReplyMessage = normalizeText(options.replyMessage ?? "");
    const hasDuplicateReplyMessage =
      Boolean(normalizedReplyMessage) &&
      Array.isArray(comment.replies) &&
      comment.replies.some((reply) => {
        if (!reply?.hasAuthorBadge) {
          return false;
        }

        return normalizeText(
          reply.rawText ??
            [reply.commentText, reply.publishText, ...(reply.extraLines ?? [])]
              .filter(Boolean)
              .join(" ")
        ).includes(normalizedReplyMessage);
      });

    if (hasDuplicateReplyMessage) {
      return {
        ...result,
        status: "skipped_duplicate_reply_message"
      };
    }

    if (comment.hasAuthorReply) {
      return {
        ...result,
        status: "skipped_already_replied"
      };
    }

    let actionState = await inspectCommentActions(commentLocator, options.replyMessage);

    if (actionState.hasToggle && actionState.toggleText.includes("条回复")) {
      const toggleButton = commentLocator.locator('[data-codex-toggle-action="true"]').first();
      await toggleButton.click();
      await page.waitForTimeout(Math.min(1000, options.replySettleMs));
      actionState = await inspectCommentActions(commentLocator, options.replyMessage);
    }

    if (actionState.hasDuplicateReplyMessage) {
      return {
        ...result,
        status: "skipped_duplicate_reply_message"
      };
    }

    if (actionState.hasAuthorReply) {
      return {
        ...result,
        status: "skipped_already_replied"
      };
    }

    if (!actionState.hasReplyButton) {
      return {
        ...result,
        status: "skipped_no_reply_button"
      };
    }

    const replyButton = commentLocator.locator('[data-codex-reply-action="true"]').first();
    await replyButton.click();

    const inputBox = commentLocator.locator('div[contenteditable="true"]').last();
    await inputBox.waitFor({ state: "visible", timeout: options.replyTimeoutMs });
    await inputBox.click();
    await inputBox.type(options.replyMessage, {
      delay: options.replyTypeDelayMs
    });

    await waitForReplySendReady(page, commentLocator, options.replyTimeoutMs);

    const sendButton = commentLocator.getByText("发送", { exact: true }).first();
    await sendButton.click();
    await page.waitForTimeout(options.replySettleMs);

    return {
      ...result,
      status: "replied"
    };
  } catch (error) {
    return {
      ...result,
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function replyToComments(page, options) {
  await applyUnrepliedCommentsFilter(page, options);

  const scrollContainer = await markCommentScrollContainer(page);
  const startedAt = Date.now();
  const processedSignatures = new Set();
  const processedPlanIds = new Set();
  const results = [];
  let repliedCount = 0;
  let lastProgressAt = startedAt;

  while (Date.now() - startedAt < options.timeoutMs) {
    if (Array.isArray(options.replyPlans) && processedPlanIds.size >= options.replyPlans.length) {
      break;
    }

    const snapshot = await extractCommentSnapshot(page);
    const nextTarget = getNextReplyTarget(
      snapshot,
      options,
      processedSignatures,
      processedPlanIds
    );

    if (nextTarget) {
      const { comment: nextComment, plan, replyMessage } = nextTarget;
      if (options.replyDryRun) {
        processedSignatures.add(nextComment.signature);
        if (plan) {
          processedPlanIds.add(plan.id);
        }
        results.push({
          username: nextComment.username,
          commentText: nextComment.commentText,
          publishText: nextComment.publishText,
          status: "dry_run_target_found",
          replyPlanId: plan?.id ?? null,
          requestedReplyMessage: replyMessage
        });
        lastProgressAt = Date.now();
        break;
      }

      const duplicateHistoryEntry = findReplyHistoryEntry(
        options.replyHistory,
        options.selectedWork,
        nextComment,
        replyMessage
      );

      if (duplicateHistoryEntry) {
        processedSignatures.add(nextComment.signature);
        if (plan) {
          processedPlanIds.add(plan.id);
        }
        results.push({
          username: nextComment.username,
          commentText: nextComment.commentText,
          publishText: nextComment.publishText,
          status: "skipped_duplicate_history",
          replyPlanId: plan?.id ?? null,
          requestedReplyMessage: replyMessage,
          historyRepliedAt: duplicateHistoryEntry.repliedAt
        });
        lastProgressAt = Date.now();
        continue;
      }

      const commentLocator = page
        .locator(`[data-codex-comment-block="${nextComment.domIndex}"]`)
        .first();
      const replyResult = await safeReplyToComment(page, commentLocator, nextComment, {
        ...options,
        replyMessage
      });

      processedSignatures.add(nextComment.signature);
      if (plan) {
        processedPlanIds.add(plan.id);
      }
      results.push({
        ...replyResult,
        replyPlanId: plan?.id ?? null,
        requestedReplyMessage: replyMessage
      });
      lastProgressAt = Date.now();

      if (replyResult.status === "replied") {
        repliedCount += 1;
        await recordReplyHistory(
          options.replyHistory,
          options.selectedWork,
          nextComment,
          replyMessage
        );
      }

      if (replyResult.status === "skipped_duplicate_reply_message") {
        await recordReplyHistory(
          options.replyHistory,
          options.selectedWork,
          nextComment,
          replyMessage
        );
      }

      if (repliedCount >= options.replyLimit) {
        break;
      }

      continue;
    }

    const scrollState = await advanceCommentScroll(page, scrollContainer);

    await page.waitForTimeout(1200);

    const nextSnapshot = await extractCommentSnapshot(page);
    const hasUnprocessed = Boolean(
      getNextReplyTarget(nextSnapshot, options, processedSignatures, processedPlanIds)
    );
    const reachedBottom =
      scrollState.after === scrollState.before || scrollState.after >= scrollState.maxScrollTop;

    if (reachedBottom && !hasUnprocessed) {
      break;
    }

    if (hasUnprocessed) {
      lastProgressAt = Date.now();
      continue;
    }

    if (Date.now() - lastProgressAt >= options.idleMs) {
      break;
    }
  }

  const skippedCount = results.filter((item) => item.status.startsWith("skipped_")).length;
  const errorCount = results.filter((item) => item.status === "error").length;
  const unmatchedPlans = Array.isArray(options.replyPlans)
    ? options.replyPlans
        .filter((plan) => !processedPlanIds.has(plan.id))
        .map((plan) => ({
          id: plan.id,
          username: plan.username,
          commentText: plan.commentText,
          publishText: plan.publishText,
          replyMessage: plan.replyMessage
        }))
    : [];

  return {
    repliedCount,
    skippedCount,
    errorCount,
    totalProcessed: results.length,
    matchedPlanCount: processedPlanIds.size,
    unmatchedPlanCount: unmatchedPlans.length,
    unmatchedPlans,
    results
  };
}

async function collectComments(page, options) {
  if (options.unrepliedOnly) {
    logReplyFilterDebug("entering unreplied collection flow");
    await applyUnrepliedCommentsFilter(page, options);
  }

  await waitForCommentsArea(page, options);

  const scrollContainer = await markCommentScrollContainer(page);
  const commentsBySignature = new Map();
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let stalledScrollAttempts = 0;

  while (Date.now() - startedAt < options.timeoutMs) {
    if (options.expandReplies) {
      await expandReplyThreads(page);
    }

    const snapshot = await extractCommentSnapshot(page);
    const additions = addCommentsFromSnapshot(commentsBySignature, snapshot);
    if (additions > 0) {
      lastProgressAt = Date.now();
    }

    if (commentsBySignature.size >= options.limit) {
      break;
    }

    const scrollState = await advanceCommentScroll(page, scrollContainer);

    await page.waitForTimeout(1200);

    if (options.expandReplies) {
      await expandReplyThreads(page);
    }

    const postScrollSnapshot = await extractCommentSnapshot(page);
    const postScrollAdditions = addCommentsFromSnapshot(commentsBySignature, postScrollSnapshot);
    if (postScrollAdditions > 0) {
      lastProgressAt = Date.now();
    }

    const scrollMoved = scrollState.after > scrollState.before;
    if (additions > 0 || postScrollAdditions > 0 || scrollMoved) {
      stalledScrollAttempts = 0;
    } else {
      stalledScrollAttempts += 1;
    }

    if (commentsBySignature.size >= options.limit) {
      break;
    }

    if (stalledScrollAttempts >= 4) {
      break;
    }

    const idleElapsedMs = Date.now() - lastProgressAt;
    if (idleElapsedMs >= options.idleMs && stalledScrollAttempts >= 2) {
      break;
    }
  }

  return [...commentsBySignature.values()]
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .slice(0, options.limit)
    .map(sanitizeCollectedComment);
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

  const replyPlans = args.replyPlanFile
    ? await loadReplyPlan(args.replyPlanFile, args.replyMessage)
    : [];
  const isReplyMode = Boolean(args.replyMessage || args.replyPlanFile || args.replyDryRun);
  const replyHistory = isReplyMode ? await loadReplyHistory() : null;

  logReplyFilterDebug("startup", {
    listWorks: args.listWorks,
    workId: args.workId || null,
    workTitle: args.workTitle || null,
    unrepliedOnly: args.unrepliedOnly,
    isReplyMode,
    replyPlanMode: Boolean(args.replyPlanFile),
    replyDryRun: args.replyDryRun,
    headless: args.headless
  });

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

    let works = [];
    let targetWork = null;

    if (args.listWorks) {
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

    if (args.workId || args.workTitle) {
      targetWork = await findTargetWorkWithRetry(page, workCollector, {
        workId: args.workId,
        workTitle: args.workTitle,
        timeoutMs: args.worksTimeoutMs,
        idleMs: args.worksIdleMs,
        uiTimeoutMs: args.uiTimeoutMs
      });
      logReplyFilterDebug("resolved target work", getSelectedWorkOutput(targetWork));
    }

    if (targetWork) {
      logReplyFilterDebug("selecting target work", getSelectedWorkOutput(targetWork));
      await selectWorkFromSideSheet(page, targetWork, {
        timeoutMs: args.worksTimeoutMs,
        uiTimeoutMs: args.uiTimeoutMs
      });
      logReplyFilterDebug("selected target work", getSelectedWorkOutput(targetWork));
    }

    if (isReplyMode) {
      logReplyFilterDebug("entering reply flow", {
        selectedWork: getSelectedWorkOutput(targetWork),
        replyPlanCount: replyPlans.length,
        replyLimit: args.replyLimit
      });
      const replySummary = await replyToComments(page, {
        replyMessage: args.replyMessage,
        replyPlans,
        replyPlanMode: Boolean(args.replyPlanFile),
        replyDryRun: args.replyDryRun,
        replyHistory,
        selectedWork: targetWork,
        replyLimit: args.replyLimit,
        replyTimeoutMs: args.replyTimeoutMs,
        replySettleMs: args.replySettleMs,
        replyTypeDelayMs: args.replyTypeDelayMs,
        timeoutMs: args.commentsTimeoutMs,
        idleMs: args.commentsIdleMs,
        uiTimeoutMs: args.uiTimeoutMs
      });

      await emitResult(
        {
          fetchedAt: new Date().toISOString(),
          mode: "reply",
          pageUrl: args.pageUrl,
          selectedWork: getSelectedWorkOutput(targetWork),
          replyMessage: args.replyMessage,
          replyPlanFile: args.replyPlanFile || null,
          replyDryRun: args.replyDryRun,
          replyHistoryFile: replyHistory?.filePath ?? null,
          replyLimit: args.replyLimit,
          ...replySummary
        },
        args.output
      );
      return;
    }

    const comments = await collectComments(page, {
      limit: args.limit,
      unrepliedOnly: args.unrepliedOnly,
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
        commentFilter: args.unrepliedOnly ? "unreplied" : "all",
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
