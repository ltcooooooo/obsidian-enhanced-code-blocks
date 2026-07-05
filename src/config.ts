/**
 * Plugin settings + a live, module-global mirror of them.
 *
 * `parseInfo` (and therefore both the reading-mode and live-preview renderers)
 * reads `vpConfig` for defaults that aren't encoded in a fence's info string —
 * currently just the global "line numbers on by default" toggle, matching
 * VitePress's `markdown.lineNumbers` config option.
 */

export interface VPSettings {
	/** Show line numbers on every code block unless `:no-line-numbers` is set. */
	lineNumbers: boolean;
}

export const DEFAULT_SETTINGS: VPSettings = {
	lineNumbers: false,
};

/** Live mirror of the saved settings, kept up to date by the plugin. */
export const vpConfig: VPSettings = { ...DEFAULT_SETTINGS };
