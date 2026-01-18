// Twitter Block Reasons - Content Script

const DEBUG = false;
function log(...args) {
  if (DEBUG) console.log('[BlockReasons]', ...args);
}

const DEFAULT_CATEGORIES = [
  { id: 'political', label: 'Political' },
  { id: 'annoying', label: 'Annoying' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'creepy', label: 'Creepy' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'trolling', label: 'Trolling' },
  { id: 'other', label: 'Other' }
];

let CATEGORIES = [...DEFAULT_CATEGORIES];
let currentBlockTarget = null;

// Load categories from storage
function loadCategories() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['categories'], (result) => {
      if (result.categories && result.categories.length > 0) {
        CATEGORIES = result.categories;
      } else {
        // Initialize with defaults
        chrome.storage.local.set({ categories: DEFAULT_CATEGORIES });
        CATEGORIES = [...DEFAULT_CATEGORIES];
      }
      log('Categories loaded:', CATEGORIES);
      resolve(CATEGORIES);
    });
  });
}
let pendingTweetData = null; // Stores tweet info when menu is opened

// Watch for tweet menu clicks to capture tweet content
function watchForTweetMenus() {
  log('Starting tweet menu watcher');

  document.addEventListener('click', (e) => {
    // Check if clicking on a tweet's "more" button (the ... menu)
    // Try multiple possible selectors
    const moreButton = e.target.closest('[data-testid="caret"]') ||
                       e.target.closest('[aria-label="More"]') ||
                       e.target.closest('button[aria-haspopup="menu"]');

    if (moreButton) {
      // Find the parent tweet article
      const tweet = moreButton.closest('article[data-testid="tweet"]') ||
                    moreButton.closest('article');
      if (tweet) {
        const tweetData = extractTweetData(tweet);
        log('Captured tweet data:', tweetData);
        if (tweetData && tweetData.text) {
          pendingTweetData = tweetData;
          // Clear after 30 seconds if not used
          setTimeout(() => {
            if (pendingTweetData === tweetData) {
              pendingTweetData = null;
            }
          }, 30000);
        }
      }
    }
  }, { capture: true });
}

// Extract tweet text and author from a tweet element
function extractTweetData(tweetElement) {
  try {
    // Get tweet text
    const tweetTextEl = tweetElement.querySelector('[data-testid="tweetText"]');
    const tweetText = tweetTextEl ? tweetTextEl.textContent : '';

    // Get tweet URL from the timestamp link
    let tweetUrl = '';
    const timeLink = tweetElement.querySelector('a[href*="/status/"] time')?.closest('a') ||
                     tweetElement.querySelector('a[href*="/status/"]');
    if (timeLink) {
      tweetUrl = timeLink.href;
    }

    // Get author username - try multiple methods
    let authorUsername = '';

    // Method 1: Look for the User-Name element which contains @username
    const userNameEl = tweetElement.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      const usernameMatch = userNameEl.textContent.match(/@(\w+)/);
      if (usernameMatch) {
        authorUsername = usernameMatch[1];
      }
    }

    // Method 2: Look for links to user profile
    if (!authorUsername) {
      const userLinks = tweetElement.querySelectorAll('a[href^="/"]');
      for (const link of userLinks) {
        const match = link.href.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)(?:\/|$|\?)/);
        if (match && !['home', 'explore', 'search', 'notifications', 'messages', 'i'].includes(match[1].toLowerCase())) {
          authorUsername = match[1];
          break;
        }
      }
    }

    // Get author display name
    const displayNameEl = tweetElement.querySelector('[data-testid="User-Name"]');
    const displayName = displayNameEl ? displayNameEl.textContent.split('@')[0].trim() : '';

    // Check for media
    const media = [];
    const images = tweetElement.querySelectorAll('[data-testid="tweetPhoto"]');
    if (images.length > 0) {
      media.push(`${images.length} image${images.length > 1 ? 's' : ''}`);
    }
    const video = tweetElement.querySelector('[data-testid="videoPlayer"]');
    if (video) {
      media.push('video');
    }
    const gif = tweetElement.querySelector('[data-testid="gifPlayer"]');
    if (gif) {
      media.push('GIF');
    }

    return {
      text: tweetText,
      url: tweetUrl,
      media: media.length > 0 ? media.join(', ') : null,
      authorUsername: authorUsername,
      authorDisplayName: displayName,
      capturedAt: new Date().toISOString()
    };
  } catch (err) {
    log('Error extracting tweet data:', err);
    return null;
  }
}

// Watch for Twitter's block confirmation dialog
function watchForBlockDialog() {
  log('Starting block dialog watcher');
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for the block confirmation dialog
          const blockButton = node.querySelector('[data-testid="confirmationSheetConfirm"]');
          if (blockButton) {
            log('Found confirmation button, checking if block dialog...');
            if (isBlockDialog(node)) {
              log('Block dialog detected!');
              setupBlockInterception(blockButton, node);
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Check if this is actually a block dialog (not mute, etc.)
function isBlockDialog(dialogNode) {
  const text = dialogNode.textContent.toLowerCase();
  return text.includes('block') && !text.includes('unblock');
}

// Extract username from the dialog
function extractUsername(dialogNode) {
  const text = dialogNode.textContent;
  const match = text.match(/@(\w+)/);
  return match ? match[1] : null;
}

// Set up interception of the block button
function setupBlockInterception(blockButton, dialogNode) {
  // Prevent handling the same dialog multiple times
  if (dialogNode.dataset.tbrHandled) {
    log('Dialog already handled, skipping');
    return;
  }
  dialogNode.dataset.tbrHandled = 'true';

  const username = extractUsername(dialogNode);
  log('Extracted username:', username);
  if (!username) {
    log('No username found, aborting');
    return;
  }

  currentBlockTarget = username;
  let blockClicked = false;

  // Track if the Block button was clicked (non-invasive, doesn't prevent default)
  blockButton.addEventListener('click', () => {
    blockClicked = true;
    log('Block button was clicked');
  }, { capture: true });

  // Watch for the dialog to be removed
  const dialogObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === dialogNode || node.contains?.(dialogNode)) {
          dialogObserver.disconnect();
          // Only show modal if Block was clicked (not Cancel)
          if (blockClicked) {
            log('Block confirmed, showing reason modal');
            setTimeout(() => {
              showReasonModal(username);
            }, 300);
          } else {
            log('Dialog closed without blocking (cancelled)');
          }
          return;
        }
      }
    }
  });

  dialogObserver.observe(document.body, { childList: true, subtree: true });
  log('Watching for dialog close...');
}

// Show the modal to capture block reason
function showReasonModal(username) {
  // Remove existing modal if any
  const existing = document.getElementById('tbr-modal-overlay');
  if (existing) existing.remove();

  // Check if we have a captured tweet for this user
  log('Checking for tweet match:', {
    pendingTweetData,
    blockedUsername: username,
    tweetAuthor: pendingTweetData?.authorUsername
  });

  const tweetData = pendingTweetData &&
    pendingTweetData.authorUsername?.toLowerCase() === username.toLowerCase()
    ? pendingTweetData : null;

  if (!tweetData && pendingTweetData) {
    log('Tweet author mismatch - using tweet anyway');
    // If we have pending tweet data but username doesn't match,
    // still use it (might be a retweet or quote tweet situation)
  }

  // Use the tweet data even if username doesn't perfectly match
  const actualTweetData = tweetData || pendingTweetData;

  const tweetPreview = actualTweetData && (actualTweetData.text || actualTweetData.media) ? `
    <div class="tbr-tweet-preview">
      <div class="tbr-tweet-label">Tweet that triggered block:</div>
      ${actualTweetData.text ? `<div class="tbr-tweet-text">${escapeHtml(actualTweetData.text)}</div>` : ''}
      ${actualTweetData.media ? `<div class="tbr-tweet-media">Contains: ${actualTweetData.media}</div>` : ''}
    </div>
  ` : '';

  const overlay = document.createElement('div');
  overlay.id = 'tbr-modal-overlay';
  overlay.innerHTML = `
    <div class="tbr-modal">
      <div class="tbr-modal-header">
        <h2>Why did you block @${username}?</h2>
        <button class="tbr-close-btn">&times;</button>
      </div>
      <div class="tbr-modal-body">
        ${tweetPreview}
        <div class="tbr-categories">
          ${CATEGORIES.map(cat => `
            <label class="tbr-category">
              <input type="radio" name="tbr-category" value="${cat.id}">
              <span>${cat.label}</span>
            </label>
          `).join('')}
        </div>
        <textarea
          class="tbr-reason-input"
          placeholder="Add details (optional)..."
          rows="3"
        ></textarea>
      </div>
      <div class="tbr-modal-footer">
        <button class="tbr-skip-btn">Skip</button>
        <button class="tbr-save-btn">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  overlay.querySelector('.tbr-close-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.tbr-skip-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.tbr-save-btn').addEventListener('click', () => {
    try {
      const category = overlay.querySelector('input[name="tbr-category"]:checked')?.value;
      const reason = overlay.querySelector('.tbr-reason-input').value.trim();
      log('Saving block reason:', { username, category, reason, actualTweetData });

      if (category || reason || actualTweetData) {
        saveBlockReason(username, category, reason, actualTweetData);
      }
    } catch (err) {
      console.error('[BlockReasons] Error saving:', err);
    }
    pendingTweetData = null; // Clear after use
    overlay.remove();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Save block reason to storage
function saveBlockReason(username, category, reason, tweetData) {
  chrome.storage.local.get(['blocks'], (result) => {
    const blocks = result.blocks || {};
    const blockData = {
      username: username,
      category: category || null,
      reason: reason || '',
      tweet: tweetData ? tweetData.text : null,
      tweetUrl: tweetData ? tweetData.url : null,
      tweetMedia: tweetData ? tweetData.media : null,
      tweetArchiveUrl: null,
      date: new Date().toISOString()
    };
    blocks[username.toLowerCase()] = blockData;
    chrome.storage.local.set({ blocks });
    log('Block saved:', blockData);

    // Archive the tweet in the background
    if (tweetData && tweetData.url) {
      archiveTweet(username.toLowerCase(), tweetData.url);
    }
  });
}

// Archive tweet to the Wayback Machine
async function archiveTweet(usernameKey, tweetUrl) {
  try {
    log('Archiving tweet:', tweetUrl);
    const response = await fetch(`https://web.archive.org/save/${tweetUrl}`, {
      method: 'GET',
      mode: 'no-cors' // Wayback Machine doesn't support CORS, but the save still works
    });

    // Since we can't read the response due to no-cors, construct the archive URL
    // The archive URL format is: https://web.archive.org/web/<timestamp>/<url>
    // We'll use a generic "latest" format that redirects to the most recent snapshot
    const archiveUrl = `https://web.archive.org/web/${tweetUrl}`;

    // Update the stored block with the archive URL
    chrome.storage.local.get(['blocks'], (result) => {
      const blocks = result.blocks || {};
      if (blocks[usernameKey]) {
        blocks[usernameKey].tweetArchiveUrl = archiveUrl;
        chrome.storage.local.set({ blocks });
        log('Archive URL saved:', archiveUrl);
      }
    });
  } catch (err) {
    log('Failed to archive tweet:', err);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Check if viewing a blocked user's profile or tweet and show reason
function checkForBlockedProfile() {
  const pathname = window.location.pathname;
  log('Checking page, pathname:', pathname);

  // Match profile pages (/username) or tweet pages (/username/status/123)
  const profileMatch = pathname.match(/^\/([^\/]+)\/?$/);
  const tweetMatch = pathname.match(/^\/([^\/]+)\/status\/\d+/);

  const match = profileMatch || tweetMatch;
  if (!match) {
    log('Not a profile or tweet page');
    return;
  }

  const username = match[1].toLowerCase();
  log('Page username:', username);

  // Skip non-profile pages
  if (['home', 'explore', 'search', 'messages', 'notifications', 'settings', 'i'].includes(username)) {
    log('Skipping non-profile page');
    return;
  }

  chrome.storage.local.get(['blocks'], (result) => {
    const blocks = result.blocks || {};
    log('Looking for block info, blocks:', Object.keys(blocks));
    const blockInfo = blocks[username];

    if (blockInfo) {
      log('Found block info:', blockInfo);
      showBlockReasonBanner(blockInfo);
    } else {
      log('No block info for', username);
      // Remove banner if exists
      const existing = document.getElementById('tbr-banner');
      if (existing) existing.remove();
    }
  });
}

// Show banner with block reason on profile
function showBlockReasonBanner(blockInfo) {
  log('Showing banner for:', blockInfo);

  try {
    // Remove existing banner
    const existing = document.getElementById('tbr-banner');
    if (existing) existing.remove();

    const categoryLabel = CATEGORIES.find(c => c.id === blockInfo.category)?.label || '';
    const dateStr = new Date(blockInfo.date).toLocaleDateString();

  const banner = document.createElement('div');
  banner.id = 'tbr-banner';

  const tweetContent = blockInfo.tweet || blockInfo.tweetMedia
    ? `<div class="tbr-banner-tweet-container">
        ${blockInfo.tweet ? `<p class="tbr-banner-tweet">"${escapeHtml(blockInfo.tweet)}"</p>` : ''}
        ${blockInfo.tweetMedia ? `<span class="tbr-banner-media">Contains: ${blockInfo.tweetMedia}</span>` : ''}
        <div class="tbr-banner-links">
          ${blockInfo.tweetUrl ? `<a href="${blockInfo.tweetUrl}" target="_blank" class="tbr-banner-link">View tweet</a>` : ''}
          ${blockInfo.tweetArchiveUrl ? `<a href="${blockInfo.tweetArchiveUrl}" target="_blank" class="tbr-banner-link">View archived</a>` : ''}
        </div>
      </div>`
    : '';

  banner.innerHTML = `
    <div class="tbr-banner-content">
      <div class="tbr-banner-header">
        <strong>You blocked @${blockInfo.username}</strong>
        ${categoryLabel ? `<span class="tbr-banner-category">${categoryLabel}</span>` : ''}
        <span class="tbr-banner-date">on ${dateStr}</span>
      </div>
      ${tweetContent}
      ${blockInfo.reason ? `<p class="tbr-banner-reason">${escapeHtml(blockInfo.reason)}</p>` : ''}
    </div>
    <button class="tbr-banner-close">&times;</button>
  `;

  banner.querySelector('.tbr-banner-close').addEventListener('click', () => banner.remove());

  // Insert at the top of the primary column
  const tryInsert = () => {
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (primaryColumn) {
      // Insert as the first child of primaryColumn
      primaryColumn.insertBefore(banner, primaryColumn.firstChild);
      log('Banner inserted at top of primary column');
      return true;
    }
    return false;
  };

  // Retry a few times in case DOM isn't ready
  if (!tryInsert()) {
    let attempts = 0;
    const retryInterval = setInterval(() => {
      attempts++;
      if (tryInsert() || attempts >= 10) {
        clearInterval(retryInterval);
        if (attempts >= 10) {
          log('Failed to insert banner after 10 attempts');
        }
      }
    }, 200);
  }
  } catch (err) {
    console.error('[BlockReasons] Error showing banner:', err);
  }
}

// Watch for navigation changes (Twitter is an SPA)
function watchForNavigation() {
  let lastPath = window.location.pathname;

  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      setTimeout(checkForBlockedProfile, 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Initialize
async function init() {
  await loadCategories();
  watchForTweetMenus();
  watchForBlockDialog();
  watchForNavigation();
  checkForBlockedProfile();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
