# Enhanced Code Blocks

<p align="center">
  <a href="./README.md"><b>中文</b></a> ·
  <a href="./README.en.md">English</a>
</p>

[![Release](https://img.shields.io/github/v/release/ltcooooooo/obsidian-enhanced-code-blocks)](https://github.com/ltcooooooo/obsidian-enhanced-code-blocks/releases)

为 Obsidian 带来增强的 Markdown 代码块语法——高亮、聚焦、差异、错误/警告标记、行号、文件名标题、代码组，所有这些 VitePress 风格的语法扩展都能在你的笔记里使用。

## 功能特性

| 功能  | 效果 |
|------|------|
| **行高亮** | 高亮指定行 |
| **聚焦** | 聚焦特定行，模糊其他 |
| **差异标记** | 新增/删除行样式 |
| **错误/警告** | 错误色/警告色行标记 |
| **行号** | 显示行号，可指定起始 |
| **文件名标题** | 显示文件名标题 |
| **代码组** | 标签页式多语言展示 |


## 安装

1. 在 Obsidian 内打开 **设置 → 第三方插件 → 社区插件市场**
2. 搜索 "Enhanced Code Blocks"
3. 点击安装后启用

或手动安装：
1. 从 [Releases](https://github.com/ltcooooooo/obsidian-enhanced-code-blocks/releases) 下载最新 `main.js` 和 `manifest.json`
2. 将文件放入 `<vault>/.obsidian/plugins/enhanced-code-blocks/`
3. 重启 Obsidian，启用插件

## 使用方法

### 行高亮

````markdown
```js{4}
export default {
  data () {
    return {
      msg: 'Highlighted!'   // 第 4 行被高亮
    }
  }
}
```

支持多个行：`{1,3-5,7}`，表示高亮第 1 行、3-5 行、第 7 行。
````
<img src="docs/images/highlight.jpg" alt="highlight" width="500">

### 聚焦

````markdown
```js
export default {
  data () {
    return {
      msg: 'Focused!' // [!code focus]
    }
  }
}
```

可指定聚焦行数：// [!code focus:2]
````
<img src="docs/images/focus.jpg" alt="focus" width="500">

### 错误/警告标记
````markdown
```js
const x = 1 // [!code error]
const y = 2 // [!code warning]
```
````

<img src="docs/images/waring&error.jpg" alt="waring&error" width="500">

### 差异标记

````markdown
```js
const old = 'removed' // [!code --]
const new = 'added'     // [!code ++]
```
````

<img src="docs/images/diff.jpg" alt="diff" width="500">

### 行号

````markdown
```ts :line-numbers
const line1 = 'has numbers'
const line2 = 'starting at 1'
```

```ts :line-numbers=2
// 行号从 2 开始
const line1 = 'has numbers'
const line2 = 'starts at 2'
```

```ts :no-line-numbers
// 强制不显示行号，即使设置里开启了：默认显示行号
const a = 1
const b = 2
```
````

<img src="docs/images/line-numbers.jpg" alt="line-numbers" width="500">

### 文件名标题

````markdown
```ts [utils.ts]
// 文件名显示在代码块顶部
export const x = 1
```
````

<img src="docs/images/filename-title.jpg" alt="filename-title" width="500">

### 代码组

````markdown
::: code-group
```js [config.js]
export default { /* JS config */ }
```

```ts [config.ts]
export default { /* TS config */ }
```
:::
````

<img src="docs/images/code-group.jpg" alt="code-group" width="500">


## 设置

- **默认显示行号**：开启后，所有代码块默认显示行号，除非显式添加 `:no-line-numbers`
