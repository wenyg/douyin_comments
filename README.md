# 抖音作品评论抓取工具

基于 `douyin_comment_automation_guide.md` 中总结的 DOM 规则与作品列表接口拦截方式，实现了一个最小可运行的 Playwright CLI。

## 功能

- 列出创作者中心当前账号下的全部作品
- 按 `item_id` 或标题选择作品
- 抓取作品评论并导出为 JSON
- 默认复用本地浏览器用户目录，便于手动登录一次后持续使用

## 安装

```bash
npm install
npx playwright install chromium
```

## 用法

首次运行建议使用有头模式完成登录：

```bash
npm run comments -- --list-works
```

按作品标题抓取评论：

```bash
npm run comments -- \
  --work-title "作品标题" \
  --output comments-output/work-comments.json
```

按 `item_id` 抓取评论：

```bash
npm run comments -- \
  --work-id 1234567890123456789 \
  --output comments-output/work-comments.json
```

常用参数：

- `--list-works`：只拉取并输出作品列表
- `--work-id <id>`：按作品 `item_id` 选择
- `--work-title <title>`：按标题选择，优先精确匹配
- `--limit <n>`：最多输出多少条评论，默认 `200`
- `--navigation-timeout-ms <ms>`：页面导航超时，默认 `60000`
- `--ui-timeout-ms <ms>`：关键页面元素等待超时，默认 `30000`
- `--works-timeout-ms <ms>`：作品列表最大等待时间，默认 `45000`
- `--works-idle-ms <ms>`：作品列表静默多久后停止，默认 `5000`
- `--comments-timeout-ms <ms>`：评论抓取总超时，默认 `90000`
- `--comments-idle-ms <ms>`：评论区静默多久后停止，默认 `5000`
- `--output <path>`：写入 JSON 文件；不传则打印到 stdout
- `--headless`：无头模式运行
- `--user-data-dir <path>`：自定义 Playwright 用户目录
- `--expand-replies`：尝试展开“条回复”后再抓取，属于 best effort

## 说明

- 登录态依赖抖音创作者中心页面，脚本不会绕过登录或验证码。
- 作品 `item_id` 通过拦截 `/aweme/v1/creator/item/list/` 响应获取；这是文档里明确提到的关键点。
- 如果网络慢，`--list-works` 会先等待接口响应；接口仍未命中时，再用侧边栏 DOM 做标题级兜底，不再直接空退出。
- 其他依赖网络或页面渲染的步骤也已经开放超时参数，包括页面打开、作品侧边栏出现、评论区出现和评论抓取总时长。
- 评论抓取仍然基于页面 DOM，页面结构变动后可能需要微调选择器或提取规则。
