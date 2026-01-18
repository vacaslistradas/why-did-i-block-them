# Why Did I Block Them?

A Chrome extension that helps you remember why you blocked someone on Twitter/X.

## Features

- **Capture block reasons** - When you block someone, a popup asks why
- **Save the tweet** - Automatically captures the tweet that triggered the block (when blocking from timeline)
- **Categories** - Choose from preset categories (Political, Annoying, Misinformation, etc.) or create your own
- **View reasons** - See a banner on blocked users' profiles and tweets reminding you why
- **Search & manage** - Browse, search, and manage your block list from the extension popup
- **View original tweet** - Link back to the tweet that caused the block (if still available)
- **Customizable categories** - Add, edit, or delete categories in Settings

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension folder
6. The extension should now appear in your toolbar

## Usage

1. Go to Twitter/X
2. Block someone (from a tweet or their profile)
3. A popup will appear asking for the reason
4. Select a category and/or add details
5. Click Save (or Skip to dismiss)

To view your block list, click the extension icon in the toolbar.

## Data Storage

All data is stored locally in your browser using Chrome's storage API. Nothing is sent to any server.

## Notes

- Twitter's UI changes frequently, so block detection might need updates over time
- Tweet capture only works when blocking from a tweet's menu (not from profile pages)
