import { App, Editor, MarkdownView, Modal, Notice, Plugin } from 'obsidian';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { Range } from '@codemirror/state';

interface WordMapping {
	shavian: string;
	latin: string;
	dateAdded: Date;
	frequency: number;
}

export default class ShavianPlugin extends Plugin {
	private dictionary: Map<string, WordMapping> = new Map();
	private isDefiningWord = false;

	async onload() {
		await this.loadDictionary();

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

		console.log('Shavian plugin loaded');
	}

	onunload() {
		this.saveDictionary();
		console.log('Shavian plugin unloaded');
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

	private addWordMapping(shavian: string, latin: string) {
		const existing = this.dictionary.get(shavian);
		if (existing) {
			existing.frequency++;
			existing.latin = latin;
		} else {
			this.dictionary.set(shavian, {
				shavian,
				latin,
				dateAdded: new Date(),
				frequency: 1
			});
		}
		this.saveDictionary();
	}

	private createShavianViewPlugin() {
		const plugin = this;
		return ViewPlugin.fromClass(class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const decorations: Range<Decoration>[] = [];
				const doc = view.state.doc;
				const cursor = view.state.selection.main.head;

				for (let pos = 0; pos < doc.length;) {
					const line = doc.lineAt(pos);
					const text = line.text;
					
					// Find Shavian text in this line
					const shavianRegex = /[\u{10450}-\u{1047F}]+/gu;
					let match;
					
					while ((match = shavianRegex.exec(text)) !== null) {
						const shavianWord = match[0];
						const wordStart = line.from + match.index;
						const wordEnd = wordStart + shavianWord.length;
						
						// Only translate words that are NOT currently being typed
						// (i.e., cursor is not within this word)
						if (cursor < wordStart || cursor > wordEnd) {
							const mapping = plugin.dictionary.get(shavianWord);
							
							if (mapping) {
								decorations.push(Decoration.replace({
									widget: new LatinWidget(mapping.latin)
								}).range(wordStart, wordEnd));
							}
						}
					}
					
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
			const jsonData = JSON.parse(data);
			
			// Handle different formats
			let entries: [string, any][];
			if (jsonData.dictionary && Array.isArray(jsonData.dictionary)) {
				entries = jsonData.dictionary;
			} else if (Array.isArray(jsonData)) {
				entries = jsonData;
			} else {
				entries = Object.entries(jsonData);
			}
			
			this.dictionary = new Map(entries.map(([key, value]: [string, any]) => {
				if (typeof value === 'string') {
					return [key, {
						shavian: key,
						latin: value,
						dateAdded: new Date(),
						frequency: 1
					}];
				} else {
					return [key, {
						shavian: key,
						latin: value.latin,
						dateAdded: new Date(value.dateAdded || new Date()),
						frequency: value.frequency || 1
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
		span.style.color = 'var(--text-accent)';
		span.style.fontStyle = 'italic';
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

		contentEl.createEl('p', { text: 'Enter the English equivalent:' });

		this.input = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'English translation...'
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