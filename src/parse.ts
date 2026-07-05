/**
 * Source-level parsing of VitePress markdown constructs.
 *
 * Both the reading-mode post-processor and the live-preview CodeMirror
 * extension work from the raw source text (the rendered DOM does not carry
 * the fence info string such as `{1,3}`, `:line-numbers`, `[title]`).  This
 * module turns source text into a flat list of "blocks" with line offsets so
 * each renderer can map them back onto its own DOM / document.
 */

export interface FenceItem {
	/** Raw info string after the opening fence (e.g. `ts:line-numbers {1} [x]`). */
	info: string;
	/** The code body (without the fence lines). */
	code: string;
}

export interface CodeBlock {
	type: 'code';
	/** 0-based inclusive line index of the opening fence. */
	fromLine: number;
	/** 0-based inclusive line index of the closing fence. */
	toLine: number;
	info: string;
	code: string;
}

export interface CodeGroupBlock {
	type: 'group';
	/** 0-based inclusive line index of the `::: code-group` marker. */
	fromLine: number;
	/** 0-based inclusive line index of the closing `:::` marker. */
	toLine: number;
	items: FenceItem[];
}

export type DocBlock = CodeBlock | CodeGroupBlock;

const FENCE_RE = /^(\s*)(`{3,}|~{3,})(.*)$/;
export const GROUP_OPEN_RE = /^:::\s+code-group\s*$/;
export const GROUP_CLOSE_RE = /^:::\s*$/;

/** Does `line` close a fence opened with `marker` (e.g. "```")? */
function closesFence(line: string, marker: string): boolean {
	const m = FENCE_RE.exec(line);
	if (!m) return false;
	const fence = m[2] ?? '';
	const rest = m[3] ?? '';
	// Closing fence must use the same char and be at least as long, with nothing after.
	return fence[0] === marker[0] && fence.length >= marker.length && rest.trim() === '';
}

/**
 * Parse a single fenced code block starting at `start` (which must be a fence
 * opener).  Returns the block and the index of the line *after* the block.
 */
function parseFence(lines: string[], start: number): { code: CodeBlock; next: number } | null {
	const open = FENCE_RE.exec(lines[start] ?? '');
	if (!open) return null;
	const marker = open[2] ?? '```';
	const info = (open[3] ?? '').trim();

	let i = start + 1;
	const body: string[] = [];
	while (i < lines.length && !closesFence(lines[i] ?? '', marker)) {
		body.push(lines[i] ?? '');
		i++;
	}
	const toLine = i < lines.length ? i : lines.length - 1;
	return {
		code: { type: 'code', fromLine: start, toLine, info, code: body.join('\n') },
		next: i + 1,
	};
}

/**
 * Parse the whole document into a flat, ordered list of code blocks and
 * code-group regions.  Plain text between blocks is ignored.
 */
export function parseDoc(text: string): DocBlock[] {
	const lines = text.split('\n');
	const blocks: DocBlock[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? '';
		const trimmed = line.trim();

		// ── code-group ────────────────────────────────────────────────────
		if (GROUP_OPEN_RE.test(trimmed)) {
			const fromLine = i;
			const items: FenceItem[] = [];
			let j = i + 1;
			let closeLine = -1;

			while (j < lines.length) {
				const t = (lines[j] ?? '').trim();
				if (GROUP_CLOSE_RE.test(t)) {
					closeLine = j;
					break;
				}
				if (FENCE_RE.test(lines[j] ?? '')) {
					const parsed = parseFence(lines, j);
					if (!parsed) {
						j++;
						continue;
					}
					items.push({ info: parsed.code.info, code: parsed.code.code });
					j = parsed.next;
					continue;
				}
				j++;
			}

			if (closeLine !== -1) {
				blocks.push({ type: 'group', fromLine, toLine: closeLine, items });
				i = closeLine + 1;
				continue;
			}
			// No closing marker – treat the opener as ordinary text and move on.
			i++;
			continue;
		}

		// ── standalone fenced code block ──────────────────────────────────
		if (FENCE_RE.test(line)) {
			const parsed = parseFence(lines, i);
			if (parsed) {
				blocks.push(parsed.code);
				i = parsed.next;
				continue;
			}
		}

		i++;
	}

	return blocks;
}

/**
 * Is the fenced block whose opening fence is at `fenceLine` located inside a
 * `::: code-group` region (i.e. should it be skipped by the per-block
 * processor and handled by the group processor instead)?
 */
export function isInsideCodeGroup(lines: string[], fenceLine: number): boolean {
	for (let i = fenceLine - 1; i >= 0; i--) {
		const t = (lines[i] ?? '').trim();
		if (GROUP_CLOSE_RE.test(t)) return false; // a container already closed above us
		if (GROUP_OPEN_RE.test(t)) return true; // open code-group above us
		if (t.startsWith(':::') && t !== ':::') return false; // a different container opener
	}
	return false;
}
