/**
 * Live-preview (CodeMirror 6) rendering of VitePress code blocks.
 *
 * Obsidian's reading view runs Markdown post-processors, but Live Preview
 * renders code blocks inside the editor where post-processors do not give us
 * the fence info string (`{1,3}`, `:line-numbers`, `[title]`, …).  So here we
 * parse the raw document, and replace each fenced block / `::: code-group`
 * region with a VitePress-styled widget — but only when the cursor is *not*
 * inside it, so the block stays editable.
 *
 * Block-level replace decorations must be supplied through a StateField (not a
 * ViewPlugin), so:
 *   - `vpDecorationField`  builds the decorations from doc + selection + cache.
 *   - `vpHighlightController` (a ViewPlugin) kicks off async Shiki highlighting
 *     for any block not yet in the cache, then asks the field to rebuild.
 */

import {
	type EditorState,
	RangeSetBuilder,
	StateEffect,
	StateField,
	type Extension,
} from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from '@codemirror/view';

import { editorLivePreviewField } from 'obsidian';

import { parseDoc, type DocBlock } from './parse';
import {
	ensureHighlight,
	getCachedHighlight,
	highlightKey,
	parseInfo,
} from './codeHighlighter';
import { renderCodeBlock, renderCodeGroup, type GroupItemRender } from './domWrapper';

/** Effect dispatched when freshly-highlighted HTML is ready, to force a rebuild. */
const vpRefresh = StateEffect.define<null>();

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/** True for clicks on interactive controls (copy button, code-group tabs) that
 *  the widget handles itself — those must NOT move the editor cursor. */
function isInteractiveTarget(target: EventTarget | null): boolean {
	const t = target as HTMLElement | null;
	return !!(t && t.closest('.copy, .tabs, .vp-tab'));
}

/**
 * Wrap a rendered block for use as a CM block widget and wire up "click to
 * edit": clicking anywhere except an interactive control moves the editor
 * cursor into the block, which makes the StateField drop this widget on the
 * next rebuild and reveal the raw source for editing.
 *
 * The wrapper also fixes height measurement: CodeMirror measures block widgets
 * via `offsetHeight`, which EXCLUDES margin, so the VitePress block's
 * `margin: 16px 0` is turned into padding on this wrapper (which IS measured).
 */
function wrapForWidget(inner: HTMLElement, view: EditorView): HTMLElement {
	const wrap = activeDocument.createElement('div');
	wrap.classList.add('vp-cm-wrap');
	wrap.appendChild(inner);

	wrap.addEventListener('mousedown', (e) => {
		if (isInteractiveTarget(e.target)) return; // let tabs switch
		e.preventDefault();
		// posAtDOM returns this widget's document position (the start of the
		// replaced range). posAtCoords is unreliable over a replaced widget —
		// it tends to resolve to content *outside* the block, so the cursor
		// never lands inside and the source never reveals.
		const pos = view.posAtDOM(wrap);
		view.dispatch({ selection: { anchor: pos } });
		view.focus();
	});

	return wrap;
}

class CodeBlockWidget extends WidgetType {
	constructor(
		private html: string,
		private lang: string,
		private lineNumbers: boolean,
		private title: string,
		private lineNumberStart: number,
		private key: string,
	) {
		super();
	}

	eq(other: CodeBlockWidget): boolean {
		return other.key === this.key;
	}

	toDOM(view: EditorView): HTMLElement {
		try {
			const el = renderCodeBlock(
				this.html,
				this.lang,
				this.lineNumbers,
				this.title,
				this.lineNumberStart,
			);
			el.classList.add('vp-cm-block');
			return wrapForWidget(el, view);
		} catch (e) {
			console.error('[VP-MD] CodeBlockWidget.toDOM threw', e);
			const fallback = activeDocument.createElement('div');
			fallback.textContent = '[vp render error]';
			return fallback;
		}
	}

	ignoreEvent(): boolean {
		// The widget handles its own events (cursor placement / tab switching).
		return true;
	}
}

class CodeGroupWidget extends WidgetType {
	constructor(
		private items: GroupItemRender[],
		private key: string,
	) {
		super();
	}

	eq(other: CodeGroupWidget): boolean {
		return other.key === this.key;
	}

	toDOM(view: EditorView): HTMLElement {
		const el = renderCodeGroup(this.items);
		el.classList.add('vp-cm-group');
		return wrapForWidget(el, view);
	}

	ignoreEvent(): boolean {
		return true;
	}
}

// ---------------------------------------------------------------------------
// Decoration building (pure read of the highlight cache)
// ---------------------------------------------------------------------------

function decorationForBlock(block: DocBlock): Decoration | null {
	if (block.type === 'code') {
		const parsed = parseInfo(block.info);
		const lang = parsed.lang || 'text';
		const html = getCachedHighlight(block.code, lang, parsed.meta);
		if (html === undefined) return null; // not highlighted yet → leave source visible

		const key = `b ${highlightKey(block.code, lang, parsed.meta)} ${parsed.lineNumbers} ${parsed.lineNumberStart} ${parsed.title}`;
		return Decoration.replace({
			widget: new CodeBlockWidget(
				html,
				lang,
				parsed.lineNumbers,
				parsed.title,
				parsed.lineNumberStart,
				key,
			),
			block: true,
		});
	}

	// code group – every member must be highlighted before we can render
	const items: GroupItemRender[] = [];
	for (const it of block.items) {
		const parsed = parseInfo(it.info);
		const lang = parsed.lang || 'text';
		const html = getCachedHighlight(it.code, lang, parsed.meta);
		if (html === undefined) return null;
		items.push({
			html,
			lang,
			title: parsed.title || lang,
			lineNumbers: parsed.lineNumbers,
			lineNumberStart: parsed.lineNumberStart,
		});
	}
	if (items.length === 0) return null;

	const key = 'g ' + block.items.map((i) => `${i.info}${i.code}`).join('');
	return Decoration.replace({ widget: new CodeGroupWidget(items, key), block: true });
}

// ---------------------------------------------------------------------------
// State field that holds the decorations
// ---------------------------------------------------------------------------

const vpDecorationField = StateField.define<DecorationSet>({
	create(state) {
		return buildFromState(state);
	},
	update(value, tr) {
		const refresh = tr.effects.some((e) => e.is(vpRefresh));
		if (tr.docChanged || tr.selection || refresh) {
			return buildFromState(tr.state);
		}
		return value;
	},
	provide: (f) => EditorView.decorations.from(f),
});

// Build decorations from a state (doc + selection + highlight cache).
function buildFromState(state: EditorState): DecorationSet {
	// Only render widgets in Live Preview, never in raw Source mode.
	if (state.field(editorLivePreviewField, false) === false) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();
	const doc = state.doc;
	const sel = state.selection;
	let blocks: ReturnType<typeof parseDoc>;
	try {
		blocks = parseDoc(doc.toString());
	} catch (e) {
		console.error('[VP-MD] parseDoc threw', e);
		return Decoration.none;
	}

	for (const block of blocks) {
		if (block.fromLine < 0 || block.toLine >= doc.lines) continue;
		const fromPos = doc.line(block.fromLine + 1).from;
		const toPos = doc.line(block.toLine + 1).to;
		const overlaps = sel.ranges.some((r) => r.from <= toPos && r.to >= fromPos);
		if (overlaps) continue;
		let deco: Decoration | null = null;
		try {
			deco = decorationForBlock(block);
		} catch (e) {
			console.error('[VP-MD] decorationForBlock threw', block, e);
		}
		if (!deco) continue;
		builder.add(fromPos, toPos, deco);
	}
	return builder.finish();
}

// ---------------------------------------------------------------------------
// View plugin that drives async highlighting and triggers rebuilds
// ---------------------------------------------------------------------------

const vpHighlightController = ViewPlugin.fromClass(
	class {
		private pending = new Set<string>();
		private destroyed = false;

		constructor(view: EditorView) {
			this.scan(view);
		}

		update(u: ViewUpdate): void {
			// Also rescan on a refresh effect so a theme change (which invalidates
			// the theme-keyed highlight cache) re-highlights under the new theme.
			const refreshed = u.transactions.some((t) =>
				t.effects.some((e) => e.is(vpRefresh)),
			);
			if (u.docChanged || u.viewportChanged || refreshed) this.scan(u.view);
		}

		private scan(view: EditorView): void {
			const blocks = parseDoc(view.state.doc.toString());
			for (const block of blocks) {
				const items = block.type === 'code' ? [{ info: block.info, code: block.code }] : block.items;
				for (const it of items) {
					const parsed = parseInfo(it.info);
					const lang = parsed.lang || 'text';
					if (getCachedHighlight(it.code, lang, parsed.meta) !== undefined) continue;

					const key = highlightKey(it.code, lang, parsed.meta);
					if (this.pending.has(key)) continue;
					this.pending.add(key);

					ensureHighlight(it.code, lang, parsed.meta)
						.then(() => {
							this.pending.delete(key);
							if (this.destroyed) return;
							view.dispatch({ effects: vpRefresh.of(null) });
						})
						.catch(() => {
							this.pending.delete(key);
						});
				}
			}
		}

		destroy(): void {
			this.destroyed = true;
		}
	},
);

// ---------------------------------------------------------------------------
// Public extension
// ---------------------------------------------------------------------------

export const vitePressLivePreview: Extension = [vpDecorationField, vpHighlightController];

/** Force a given editor to rebuild its VitePress decorations (e.g. after a
 *  settings change). Safe to call on any CodeMirror EditorView. */
export function refreshLivePreview(view: EditorView): void {
	view.dispatch({ effects: vpRefresh.of(null) });
}
