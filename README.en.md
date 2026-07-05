# Enhanced Code Blocks

<p align="center">
  <a href="./README.md">中文</a> ·
  <a href="./README.en.md"><b>English</b></a>
</p>

[![Release](https://img.shields.io/github/v/release/yourname/obsidian-enhanced-code-blocks)](https://github.com/yourname/obsidian-enhanced-code-blocks/releases)

Bring VitePress-style Markdown code-block syntax to Obsidian — line highlighting, focus, diff, error / warning markers, line numbers, filename titles, and code groups. Every one of these VitePress-flavoured extensions works natively inside your notes.

## Features

| Feature | Syntax | Effect |
|---------|--------|--------|
| **Line highlighting** | `` ``js{4}`` `` or `` ``js{1,3-5}`` `` | Highlight specified lines |
| **Focus** | `// [!code focus]` or `// [!code focus:2]` | Focus specific lines, blur the rest |
| **Diff markers** | `// [!code ++]` / `// [!code --]` | Added / removed line styles |
| **Error / Warning** | `// [!code error]` / `// [!code warning]` | Error- or warning-coloured line markers |
| **Line numbers** | `` ``ts:line-numbers`` `` or `` ``ts:line-numbers=5`` `` | Show line numbers, optional start value |
| **Code groups** | `::: code-group` + multiple fences | Tabbed multi-language display |


## Installation

1. In Obsidian, open **Settings → Community plugins → Community plugin marketplace**
2. Search for "Enhanced Code Blocks"
3. Click Install, then enable the plugin

Or install manually:
1. Download the latest `main.js` and `manifest.json` from [Releases](https://github.com/yourname/obsidian-enhanced-code-blocks/releases)
2. Drop them into `<vault>/.obsidian/plugins/enhanced-code-blocks/`
3. Restart Obsidian and enable the plugin

## Usage

### Line highlighting

````markdown
```js{4}
export default {
  data () {
    return {
      msg: 'Highlighted!'   // line 4 is highlighted
    }
  }
}
```

Multiple lines are supported: `{1,3-5,7}` highlights line 1, lines 3–5, and line 7.
````
<img src="docs/images/highlight.jpg" alt="highlight" width="500">

### Focus

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

Specify focus breadth: // [!code focus:2]
````
<img src="docs/images/focus.jpg" alt="focus" width="500">

### Error / warning markers

````markdown
```js
const x = 1 // [!code error]
const y = 2 // [!code warning]
```
````

<img src="docs/images/waring&error.jpg" alt="waring&error" width="500">

### Diff markers

````markdown
```js
const old = 'removed' // [!code --]
const new = 'added'     // [!code ++]
```
````

<img src="docs/images/diff.jpg" alt="diff" width="500">

### Line numbers

````markdown
```ts :line-numbers
const line1 = 'has numbers'
const line2 = 'starting at 1'
```

```ts :line-numbers=2
// line numbers start at 2
const line1 = 'has numbers'
const line2 = 'starts at 2'
```

```ts :no-line-numbers
// line numbers are forced off, even when the plugin's
// "Default show line numbers" setting is on
const a = 1
const b = 2
```
````

<img src="docs/images/line-numbers.jpg" alt="line-numbers" width="500">

### Filename title

````markdown
```ts [utils.ts]
// the filename is shown above the code block
export const x = 1
```
````

<img src="docs/images/filename-title.jpg" alt="filename-title" width="500">

### Code group

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


## Settings

- **Default show line numbers**: when on, every code block shows line numbers by default, unless `:no-line-numbers` is explicitly added.
