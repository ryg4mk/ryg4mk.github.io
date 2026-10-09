const API_BASE = 'https://countapi.mileshilliard.com/api/v1';
const LIKE_KEY_SUFFIX = 'bkg_otg_20261008_v1';
const VIEW_KEY_SUFFIX = 'bkg_otg_views_20261008_v2';
const isPublished = location.hostname === 'ryg4mk.github.io' &&
  location.pathname.startsWith('/one-take-game/');

function counterKey(gameId, type) {
  const suffix = type === 'views' ? VIEW_KEY_SUFFIX : LIKE_KEY_SUFFIX;
  return `one_take_${gameId}_${type}_${suffix}`;
}

function readStored(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function writeStored(storage, key, value) {
  try { storage.setItem(key, value); } catch {}
}

function parseCount(data) {
  const raw = data?.value;
  const value = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw)
      ? Number(raw)
      : NaN;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function requestCounter(action, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${API_BASE}/${action}/${encodeURIComponent(key)}`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal
    });

    if (response.status === 404 && action === 'get') return 0;
    if (!response.ok) return null;

    const data = await response.json();
    return parseCount(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function renderCount(element, value) {
  if (value === null) return;
  element.textContent = value.toLocaleString('ja-JP');
}

async function loadLike(card) {
  const gameId = card.dataset.gameId;
  const countEl = card.querySelector('[data-like-count]');
  const button = card.querySelector('[data-like-button]');
  if (!gameId || !countEl || !button) return;

  const likedKey = `otg-liked-${gameId}`;
  const liked = readStored(localStorage, likedKey) === '1';

  if (liked) {
    button.classList.add('is-liked');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'いいね済み');
  }

  renderCount(countEl, await requestCounter('get', counterKey(gameId, 'likes')));

  button.addEventListener('click', async () => {
    if (readStored(localStorage, likedKey) === '1') {
      button.classList.add('is-liked');
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', 'いいね済み');
      return;
    }

    const currentText = countEl.textContent.replace(/,/g, '');
    const currentCount = /^\d+$/.test(currentText) ? Number(currentText) : 0;

    // React immediately on mobile even when the public counter API is slow or blocked.
    writeStored(localStorage, likedKey, '1');
    button.classList.add('is-liked');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'いいね済み');
    renderCount(countEl, currentCount + 1);

    if (!isPublished) return;

    const value = await requestCounter('hit', counterKey(gameId, 'likes'));
    if (value !== null) {
      renderCount(countEl, value);
    }
  });
}

async function loadViews(cards) {
  await Promise.all(cards.map(async (card) => {
    const gameId = card.dataset.gameId;
    const countEl = card.querySelector('[data-view-count]');
    if (!gameId || !countEl) return;

    const value = await requestCounter('get', counterKey(gameId, 'views'));
    renderCount(countEl, value ?? 0);
  }));
}

const cards = [...document.querySelectorAll('.otg-game-card[data-game-id]')];
cards.forEach((card) => void loadLike(card));
void loadViews(cards);

window.addEventListener('pageshow', () => {
  void loadViews(cards);
});
