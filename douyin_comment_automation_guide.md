# 抖音创作者中心评论自动化开发指南

本文档总结了基于 Web 自动化测试工具（如 Playwright、Puppeteer 或 Selenium）在[抖音创作者中心评论管理页面](https://creator.douyin.com/creator-micro/interactive/comment)执行抓取、判断和回复操作的关键 DOM 结构、选择器规则及避坑指南。

将其提供给其他 AI 作为 Context (上下文)，可以极大提高自动化脚本生成的成功率，防止因为不熟悉对应前端框架渲染逻辑陷入长时间 Debug。

## 一、核心操作流程与定位解析

### 1. 抓取评论信息 (区分主评论与嵌套回复)
页面上的评论呈扁平化的列表块排布。抖音并没有使用严格的 `div` 层级嵌套来包裹父子评论，因此要正确解析出带层级的 `[{comment, replies: []}]` 数据，必须依赖 **DOM 的物理位置**和**视觉缩进特征**。

*   **遍历基础列表**：页面上的评论均由统一的区块组成。通过获取列表内所有具有评论特征的项进行遍历。
*   **识别主评论 vs 嵌套回复 (核心规律)**：
    *   **X 轴偏移量 (X-Coordinate)**：这是最坚固的判断依据。主评论的头像和内容起始位置靠左（例如距视口左边缘 `X ≈ 210px`）。而它的子回复（嵌套回复）会有明显的缩进（`X ≈ 246px` 或更大）。你可以在 Playwright 中使用 `await element.boundingBox()` 获取元素的 `x` 坐标来进行界定。
    *   **⚠️ 深层嵌套的“扁平化”陷阱**：需要特别注意，如果一个用户回复了另一个用户的子评论（即“回复的回复”），在抖音创作者中心的 PC 端 UI 中，它**不会产生第三级缩进**。所有属于同一个主评论的下级对话，它们的 `X` 坐标全部都在 `246px`，在 DOM 中作为**完全平级的兄弟节点**陈列。
*   **如何提取一条完整的评价链条与关系**：
    1.  遍历所有评论区块。
    2.  如果当前区块的 `X` 坐标较小（属于主级），那么提取它的**用户名**、**内容**、**时间**，并以它作为当前的“主评论”。
    3.  在这个“主评论”区块中，寻找是否有“展开 x 条回复”的按钮（`div:has-text("条回复")`）。
    4.  如果有，**点击该按钮展开**，然后**必须显式等待大约 1.5 秒**让 DOM 渲染出嵌套的回复气泡。
    5.  继续向下扫描后续相邻的评论区块。只要它们的 `X` 坐标大（约 `246px`），它们就全属于当前“主评论”的对话流。收集这些子回复的数据。
    6.  **确定真正的“回复对象”**：由于视觉上平级，要辨别子评论到底是干嘛的，有两种思路：
        *   **(UI 探针法)**：使用脚本快速点击该子评论下的“回复”按钮，读取弹出的输入框的 `placeholder` 属性（如 `placeholder="回复 星然："`），借此提炼出真实的对话目标，随后点击“取消”或移除焦点关掉输入框。
        *   **(API 拦截法 - 极度推荐)**：我已经亲自为你验证了底层的 API 获取规律！直接拦截并解析对应的网络响应（Response）是提取所有数据的最简单、且 100% 准确的方法，你可以完全抛弃上面复杂的 UI X轴计算。
            *   **主评论接口**：拦截 `GET .../aweme/v1/web/comment/list/select/`。JSON 的 `comments` 数组中包含了每条主评论的 `cid` (评论唯一 ID)、`text`、`user` 等详细信息。
            *   **嵌套回复接口**：点击“查看 X 条回复”时，拦截 `GET .../aweme/v1/web/comment/list/reply/`。该 JSON 的 `comments` 数组中包含了子回复的细则，最关键的是每条包含 `root_comment_id`（顶级主评论 ID）以及 `reply_to_reply_id`（如果它回复了另一个子评论，这里会有对应 ID）。
            *   利用这些 ID 映射（犹如数据库表的外键关联），你可以零误差地梳理出每一套对话层的父子树形结构。
    7.  一旦遇到“收起”按钮或下一个 `X` 坐标恢复到 210px 主级别的评论区块，当前父评论的收集链彻底结束。

### 2. 快速过滤“未回复”评论（官方原生功能，强烈建议首选）
在遍历与回复之前，最高效的防重复回复策略是利用页面自带的过滤功能，直接选用**“未回复”**状态，从而在源头剔除已处理过的评论。

*   **定位过滤下拉框（触发器）**
    *   **选择器**：`div[role="combobox"].douyin-creator-interactive-select`
    *   **特征**：初始文本为“全部评论”。该组件存在交互状态对应的 class，使用基础 role 和 class 定位最为稳定。
*   **点击展开并选择“未回复”**
    *   **选项选择器**：`.douyin-creator-interactive-select-option`
    *   **逻辑**：点击下拉框后，下拉面板通常挂载在页面的 Portal 中（如 body 末尾）。由于其内部 ID 是动态的（如 `zr32inh`），切记**不可按 ID 寻找**。需要获取所有下拉选项，并基于文本内容 `textContent.trim() === '未回复'` 进行精准点击。
    *   **等待 DOM 刷新**：选中后列表会自动刷新，只展现未回复的数据。代码最好等待相应的网络接口完成响应或列表更新。

### 3. DOM层级的防重复回复检测（单条评论内部辅助/兜底）
即使使用了列表过滤，某些特定场景（如单条处理的二次校验）下仍需判断当前评论是否已被回复过。

由于作者的回复是被折叠收纳在主评论的【子评论区域】中的，必须执行深层检测：
*   **第一层：检测是否存在子评论展开按钮**
    *   **定位特征**：在当前评论区块内，寻找包含文本 **“条回复”** 的按钮。
    *   **选择器**：`div:has-text("条回复")` 或 `button:has-text("条回复")`。
    *   **逻辑**：如果不存在这个按钮，说明没人回复过，可直接进行回复。如果存在，则可能包含作者的回复，进入第二层判断。
*   **第二层：展开列表寻找“作者”专属徽章**
    *   **操作**：检测到存在上述按钮后，点击该按钮以展开子评论列表（展开后按钮文字通常会变为 **“收起”**）。
    *   **等待**：务必显式等待短暂时间（如 0.5s~1s），等待嵌套的 DOM 元素以及头像信息加载完毕。
    *   **寻找徽章**：在刚刚展开的区域中，寻找带有 **“作者”** 字样的红色醒目标签元素（通常紧跟在回复者 ID 后面）。
    *   **选择器**：`span:has-text("作者")`。
    *   **结论**：如果能在展开的子级中找到“作者”标签，说明你已回复，可以直接跳过此条评论；如果没有，则说明下面只是其他粉丝的互动，你仍然需要执行回复。

### 4. 回复指定评论流程
确认需要回复后，执行以下步骤与页面结构交互：
*   **点击原始“回复”按钮**
    *   **选择器**：在当前评论块内寻找 `button:has-text("回复")` 或者相应的可点击区域并 Click。
*   **激活并聚焦输入框（极其核心）**
    *   页面会在该评论下动态渲染插入一个 `contenteditable="true"` 的富文本 `div` 组件。
    *   **选择器**：`div.input-d24X73`（或利用包含 `contenteditable="true"` 特征进行模糊定位）。
    *   ⚠️ **避坑说明**：不能直接用 JS 注入文本或设置 value！必须调用 UI 自动化工具的 **Focus 或 Click 操作**激活该输入框，直到肉眼能看到里面出现闪烁的光标。
*   **填写回复内容**
    *   必须使用框架原生支持的【按键物理模拟】方法输入内容（例如 Playwright 的 `locator.type()` ），这才能触发 React/Vue 前端框架内部绑定的 `onInput/onChange` 事件。
*   **点击“发送”按钮**
    *   只有上述打字事件成功触发后，旁边的【发送】按钮才会变红，解除禁用（Disabled）状态。
    *   **选择器**：`button:has-text("发送")`。
*   **等待 DOM 刷新**
    *   发送按钮点击后，一定要显式等待（Sleep 1.5s~2s左右），这是为了等待接口返回及页面将你刚刚发出的气泡作为子 DOM 插入到列表里。如果不等待直接进行下一条，由于重排可能导致下一个元素的 Locator 定位失效。

### 5. 获取与切换作品列表
要专项管理特定视频下的评论或获取账号下所有作品的 ID 映射，需要操作页面右上方的“选择作品”侧边栏。

*   **打开作品侧边栏**
    *   点击右上方的红色 **“选择作品”** 按钮。
    *   **选择器**：`button:has-text("选择作品")` 或 `button.douyin-creator-interactive-button-primary`。
*   **侧边栏的 DOM 结构**
    *   弹出后，右侧会滑出侧边栏容器（Side Sheet），其选择器为 `.douyin-creator-interactive-sidesheet-body`。
    *   容器内包含了作品列表，每个作品是一个直接的子 `div`。
    *   **标题提取**：通常是该作品块内部文字区域的第一个非日期的子 `div`（可利用不以“发布于”开头的正则过滤）。
    *   **日期提取**：利用选择器 `div:has-text("发布于")` 获取发布时间。
*   **无限滚动与加载逻辑（分页）**
    *   平台采用的是**懒加载（无限滚动）**机制。要获取全部作品，必须用 JS 不断将 `.douyin-creator-interactive-sidesheet-body` 的 `scrollTop` 向下调整。
    *   **循环判定**：每向下滚动一段距离后，等待 1 秒。比对滚动前后容器内子元素的总数 `$$('.douyin-creator-interactive-sidesheet-body > div').length`，如果数量不再增加，则说明滚动到底部，加载完毕。
*   **⚠️ 致命避坑：如何获取视频 ID (item_id)**
    *   **现象**：在侧边栏的 DOM 树中，抖音**并没有**把作品的唯一识别码（`item_id` 或对应的作品 URL）写在由 HTML 渲染出的元素属性（如 `id` / `href` / `data-id`）上。如果只抓 HTML，你只能拿到文字标题，后续无法精准发送 API 或构造落地页链接。
    *   **解决方案：API 拦截 (Network Interception)**。
    *   当你打开侧边栏或向下滚动时，前端会调用获取作品列表的底层接口。
    *   你需要监听浏览器的 `response` 事件，**拦截 URL 中包含 `/aweme/v1/creator/item/list/` 的请求**并解析其响应 JSON，从中提取 `item_id`、`sec_item_id` 和确切的 `title`，然后在内存中与 DOM 元素建立映射，或直接在纯 API 层面使用。

---

## 二、Playwright 伪代码范例 (可直接提交给其他大模型作为种子)

### 示例 1: 拦截并无限滚动获取所有作品 ID 集合
```javascript
async function fetchAllWorks(page) {
  const worksList = [];
  
  // 1. 设置网络监听，一旦有列表接口返回，就抽取数据存起来
  page.on('response', async (response) => {
    if (response.url().includes('/aweme/v1/creator/item/list/')) {
      const data = await response.json();
      if (data && data.work_list) {
         // data.work_list 中每一项都包含了关键的 item_id, res_id, title 等
         worksList.push(...data.work_list);
      }
    }
  });

  // 2. 触发侧边栏打开
  await page.click('button:has-text("选择作品")');
  await page.waitForSelector('.douyin-creator-interactive-sidesheet-body');
  
  // 3. 不断滚动到底部直到不再加载新内容
  const containerLocator = page.locator('.douyin-creator-interactive-sidesheet-body');
  let prevCount = 0;
  
  while (true) {
    const currentCount = await containerLocator.locator('> div').count();
    // 如果列表不再增长，说明触底
    if (currentCount > 0 && currentCount === prevCount) {
       console.log("所有作品加载完毕，节点数量:", currentCount);
       break;
    }
    prevCount = currentCount;
    
    // 执行滚动并等待网络接口返回及渲染
    await containerLocator.evaluate(node => node.scrollTop += 3000);
    await page.waitForTimeout(1500); 
  }
  
  return worksList; // 这里面包含了极度稀缺的 item_id 
}
```

### 示例 2: 切换到"未回复"评论过滤视图

利用此范例可以在执行具体的评论遍历操作前，先把页面上的无用已回复评论剔除。

```javascript
async function filterUnrepliedComments(page) {
  // 1. 定位并点击“全部评论”所在的下拉框触发器
  const dropdownTrigger = page.locator('div[role="combobox"].douyin-creator-interactive-select');
  await dropdownTrigger.click();

  // 2. 显式等待下拉面板选项渲染出来（面板通常位于 Portal 即外层 body 中）
  await page.waitForSelector('.douyin-creator-interactive-select-option');
  
  // 3. 遍历列表，精确寻找文本包含“未回复”的选项并点击
  const options = page.locator('.douyin-creator-interactive-select-option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = await options.nth(i).textContent();
    if (text && text.trim() === '未回复') {
      await options.nth(i).click();
      break;
    }
  }

  // 4. 选择后，等待评论列表的网络更新或 DOM 重绘
  // await page.waitForResponse(res => res.url().includes('comment/list'));
  await page.waitForTimeout(1000); 
}
```

### 示例 3: 处理单条评论防重复回复与安全点击流程

以下示例代码演示了在处理每一个独立的评论区块时，应当如何串起上述状态校验与动作链路：

```javascript
/**
 * 处理单条评论防重复回复与安全点击流程
 * @param {import('playwright').Locator} commentLocator 单个主评论容器的 Locator
 * @param {string} replyMessage 你想要回复给用户的文案
 */
async function safeReplyToComment(commentLocator, replyMessage) {
  // --------- 1. 状态监测环节：防止重复回复 ---------
  // 查找该评论块底部的“展开回复”按钮 （包括“收起”状态以防万一）
  const toggleBtn = commentLocator.locator('div:has-text("条回复"), div:has-text("收起")').first();
  
  if (await toggleBtn.count() > 0) {
      const btnText = await toggleBtn.textContent();
      // 如果还没展开，则点击展开
      if (btnText.includes('条回复')) {
          await toggleBtn.click();
          // 等待子评论的虚拟 DOM 挂载和接口加载
          await commentLocator.page().waitForTimeout(800); 
      }
      
      // 展开就绪后，寻找有无标志性的“作者”Badge
      const authorBadge = commentLocator.locator('span:has-text("作者")');
      if (await authorBadge.count() > 0) {
          console.log('[Info] 发现作者徽章，此评论之前已回复，跳过逻辑。');
          return; 
      }
  }

  // --------- 2. 执行回复动作环节 ---------
  // (A) 点击评论本身的 "回复" 动作按钮
  const replyButton = commentLocator.locator('button:has-text("回复"), div:has-text("回复")').first();
  await replyButton.click();

  // (B) 关键避坑：必须精确定位动态生成的输入框，并触发鼠标点击 (Focus) 光标闪烁
  const inputBox = commentLocator.locator('div[contenteditable="true"]').first();
  await inputBox.click(); 

  // (C) 关键避坑：不能直接设值，必须用 type 模拟键盘逐字输入以解锁发送按钮
  await inputBox.type(replyMessage, { delay: 100 }); 

  // (D) 定位并点击现已生效变色的 "发送" 按钮
  const sendButton = commentLocator.locator('button:has-text("发送")').first();
  await sendButton.click();

  // --------- 3. 清理环节 ---------
  // 等待发送请求飞走、UI添加新气泡完毕。否则立刻开始寻找下一条极易发生 Stale Node 异常
  await commentLocator.page().waitForTimeout(1500); 
}
```

## 三、稳定性补充建议 (给大模型的提示)
1. **摒弃静态数组遍历 DOM**：不要一次性 `querySelectorAll` 抓取几十条评论进入一个固定数组去开启 `for` 循环。当作者发出一条新回复后，DOM 中会被动态插入新的 div 气泡，原先存在内存变量中的节点指针可能集体失效。建议每次处理完一个块后，**重新查询**列表里下一个符合条件的未处理目标。
2. **中文字符安全支持**：若是通过更底层的驱动调用，部分轻量级鼠标/键盘映射库对 unicode 字符集输入不够友好。确保执行环境天然支持 utf8 的 `keyboard.type`。
