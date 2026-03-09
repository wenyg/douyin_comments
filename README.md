# 抖音作品评论工具

基于 Playwright 操作抖音创作者中心评论页，当前只保留 3 个接口：

- 获取作品列表
- 获取某个作品的未回复评论
- 按文件批量回复评论

## 安装

```bash
npm install
npx playwright install chromium
```

## 接口 1：获取作品列表

```bash
npm run comments -- \
  --list-works \
  --output comments-output/list-works.json
```

输出格式：

```json
{
  "count": 2,
  "works": [
    {
      "title": "作品标题"
    }
  ]
}
```

## 接口 2：获取未回复评论

按标题：

```bash
npm run comments -- \
  --unreplied-only \
  --work-title "作品标题" \
  --timeout-ms 120000 \
  --limit 500 \
  --output comments-output/unreplied-comments.json
```

按 `item_id`：

```bash
npm run comments -- \
  --unreplied-only \
  --work-id 1234567890123456789 \
  --timeout-ms 120000 \
  --limit 500 \
  --output comments-output/unreplied-comments.json
```

输出格式：

```json
{
  "selectedWork": {
    "title": "作品标题"
  },
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

## 接口 3：回复评论

先在 `comments-output/unreplied-comments.json` 里填写 `comments[].replyMessage`，再执行：

```bash
npm run comments -- \
  --reply-comments-file comments-output/unreplied-comments.json \
  --timeout-ms 120000 \
  --reply-limit 20 \
  --output comments-output/reply-comments-result.json
```

`--reply-comments-file` 会自动读取文件里的 `selectedWork.title` 来定位作品。当前匹配规则只按 `username` 匹配页面里的未回复评论；同一用户名有多条未回复评论时，会按页面当前顺序依次消耗。

## 常用参数

- `--timeout-ms <ms>`：整次运行的最大总时长
- `--limit <n>`：未回复评论最多导出多少条，默认 `200`
- `--reply-limit <n>`：单次最多回复多少条，默认 `20`
- `--output <path>`：结果输出文件
- `--headless`：无头模式运行
- `--user-data-dir <path>`：自定义 Playwright 用户目录

## 说明

- 登录态依赖抖音创作者中心页面，脚本不会绕过登录或验证码。
- 作品列表优先通过拦截 `/aweme/v1/creator/item/list/` 响应获取；接口未命中时，再用侧边栏 DOM 兜底。
- 获取未回复评论和回复评论都会强制切到页面原生“未回复”过滤；如果过滤控件不可用、找不到“未回复”选项或切换失败，脚本会直接报错退出。
- 回复成功记录会写入 `.playwright/reply-history.json`，重复执行时会优先跳过已发过的“作品 + 评论 + 回复文案”组合。
