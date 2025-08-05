import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { Range } from '@codemirror/state';

interface WordMapping {
	shavian: string;
	latin: string;
	dateAdded: Date;
}

interface ShavianPluginSettings {
	autoTranslateEnabled: boolean;
	italiciseTranslations: boolean;
	translationColour: string;
	autoTranslateOnPaste: boolean;
}

interface DictionaryData {
	dictionary?: [string, WordMapping | string][];
	[key: string]: unknown;
}

const DEFAULT_SETTINGS: ShavianPluginSettings = {
	autoTranslateEnabled: true,
	italiciseTranslations: true,
	translationColour: 'var(--text-accent)',
	autoTranslateOnPaste: true
}

declare global {
	interface Window {
		shavianPlugin?: ShavianPlugin;
	}
}

export default class ShavianPlugin extends Plugin {
	private dictionary: Map<string, WordMapping> = new Map();
	private isDefiningWord = false;
	forceRefresh = false;
	settings: ShavianPluginSettings;

	async onload() {
		await this.loadSettings();
		await this.loadDictionary();

		// Set global reference for the view plugin
		window.shavianPlugin = this;

		// Add ribbon icon for dictionary access
		this.addRibbonIcon('book-open', 'View Shavian Dictionary', () => {
			new DictionaryViewModal(this.app, this.dictionary, this).open();
		});

		// Add ribbon icon for toggling auto-translate
		this.addRibbonIcon('languages', 'Toggle auto-translate Shavian to Latin', () => {
			this.toggleAutoTranslate();
		});

		// Command to show dictionary
		this.addCommand({
			id: 'show-dictionary',
			name: 'Show Shavian dictionary',
			callback: () => {
				new DictionaryViewModal(this.app, this.dictionary, this).open();
			}
		});

		// Command to toggle auto-translate
		this.addCommand({
			id: 'toggle-auto-translate',
			name: 'Toggle auto-translate Shavian to Latin',
			callback: () => {
				this.toggleAutoTranslate();
			}
		});

		// Command to translate selected text
		this.addCommand({
			id: 'translate-selected-text',
			name: 'Translate selected text',
			editorCallback: (editor: Editor) => {
				const selection = editor.getSelection();
				if (selection) {
					this.translateSelectedText(editor, selection);
				} else {
					new Notice('No text selected');
				}
			}
		});

		// Add settings tab
		this.addSettingTab(new ShavianSettingTab(this.app, this));

		// Register editor extension for live translation in edit mode
		this.registerEditorExtension([
			this.createShavianViewPlugin()
		]);

		// Register editor change handler for auto-detection
		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === ' ' && !this.isDefiningWord) {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView && activeView.getMode() === 'source') {
					const editor = activeView.editor;
					this.handleSpacePress(editor);
				}
			}
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const selection = editor.getSelection();
				if (selection && this.isShavianScript(selection)) {
					menu.addItem((item) => {
						item
							.setTitle('Add to Shavian Dictionary')
							.setIcon('book-plus')
							.onClick(() => {
								this.addSelectedTextToDictionary(selection);
							});
					});
				}
			})
		);

		// Register paste event listener for auto-translation
		this.registerDomEvent(document, 'paste', (evt: ClipboardEvent) => {
			if (!this.settings.autoTranslateOnPaste) return;
			
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.getMode() === 'source') {
				const editor = activeView.editor;
				
				// Try to handle paste immediately and prevent default
				const clipboardData = evt.clipboardData;
				if (clipboardData) {
					const pastedText = clipboardData.getData('text/plain');
					if (pastedText.trim() && !this.isShavianScript(pastedText)) {
						evt.preventDefault();
						evt.stopPropagation();
						
						// Use setTimeout to ensure the editor is ready
						setTimeout(() => {
							this.handlePasteTranslation(pastedText, editor);
						}, 0);
					}
				}
			}
		}, { capture: true });

		console.log('Shavian plugin loaded');
	}

	onunload() {
		this.saveDictionary();
		console.log('Shavian plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private isShavianScript(text: string): boolean {
		// Check if text contains Shavian Unicode range (U+10450–U+1047F)
		return /[\u{10450}-\u{1047F}]/u.test(text);
	}

	private getPreviousWord(editor: Editor): string {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		
		// Find the last complete word before cursor
		const beforeCursor = line.substring(0, cursor.ch).trim();
		const words = beforeCursor.split(/\s+/);
		
		return words[words.length - 1] || '';
	}

	private handleSpacePress(editor: Editor) {
		const word = this.getPreviousWord(editor);
		
		if (this.isShavianScript(word) && !this.dictionary.has(word)) {
			// Small delay to ensure the space is processed
			setTimeout(() => {
				this.showDefinitionModal(word);
			}, 50);
		}
	}

	private showDefinitionModal(shavianWord: string) {
		this.isDefiningWord = true;
		const modal = new WordDefinitionModal(
			this.app, 
			shavianWord, 
			(latin: string) => {
				this.addWordMapping(shavianWord, latin);
				this.isDefiningWord = false;
				new Notice(`Added: ${shavianWord} → ${latin}`);
			},
			() => {
				this.isDefiningWord = false;
			}
		);
		modal.open();
	}

	private addSelectedTextToDictionary(selectedText: string) {
		const shavianWords = selectedText.match(/·?[\u{10450}-\u{1047F}]+/gu);
		if (shavianWords && shavianWords.length > 0) {
			const firstShavianWord = shavianWords[0];
			this.showDefinitionModal(firstShavianWord);
		}
	}

	private handlePasteTranslation(pastedText: string, editor: Editor) {
		const translatedText = this.translateLatinToShavian(pastedText);

		if (translatedText.translated !== pastedText) {
			// Insert translated text
			editor.replaceSelection(translatedText.translated);

			// Show notification if not all words were translated
			if (translatedText.hasUntranslated) {
				new Notice('Not all words could be translated using your dictionary');
			} else {
				new Notice('Text auto-translated (Latin → Shavian)');
			}
		} else {
			// No translation occurred, insert original text
			editor.replaceSelection(pastedText);
			new Notice('No translatable words found');
		}
	}

	private translateSelectedText(editor: Editor, selectedText: string) {
		const isShavianText = this.isShavianScript(selectedText);
		if (isShavianText) {
			new Notice('Only Latin to Shavian translation is supported');
			return;
		}

		const translatedText = this.translateLatinToShavian(selectedText);

		if (translatedText.translated !== selectedText) {
			editor.replaceSelection(translatedText.translated);

			// Show notification
			if (translatedText.hasUntranslated) {
				new Notice('Not all words could be translated using your dictionary');
			} else {
				new Notice('Text translated (Latin → Shavian)');
			}
		} else {
			new Notice('No translatable words found in selection');
		}
	}

	private translateLatinToShavian(text: string): { translated: string; hasUntranslated: boolean } {
		let hasUntranslated = false;
		
		// Create a reverse mapping from Latin to Shavian
		const reverseMap = new Map<string, string>();
		this.dictionary.forEach((mapping, shavian) => {
			// Store lowercase version
			reverseMap.set(mapping.latin.toLowerCase(), shavian);
		});

		// Split text into words while preserving punctuation and spacing
		const words = text.match(/\b\w+\b|\W+/g) || [];
		const translatedWords = words.map(word => {
			if (/^\w+$/.test(word)) {
				// It's a word, try to translate
				const lowerWord = word.toLowerCase();
				const isCapitalised = /^[A-Z]/.test(word);
				
				if (reverseMap.has(lowerWord)) {
					const shavianWord = reverseMap.get(lowerWord)!;
					// If the original word was capitalised, add interpunct for proper names
					return isCapitalised ? '·' + shavianWord : shavianWord;
				} else {
					hasUntranslated = true;
					return word; // Keep original if not found
				}
			} else {
				// It's punctuation or whitespace, keep as-is
				return word;
			}
		});

		return { translated: translatedWords.join(''), hasUntranslated };
	}

	private addWordMapping(shavian: string, latin: string) {
		const existing = this.dictionary.get(shavian);
		if (existing) {
			existing.latin = latin;
		} else {
			this.dictionary.set(shavian, {
				shavian,
				latin,
				dateAdded: new Date(),
			});
		}
		this.saveDictionary();
	}

	removeWordMapping(shavian: string) {
		this.dictionary.delete(shavian);
		this.saveDictionary();
		new Notice(`Removed: ${shavian}`);
	}

	toggleAutoTranslate() {
		this.settings.autoTranslateEnabled = !this.settings.autoTranslateEnabled;
		this.saveSettings();
		
		const status = this.settings.autoTranslateEnabled ? 'enabled' : 'disabled';
		new Notice(`Auto-translate ${status}`);
		
		this.refreshAllViews();
	}

	refreshAllViews() {
		this.forceRefresh = true;
		// Force refresh of all editor views to update decorations
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view.getViewType() === 'markdown') {
				const markdownView = leaf.view as any;
				if (markdownView.editor && markdownView.editor.cm) {
					const editor = markdownView.editor.cm as EditorView;
					// Force a complete decoration rebuild by simulating a document change
					editor.dispatch({
						changes: { from: 0, to: 0, insert: '' },
						effects: []
					});
				}
			}
		});
		this.forceRefresh = false;
	}

	private createShavianViewPlugin() {
		return ViewPlugin.fromClass(class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				const plugin = window.shavianPlugin;
				if (update.docChanged || update.viewportChanged || update.selectionSet || (plugin && plugin.forceRefresh)) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const decorations: Range<Decoration>[] = [];
				const doc = view.state.doc;
				const cursor = view.state.selection.main.head;

				const plugin = window.shavianPlugin;
				if (!plugin) return Decoration.set([]);

				for (let pos = 0; pos < doc.length;) {
					const line = doc.lineAt(pos);
					const text = line.text;
					
					// Collect all replacements for this line
					const lineDecorations: Range<Decoration>[] = [];
					
					// Replace ‹ and › with quotation marks
					const quotationRegex = /[‹›]/g;
					let quotationMatch;
					
					while ((quotationMatch = quotationRegex.exec(text)) !== null) {
						const quotationChar = quotationMatch[0];
						const charStart = line.from + quotationMatch.index;
						const charEnd = charStart + 1;
						
						// Only replace if cursor is not at this position
						if (cursor !== charStart && cursor !== charEnd) {
							const replacementChar = quotationChar === '‹' ? '"' : '"';
							lineDecorations.push(Decoration.replace({
								widget: new QuotationWidget(replacementChar)
							}).range(charStart, charEnd));
						}
					}
					
					// Find Shavian text in this line, including optional interpunct at front
					const shavianRegex = /·?[\u{10450}-\u{1047F}]+/gu;
					let match;
					
					while ((match = shavianRegex.exec(text)) !== null) {
						const shavianWord = match[0];
						const wordStart = line.from + match.index;
						const wordEnd = wordStart + shavianWord.length;
						
						// Only translate words that are NOT currently being typed
						// (i.e., cursor is not within this word) and if auto-translate is enabled
						if ((cursor < wordStart || cursor > wordEnd) && plugin.settings.autoTranslateEnabled) {
							// Check if the word starts with interpunct (captured by regex) or if there's one before
							const hasInterpunctInMatch = shavianWord.startsWith('·');
							const charBeforeMatch = match.index > 0 ? text[match.index - 1] : '';
							const isName = hasInterpunctInMatch || charBeforeMatch === '·';
							
							// Get the base word (without any leading interpunct from the match)
							const baseWord = shavianWord.replace(/^·/, '');
							
							// Look up the word in dictionary
							const mapping = plugin.dictionary.get(baseWord);
							
							if (mapping) {
								let displayText = mapping.latin;
								
								// If it's a name (preceded by or includes interpunct), capitalise first letter
								if (isName && displayText.length > 0) {
									displayText = displayText.charAt(0).toUpperCase() + displayText.slice(1);
								}
								
								lineDecorations.push(Decoration.replace({
									widget: new LatinWidget(displayText)
								}).range(wordStart, wordEnd));
							}
						}
					}
					
					// Sort decorations by position and add to main array
					lineDecorations.sort((a, b) => a.from - b.from);
					decorations.push(...lineDecorations);
					
					pos = line.to + 1;
				}

				return Decoration.set(decorations);
			}
		}, {
			decorations: v => v.decorations
		});
	}

	private async loadDictionary() {
		try {
			const data = await this.app.vault.adapter.read('shavian-dictionary.json');
			const jsonData = JSON.parse(data) as DictionaryData;
			
			// Handle different formats
			let entries: [string, WordMapping | string][];
			if (jsonData.dictionary && Array.isArray(jsonData.dictionary)) {
				entries = jsonData.dictionary;
			} else if (Array.isArray(jsonData)) {
				entries = jsonData as [string, WordMapping | string][];
			} else {
				entries = Object.entries(jsonData) as [string, WordMapping | string][];
			}
			
			this.dictionary = new Map(entries.map(([key, value]: [string, WordMapping | string]) => {
				if (typeof value === 'string') {
					return [key, {
						shavian: key,
						latin: value,
						dateAdded: new Date(),
					}];
				} else {
					return [key, {
						shavian: key,
						latin: value.latin,
						dateAdded: new Date(value.dateAdded || new Date()),
					}];
				}
			}));
			
			console.log(`Loaded ${this.dictionary.size} Shavian words`);
		} catch (error) {
			console.log('Dictionary not found, starting with empty dictionary');
			this.dictionary = new Map();
		}
	}

	private async saveDictionary() {
		try {
			const entries = Array.from(this.dictionary.entries());
			const exportData = {
				version: "1.0",
				exportDate: new Date().toISOString(),
				wordCount: entries.length,
				dictionary: entries
			};
			
			await this.app.vault.adapter.write(
				'shavian-dictionary.json',
				JSON.stringify(exportData, null, 2)
			);
			
			console.log(`Saved ${entries.length} words`);
		} catch (error) {
			console.error('Failed to save dictionary:', error);
		}
	}
}

class LatinWidget extends WidgetType {
	constructor(private latinText: string) {
		super();
	}

	toDOM() {
		const span = document.createElement('span');
		span.textContent = this.latinText;
		
		const plugin = window.shavianPlugin;
		if (plugin) {
			// Apply colour if specified (empty string means no colour override)
			if (plugin.settings.translationColour) {
				span.style.color = plugin.settings.translationColour;
			}
			
			// Apply italic styling if enabled
			if (plugin.settings.italiciseTranslations) {
				span.style.fontStyle = 'italic';
			}
		}
		
		return span;
	}
}

class QuotationWidget extends WidgetType {
	constructor(private quotationText: string) {
		super();
	}

	toDOM() {
		const span = document.createElement('span');
		span.textContent = this.quotationText;
		return span;
	}
}

class WordDefinitionModal extends Modal {
	private input: HTMLInputElement;

	constructor(
		app: App,
		private shavianWord: string,
		private onDefine: (latin: string) => void,
		private onCancel: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Define Shavian Word' });
		
		const wordDisplay = contentEl.createEl('div', { 
			text: this.shavianWord,
			cls: 'shavian-word-display'
		});
		wordDisplay.style.fontSize = '24px';
		wordDisplay.style.textAlign = 'center';
		wordDisplay.style.margin = '20px 0';
		wordDisplay.style.padding = '10px';
		wordDisplay.style.border = '2px solid var(--interactive-accent)';
		wordDisplay.style.borderRadius = '8px';

		contentEl.createEl('p', { text: 'Enter the Latin equivalent:' });

		this.input = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Latin translation...'
		});
		this.input.style.width = '100%';
		this.input.style.padding = '8px';
		this.input.style.margin = '10px 0';

		const buttonContainer = contentEl.createEl('div');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.marginTop = '20px';

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		const saveBtn = buttonContainer.createEl('button', { text: 'Save' });
		saveBtn.classList.add('mod-cta');

		cancelBtn.onclick = () => {
			this.onCancel();
			this.close();
		};

		saveBtn.onclick = () => {
			const value = this.input.value.trim();
			if (value) {
				this.onDefine(value);
				this.close();
			}
		};

		// Handle Enter key
		this.input.onkeydown = (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				saveBtn.click();
			} else if (evt.key === 'Escape') {
				evt.preventDefault();
				cancelBtn.click();
			}
		};

		this.input.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class DictionaryViewModal extends Modal {
	constructor(
		app: App, 
		private dictionary: Map<string, WordMapping>,
		private plugin: ShavianPlugin
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Shavian Dictionary' });

		if (this.dictionary.size === 0) {
			contentEl.createEl('p', { text: 'No words defined yet. Start typing Shavian words!' });
			return;
		}

		contentEl.createEl('p', { text: `Total words: ${this.dictionary.size}` });

		const table = contentEl.createEl('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const header = table.createEl('thead');
		const headerRow = header.createEl('tr');
		headerRow.createEl('th', { text: 'Shavian' }).style.border = '1px solid var(--background-modifier-border)';
		headerRow.createEl('th', { text: 'Latin' }).style.border = '1px solid var(--background-modifier-border)';
		headerRow.createEl('th', { text: 'Actions' }).style.border = '1px solid var(--background-modifier-border)';

		const tbody = table.createEl('tbody');

		// Sort by latin name alphabetically
		const sortedEntries = Array.from(this.dictionary.entries())
			.sort(([,a], [,b]) => a.latin.localeCompare(b.latin));

		sortedEntries.forEach(([shavian, mapping]) => {
			const row = tbody.createEl('tr');
			const shavianCell = row.createEl('td', { text: shavian });
			const latinCell = row.createEl('td', { text: mapping.latin });
			const actionsCell = row.createEl('td');

			const deleteBtn = actionsCell.createEl('button', { text: '🗑️' });
			deleteBtn.style.background = 'none';
			deleteBtn.style.border = 'none';
			deleteBtn.style.cursor = 'pointer';
			deleteBtn.title = 'Delete this word';

			deleteBtn.onclick = () => {
				this.plugin.removeWordMapping(shavian);
				row.remove();
				
				// Update the total count
				const totalElement = contentEl.querySelector('p');
				if (totalElement) {
					totalElement.textContent = `Total words: ${this.dictionary.size}`;
				}
			};

			[shavianCell, latinCell, actionsCell].forEach(cell => {
				cell.style.border = '1px solid var(--background-modifier-border)';
				cell.style.padding = '8px';
			});

			shavianCell.style.fontSize = '18px';
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ShavianSettingTab extends PluginSettingTab {
	plugin: ShavianPlugin;

	constructor(app: App, plugin: ShavianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Plume Settings'});

		new Setting(containerEl)
			.setName('Auto-translate to Latin')
			.setDesc('Automatically show Latin translations of Shavian words while editing (triggers on typing)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoTranslateEnabled)
				.onChange(async (value) => {
					this.plugin.settings.autoTranslateEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.refreshAllViews();
				}));

		new Setting(containerEl)
			.setName('Italicise translations')
			.setDesc('Display Latin translations in italic font style')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.italiciseTranslations)
				.onChange(async (value) => {
					this.plugin.settings.italiciseTranslations = value;
					await this.plugin.saveSettings();
					this.plugin.refreshAllViews();
				}));

		new Setting(containerEl)
			.setName('Translation colour')
			.setDesc('Colour for Latin translations. Use CSS colour values (e.g., "#ff0000", "red", "var(--text-accent)"). Leave empty for default text colour.')
			.addText(text => text
				.setPlaceholder('var(--text-accent)')
				.setValue(this.plugin.settings.translationColour)
				.onChange(async (value) => {
					this.plugin.settings.translationColour = value.trim();
					await this.plugin.saveSettings();
					this.plugin.refreshAllViews();
				}));

		new Setting(containerEl)
			.setName('Auto-translate on paste')
			.setDesc('Automatically translate pasted Latin text to Shavian using your dictionary.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoTranslateOnPaste)
				.onChange(async (value) => {
					this.plugin.settings.autoTranslateOnPaste = value;
					await this.plugin.saveSettings();
				}));
	}
}