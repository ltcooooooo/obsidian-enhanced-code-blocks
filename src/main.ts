import { debounce, MarkdownPostProcessorContext, MarkdownView, Plugin, TFile } from 'obsidian';
import { ensureHighlight, parseInfo, type ParsedInfo } from './codeHighlighter';
import { renderCodeBlock, renderCodeGroup, type GroupItemRender } from './domWrapper';
import { isInsideCodeGroup, parseDoc, type CodeGroupBlock } from './parse';
import { refreshLivePreview, vitePressLivePreview } from './livePreview';
import { DEFAULT_SETTINGS, vpConfig, type VPSettings } from './config';
import { VPSettingTab } from './settings';

export default class VitePressMarkdownPlugin extends Plugin {
	settings: VPSettings = { ...DEFAULT_SETTINGS };

	async onload() {

		await this.loadSettings();
		this.addSettingTab(new VPSettingTab(this.app, this));

		this.registerEditorExtension(vitePressLivePreview);

		const onCssChange = debounce(() => this.refreshAllViews(), 150, true);
		this.registerEvent(this.app.workspace.on('css-change', onCssChange));

		// ── Reading mode: post-processor ─────────────────────────────────
		this.registerMarkdownPostProcessor(
			async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
				if (el.tagName === 'DIV' && el.classList.contains('el-pre')) {
					await this.processCodeBlock(el, ctx);
					return;
				}

				// VitePress container markers (`::: code-group` / `:::`) on adjacent
				// source lines get merged by Obsidian into a single paragraph, and
				// soft line-breaks vanish from `textContent` (e.g. `::::::code-group`),
				// so detect by substring rather than exact equality. The precise
				// source-line resolution happens later in `resolveCodeGroupFromSource`
				// (after the element is connected and `getSectionInfo` is available).
				const text = el.textContent ?? '';

				// Any opener present → render a code group for this section.
				if (text.includes('code-group')) {
					this.renderCodeGroupWhenReady(el, ctx);
					return;
				}

			// Paragraph consisting solely of closing `:::` markers → hide it.
			if (text.includes(':::') && /^[:\s]+$/.test(text.trim())) {
				el.classList.add('vp-hidden');
			}
			},
		);
	}

	onunload() {}

	// ─────────────────────────────────────────────────────────────────────
	// Settings
	// ─────────────────────────────────────────────────────────────────────

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<VPSettings>,
		);
		vpConfig.lineNumbers = this.settings.lineNumbers;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		vpConfig.lineNumbers = this.settings.lineNumbers;
		this.refreshAllViews();
	}

	private refreshAllViews(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			view.previewMode?.rerender(true);
			// Obsidian's `Editor` class doesn't expose a typed `.cm` accessor, so we
			// scaffold one with a structural cast before reading it.
			const cm: import('@codemirror/view').EditorView | undefined = (
				view.editor as { cm?: import('@codemirror/view').EditorView }
			).cm;
			if (cm) refreshLivePreview(cm);
		});
	}

	// ─────────────────────────────────────────────────────────────────────
	// Code-group rendering
	// ─────────────────────────────────────────────────────────────────────

	/**
	 * Wait until `el` is actually connected in the DOM, then render.
	 * Obsidian's post-processor may call us while the element is still
	 * detached, so polling is the safest approach.
	 */
	private renderCodeGroupWhenReady(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		let attempts = 0;
		const tryRender = () => {
			attempts++;
			if (el.isConnected) {
				void this.renderCodeGroupInto(el, ctx);
			} else if (attempts < 20) {
				window.setTimeout(tryRender, 50);
			}
		};
		window.setTimeout(tryRender, 0);
	}

	private async renderCodeGroupInto(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): Promise<void> {
		if (!el.isConnected) return;
		// Guard on the actual rendered content, NOT a persistent data-attribute:
		// Obsidian reuses this `el` across re-renders and resets its innerHTML back
		// to the raw `<p>::: code-group</p>` while keeping our attributes, so a
		// dataset flag would wrongly block the needed re-render. `.vp-code-group`
		// only exists when our content is actually present.
		if (el.querySelector('.vp-code-group')) return;

		const group = await this.resolveCodeGroupFromSource(el, ctx);
		if (!group) return;

		const rendered = await this.renderGroupItems(group);
		if (rendered.length === 0) return;

		const groupEl = renderCodeGroup(rendered);
		// Mutate `el` in place rather than `el.replaceWith(groupEl)`: Obsidian keeps
		// a reference to `el` and inserts *it* (not any replacement) into the preview,
		// so a replaceWith is silently discarded — only edits to `el` itself persist.
		el.empty();
		el.appendChild(groupEl);
	}

	private async resolveCodeGroupFromSource(
		opener: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): Promise<CodeGroupBlock | null> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return null;

		const content = await this.app.vault.read(file);
		const groups = parseDoc(content).filter(
			(b): b is CodeGroupBlock => b.type === 'group',
		);
		if (groups.length === 0) return null;

		const si = ctx.getSectionInfo(opener);
		if (si) {
			// The opener may share a paragraph with the previous group's closing
			// `:::`, so match any group whose marker falls within this section's
			// source range rather than requiring it to start exactly at lineStart.
			const match = groups.find(
				(g) => g.fromLine >= si.lineStart && g.fromLine <= si.lineEnd,
			);
			if (match) return match;
		}

		return groups.length === 1 ? (groups[0] ?? null) : null;
	}

	// ─────────────────────────────────────────────────────────────────────
	// Code block processing
	// ─────────────────────────────────────────────────────────────────────

	async processCodeBlock(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): Promise<void> {
		const pre = el.querySelector('pre');
		if (!pre) return;

		const code = pre.querySelector('code');
		if (!code) return;

		if (el.querySelector('.vp-markdown-body')) return;

		const sectionInfo = ctx.getSectionInfo(pre);
		if (!sectionInfo) return;

		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const fileContent = await this.app.vault.read(file);
		const lines = fileContent.split('\n');

		if (isInsideCodeGroup(lines, sectionInfo.lineStart)) {
			el.classList.add('vp-hidden');
			return;
		}

		const fenceLine = lines[sectionInfo.lineStart] ?? '';
		if (!fenceLine.trim().startsWith('```')) return;

		const infoStr = fenceLine.trim().slice(3).trim();
		const parsed: ParsedInfo = parseInfo(infoStr);

		const codeLines = lines.slice(sectionInfo.lineStart + 1, sectionInfo.lineEnd);
		const rawCode = codeLines.join('\n');

		let lang = parsed.lang;
		if (!lang) {
			for (const cls of Array.from(code.classList)) {
				if (cls.startsWith('language-')) {
					lang = cls.slice(9);
					break;
				}
			}
		}
		lang = lang || 'text';

		let highlighted: string;
		try {
			highlighted = await ensureHighlight(rawCode, lang, parsed.meta);
		} catch (err) {
			console.error('[VP-MD] highlight error:', err);
			return;
		}

		const wrapper = renderCodeBlock(
			highlighted,
			lang,
			parsed.lineNumbers,
			parsed.title,
			parsed.lineNumberStart,
		);

		el.empty();
		el.appendChild(wrapper);
	}

	// ─────────────────────────────────────────────────────────────────────
	// Code group helpers
	// ─────────────────────────────────────────────────────────────────────

	private async renderGroupItems(group: CodeGroupBlock): Promise<GroupItemRender[]> {
		const rendered: GroupItemRender[] = [];
		for (const item of group.items) {
			const parsed = parseInfo(item.info);
			const lang = parsed.lang || 'text';
			let html: string;
			try {
				html = await ensureHighlight(item.code, lang, parsed.meta);
			} catch {
				continue;
			}
			rendered.push({
				html,
				lang,
				title: parsed.title || lang,
				lineNumbers: parsed.lineNumbers,
				lineNumberStart: parsed.lineNumberStart,
			});
		}
		return rendered;
	}
}
