---
name: douyin-comments
description: List Douyin creator works, export unreplied comments, and reply from an edited unreplied-comments JSON in this workspace.
metadata: { "openclaw": { "emoji": "💬", "requires": { "bins": ["node", "npm"] } } }
user-invocable: true
---

# Douyin Comments

Use this skill when the user wants to operate the Douyin creator comment tool from the skill directory itself.

This skill is designed for the whole project to live at `~/.openclaw/skills/douyin-comments`, either by copying the repo there or symlinking the repo there.

Run all commands from the skill directory:

```bash
cd {baseDir}
```

This repo only exposes 3 supported actions.

## 1. List works

Use this to inspect available works before collecting or replying:

```bash
npm run comments -- \
  --list-works \
  --output comments-output/list-works.json
```

The output shape is:

```json
{
  "count": 2,
  "works": [
    { "title": "作品标题" }
  ]
}
```

## 2. Export unreplied comments

Require either `--work-title` or `--work-id`.

Example:

```bash
npm run comments -- \
  --unreplied-only \
  --work-title "作品标题" \
  --timeout-ms 120000 \
  --limit 500 \
  --output comments-output/unreplied-comments.json
```

The output shape is:

```json
{
  "selectedWork": { "title": "作品标题" },
  "count": 2,
  "comments": [
    {
      "username": "用户A",
      "commentText": "评论内容",
      "replyMessage": ""
    }
  ]
}
```

## 3. Reply from file

Use `comments-output/unreplied-comments.json` as the plan of record. Fill `comments[].replyMessage` for comments that should be replied to and leave it empty for comments that should be skipped.

Then run:

```bash
npm run comments -- \
  --reply-comments-file comments-output/unreplied-comments.json \
  --timeout-ms 120000 \
  --reply-limit 20 \
  --output comments-output/reply-comments-result.json
```

## Workflow rules

- If the user asks to review comments, first export unreplied comments and inspect `comments-output/unreplied-comments.json`.
- If the user asks to reply automatically, write reply text into `replyMessage` fields, save the file, then run the reply command.
- If `replyMessage` is empty, that item is ignored. If every `replyMessage` is empty, the reply command fails.
- Reply matching is currently by `username` only. If the same username appears multiple times, replies are consumed in page order.
- Repeat runs are not fully blind retries: successful replies are recorded in `.playwright/reply-history.json`, and duplicate work/comment/reply combinations are skipped.

## Login and runtime notes

- For first-time authentication, do not use headless mode. Run a command, finish login manually in the opened browser, enter the Douyin creator comment page, then continue.
- The tool forces the native "未回复" filter before exporting unreplied comments or sending replies.
- Do not invent or send replies unless the user explicitly asked to reply.
- If `{baseDir}` does not contain `package.json` and `src/fetch-douyin-comments.mjs`, stop and report that the skill directory is incomplete.
