## Plume

Plume is an Obsidian plugin that provides seamless support for the Shavian alphabet (Shaw script). It helps you write in Shavian while building your vocabulary through live translation and smart dictionary management.

**Note**: Plume doesn't ship with any pre-built dictionaries because Shavian is a phonemic script - your spelling will depend on your accent and pronunciation. You'll build your own personalised dictionary as you write, which reflects how *you* pronounce English words.

## Features

### 🖋️ Smart Writing Experience
- Type in Shavian script naturally
- See Latin translations of previously defined words as you write
- Continue seeing the Shavian word you're currently typing

### 📚 On-the-fly Learning
- Automatic popup when you type an unknown Shavian word
- Quick definition modal - just press space after a new word
- Build your personal dictionary as you write

### 👁️ Clean Preview
- Preview mode shows pure Shavian text
- No translations or modifications in reading view
- Perfect for sharing or final document review

### 📖 Dictionary Management
- View all your defined words in an organized table
- See usage frequency for each word
- Delete words you no longer need
- Automatic saving to your vault

## How It Works

1. **Write**: Type Shavian words in edit mode
2. **Define**: Press space after unknown words to define them
3. **See**: Previously defined words appear as Latin translations while typing
4. **Preview**: Switch to preview mode to see clean Shavian text

## Installation

### From Obsidian Community Plugins (coming soon)
1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click "Browse" and search for "Plume"
4. Install and enable the plugin

### Manual Installation
1. Download the latest release
2. Extract to `<vault>/.obsidian/plugins/plume/`
3. Reload Obsidian and enable the plugin

## Usage

### Basic Writing
1. Create or open a note
2. Type Shavian characters using your preferred input method
3. When you type a new Shavian word and press space, a modal will appear asking for the English translation
4. Define the word and continue writing
5. Previously defined words will appear in italic Latin text while you type

### Dictionary Management
- Click the book icon (📖) in the ribbon to view your dictionary
- Use the command palette (Ctrl/Cmd+P) and search for "Show Shavian dictionary"
- In the dictionary view, click the trash icon (🗑️) to delete unwanted words

### Preview Mode
- Switch to preview mode to see your document in pure Shavian script
- Perfect for final review or sharing with other Shavian readers

## Dictionary Storage

Your dictionary is automatically saved as `shavian-dictionary.json` in your vault root. This file contains:
- All your Shavian → Latin word mappings
- Usage frequency for each word
- Metadata about your dictionary

The dictionary file is portable and can be backed up or shared with other Plume users.

## Shavian Script Support

Plume works with any Shavian text in the Unicode range U+10450–U+1047F. You can input Shavian characters using:
- [Shavian keyboard layouts](https://www.shavian.info/keyboard/)
- Character picker tools
- Copy-paste from other Shavian sources

## About Shavian

The Shavian alphabet is an alternative writing system for English, designed by George Bernard Shaw to be more phonetic and efficient than traditional Latin script. Learn more at [shavian.info](https://www.shavian.info/).

---

*Plume - where Shavian script meets modern writing tools* ✨