import { App, PluginSettingTab, Setting } from 'obsidian';
import type VitePressMarkdownPlugin from './main';

export class VPSettingTab extends PluginSettingTab {
	plugin: VitePressMarkdownPlugin;

	constructor(app: App, plugin: VitePressMarkdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('默认显示行号')
			.setDesc(
				'开启后所有代码块默认显示行号。单个代码块仍可用 `:no-line-numbers` 关闭或 `:line-numbers` 开启来覆盖此设置。',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lineNumbers)
					.onChange(async (value) => {
						this.plugin.settings.lineNumbers = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
