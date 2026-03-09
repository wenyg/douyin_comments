# 抖音作品评论抓取工具

基于 `douyin_comment_automation_guide.md` 中总结的 DOM 规则与作品列表接口拦截方式，实现了一个最小可运行的 Playwright CLI。

## 功能

- 列出创作者中心当前账号下的全部作品
- 按 `item_id` 或标题选择作品
- 抓取作品评论并导出为 JSON，同时展开并附带子回复
- 自动回复未被作者回复过的评论
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

自动回复未回复评论：

```bash
npm run comments -- \
  --work-title "作品标题" \
  --reply-message "感谢支持，我们会继续加油" \
  --reply-limit 20 \
  --output comments-output/reply-result.json
```

按评论内容定向回复：

```bash
npm run comments -- \
  --work-title "作品标题" \
  --reply-plan-file ./reply-plan.example.json \
  --output comments-output/reply-plan-result.json
```

常用参数：

- `--list-works`：只拉取并输出作品列表
- `--work-id <id>`：按作品 `item_id` 选择
- `--work-title <title>`：按标题选择，优先精确匹配
- `--unreplied-only`：只导出“未回复”评论，不发送回复
- `--reply-message <text>`：开启回复模式，按给定文案回复未回复评论
- `--reply-plan-file <path>`：按 JSON 文件中的匹配规则，给特定评论回复指定文案
- `--reply-dry-run`：进入回复模式并强制切到“未回复”，但在真正发送前停止，便于排查流程
- `--reply-limit <n>`：最多发送多少条回复，默认 `20`
- `--reply-timeout-ms <ms>`：单条回复流程最大等待时间，默认 `30000`
- `--reply-settle-ms <ms>`：发送后等待页面刷新，默认 `1800`
- `--reply-type-delay-ms <ms>`：逐字输入延迟，默认 `100`
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
- `--expand-replies`：展开“条回复”后再抓取，当前为默认行为
- `--no-expand-replies`：关闭子回复展开，仅抓主评论

## 说明

- 登录态依赖抖音创作者中心页面，脚本不会绕过登录或验证码。
- 作品 `item_id` 通过拦截 `/aweme/v1/creator/item/list/` 响应获取；这是文档里明确提到的关键点。
- 如果网络慢，`--list-works` 会先等待接口响应；接口仍未命中时，再用侧边栏 DOM 做标题级兜底，不再直接空退出。
- 按 `--work-id` 或 `--work-title` 抓评论时，脚本会在匹配到目标作品后提前停止滚动，不再遍历完整个作品列表。
- 作品选择现在优先按标题精确匹配；如果同标题作品无法用发布时间区分，脚本会直接报歧义，建议改用 `--work-id`。
- 回复模式会强制先切换到页面原生的“未回复”过滤；如果过滤控件不可用、找不到“未回复”选项或切换失败，脚本会直接报错退出，不再降级继续回复。
- `--unreplied-only` 会走同一套“未回复”过滤逻辑，但只导出评论 JSON，不执行回复动作。
- 回复模式还会把已成功发送过的“作品 + 评论 + 回复文案”记录到 `.playwright/reply-history.json`，脚本重复执行时会优先跳过这些已发记录。
- `--reply-plan-file` 支持为每条目标评论单独指定 `replyMessage`；示例格式见 [reply-plan.example.json](/Users/yangguang.wen/douyin_plugin_back/reply-plan.example.json)。
- `reply-plan-file` 中 `commentText` 必填，`username` 和 `publishText` 选填；填得越全，定向匹配越稳。
- 其他依赖网络或页面渲染的步骤也已经开放超时参数，包括页面打开、作品侧边栏出现、评论区出现和评论抓取总时长。
- 评论抓取结果里每条主评论现在会附带 `replies` 数组，以及 `collectedReplyCount` 字段，表示当前实际抓到的子回复数量。
- 评论抓取仍然基于页面 DOM，页面结构变动后可能需要微调选择器或提取规则。
