// Board behavior: drag and drop between and within columns, a slide-over task
// detail, filtering, and toasts. Every action here has a plain HTML fallback,
// so the board still works with this script switched off.
(() => {
  'use strict';

  const csrf = document.body.dataset.csrf || '';
  const board = document.getElementById('kanban-board');
  const drawer = document.getElementById('task-drawer');
  const drawerBody = document.getElementById('drawer-body');
  const toastHost = document.getElementById('toasts');
  const filterInput = document.getElementById('board-filter');

  let dragged = null;
  let origin = null;
  let highlighted = null;
  let lastCard = null;

  /* ------------------------------------------------------------- toasts - */

  function toast(message, options = {}) {
    if (!toastHost || !message) return;
    const node = document.createElement('div');
    node.className = options.tone ? `toast ${options.tone}` : 'toast';
    const text = document.createElement('span');
    text.textContent = message;
    node.append(text);

    let timer = 0;
    const dismiss = () => {
      window.clearTimeout(timer);
      node.classList.add('leaving');
      window.setTimeout(() => node.remove(), 220);
    };
    if (options.action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = options.action.label;
      button.addEventListener('click', () => {
        dismiss();
        options.action.run();
      });
      node.append(button);
    }
    toastHost.append(node);
    timer = window.setTimeout(dismiss, options.action ? 7000 : 3200);
  }

  /* --------------------------------------------------------- board state - */

  const cardsIn = (list) => Array.from(list.querySelectorAll('.task-card'));

  function findCard(id) {
    return board ? board.querySelector(`.task-card[data-task-id="${CSS.escape(id)}"]`) : null;
  }

  function listFor(status) {
    return board ? board.querySelector(`[data-dropzone][data-status="${CSS.escape(status)}"]`) : null;
  }

  // Cards sit above the column's empty-state message, so every insertion is
  // relative to a following node rather than an append.
  function insertCard(list, card, before) {
    const anchor = before && before.parentElement === list ? before : list.querySelector('.column-empty');
    list.insertBefore(card, anchor);
  }

  function placeInColumn(card, status, index) {
    const list = listFor(status);
    if (!list) return;
    const others = cardsIn(list).filter((item) => item !== card);
    insertCard(list, card, others[index] || null);
  }

  function rememberPlace(card) {
    const list = card.parentElement;
    return { status: list.dataset.status, index: cardsIn(list).indexOf(card) };
  }

  function refresh() {
    if (!board) return;
    applyFilter();
    board.querySelectorAll('.kanban-column').forEach((column) => {
      const list = column.querySelector('[data-dropzone]');
      if (!list) return;
      const visible = cardsIn(list).filter((card) => !card.hidden);
      const count = column.querySelector('.column-count');
      if (count) count.textContent = String(visible.length);
      const empty = list.querySelector('.column-empty');
      if (empty) empty.hidden = visible.length > 0;
    });
  }

  function applyFilter() {
    const query = (filterInput ? filterInput.value : '').trim().toLowerCase();
    document.querySelectorAll('.task-card').forEach((card) => {
      if (!query) {
        card.hidden = false;
        return;
      }
      const title = card.querySelector('.card-title');
      const excerpt = card.querySelector('.card-excerpt');
      const haystack = [
        title ? title.textContent : '',
        excerpt ? excerpt.textContent : '',
        card.dataset.taskId || '',
      ].join(' ').toLowerCase();
      card.hidden = !haystack.includes(query);
    });
  }

  /* --------------------------------------------------------------- moves - */

  async function requestMove(id, status, index) {
    const response = await fetch(`/tasks/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ csrf, status, index: String(index) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'That move did not stick.');
    return payload;
  }

  // swap replaces an optimistically moved card with the server's own markup, so
  // status colors, chips, and move options never drift from the stored task.
  function swap(card, html) {
    const holder = document.createElement('div');
    holder.innerHTML = (html || '').trim();
    const fresh = holder.firstElementChild;
    if (!fresh) {
      card.classList.remove('pending');
      return card;
    }
    card.replaceWith(fresh);
    return fresh;
  }

  async function commitMove(card, from) {
    const id = card.dataset.taskId;
    const list = card.parentElement;
    const status = list.dataset.status;
    const index = cardsIn(list).indexOf(card);
    refresh();
    if (from && from.status === status && from.index === index) return card;

    card.classList.add('pending');
    try {
      const result = await requestMove(id, status, index);
      const fresh = swap(card, result.card);
      fresh.classList.add('settled');
      if (from && from.status !== status) {
        toast(result.message, {
          action: { label: 'Undo', run: () => undoMove(id, from) },
        });
      }
      refresh();
      return fresh;
    } catch (error) {
      card.classList.remove('pending');
      if (from) placeInColumn(card, from.status, from.index);
      toast(error.message, { tone: 'error' });
      refresh();
      return card;
    }
  }

  async function undoMove(id, place) {
    const card = findCard(id);
    if (!card) return;
    card.classList.add('pending');
    try {
      const result = await requestMove(id, place.status, place.index);
      const fresh = swap(card, result.card);
      placeInColumn(fresh, place.status, place.index);
      fresh.classList.add('settled');
    } catch (error) {
      card.classList.remove('pending');
      toast(error.message, { tone: 'error' });
    }
    refresh();
  }

  /* ----------------------------------------------------- drag and drop - */

  function highlight(list) {
    if (highlighted === list) return;
    clearHighlight();
    list.classList.add('drop-active');
    highlighted = list;
  }

  function clearHighlight() {
    if (highlighted) highlighted.classList.remove('drop-active');
    highlighted = null;
  }

  function cardAfterPointer(list, y) {
    return cardsIn(list)
      .filter((card) => card !== dragged)
      .find((card) => {
        const box = card.getBoundingClientRect();
        return y < box.top + box.height / 2;
      }) || null;
  }

  if (board) {
    board.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.task-card');
      if (!card) return;
      dragged = card;
      origin = rememberPlace(card);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.taskId);
      // Deferring the class keeps the browser's drag image opaque.
      window.requestAnimationFrame(() => card.classList.add('dragging'));
    });

    board.addEventListener('dragover', (event) => {
      if (!dragged) return;
      const list = event.target.closest('[data-dropzone]');
      if (!list) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      highlight(list);
      insertCard(list, dragged, cardAfterPointer(list, event.clientY));
    });

    board.addEventListener('drop', (event) => {
      if (!dragged) return;
      event.preventDefault();
      const card = dragged;
      const from = origin;
      dragged = null;
      origin = null;
      card.classList.remove('dragging');
      clearHighlight();
      commitMove(card, from);
    });

    // A drag released outside a column leaves the card where it started.
    board.addEventListener('dragend', () => {
      if (!dragged) return;
      dragged.classList.remove('dragging');
      if (origin) placeInColumn(dragged, origin.status, origin.index);
      dragged = null;
      origin = null;
      clearHighlight();
      refresh();
    });

    board.addEventListener('dragleave', (event) => {
      if (dragged && !event.relatedTarget) clearHighlight();
    });

    // The per-card move menu posts the same form the server handles without
    // JavaScript; intercepting it keeps the board in place.
    board.addEventListener('submit', (event) => {
      const form = event.target;
      if (!form.closest('.card-move')) return;
      const status = event.submitter && event.submitter.value;
      if (!status) return;
      event.preventDefault();
      const card = form.closest('.task-card');
      const menu = form.closest('details');
      if (menu) menu.open = false;
      const from = rememberPlace(card);
      placeInColumn(card, status, 0);
      commitMove(card, from);
    });

    board.addEventListener('keydown', (event) => {
      const card = event.target.closest('.task-card');
      if (!card || event.target !== card) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        lastCard = card;
        openTask(card.dataset.taskId);
        return;
      }
      if (!event.metaKey && !event.ctrlKey) return;
      const lists = Array.from(board.querySelectorAll('[data-dropzone]'));
      const list = card.parentElement;
      const column = lists.indexOf(list);
      const index = cardsIn(list).indexOf(card);
      let target = list;
      let position = index;
      switch (event.key) {
        case 'ArrowLeft':
          target = lists[column - 1] || list;
          position = 0;
          break;
        case 'ArrowRight':
          target = lists[column + 1] || list;
          position = 0;
          break;
        case 'ArrowUp':
          position = Math.max(0, index - 1);
          break;
        case 'ArrowDown':
          position = index + 1;
          break;
        default:
          return;
      }
      if (target === list && position === index) return;
      event.preventDefault();
      const from = rememberPlace(card);
      placeInColumn(card, target.dataset.status, position);
      commitMove(card, from).then((fresh) => fresh && fresh.focus());
    });
  }

  /* --------------------------------------------------------------- detail - */

  async function openTask(id, options = {}) {
    if (!drawer || !drawerBody) return;
    try {
      const response = await fetch(`/${encodeURIComponent(id)}?partial=1`, {
        headers: { 'Accept': 'text/html' },
      });
      if (!response.ok) throw new Error('Could not open that task.');
      drawerBody.innerHTML = await response.text();
    } catch (error) {
      toast(error.message, { tone: 'error' });
      return;
    }
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    if (options.push !== false) history.pushState({ taskId: id }, '', `/${id}`);
    const panel = drawer.querySelector('.drawer-panel');
    if (panel) panel.focus();
  }

  async function reloadDrawer(id) {
    if (!drawer || drawer.hidden) return;
    const response = await fetch(`/${encodeURIComponent(id)}?partial=1`, {
      headers: { 'Accept': 'text/html' },
    });
    if (response.ok) drawerBody.innerHTML = await response.text();
  }

  function closeDrawer(options = {}) {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    drawerBody.innerHTML = '';
    document.body.classList.remove('drawer-open');
    if (options.restoreHistory !== false) {
      if (history.state && history.state.taskId) history.back();
      else history.replaceState({}, '', '/');
    }
    if (lastCard && lastCard.isConnected) lastCard.focus();
  }

  if (board) {
    board.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const card = event.target.closest('.task-card');
      if (!card || event.target.closest('form, details, button')) return;
      event.preventDefault();
      lastCard = card;
      openTask(card.dataset.taskId);
    });
  }

  if (drawer) {
    drawer.addEventListener('click', (event) => {
      if (event.target.closest('[data-drawer-close]')) closeDrawer();
    });

    // Working inside the drawer updates both the panel and the card behind it.
    drawerBody.addEventListener('submit', async (event) => {
      const form = event.target;
      if (!board) return;
      const detail = form.closest('.task-detail');
      if (!detail) return;
      const id = detail.dataset.taskId;

      if (form.classList.contains('upload')) {
        event.preventDefault();
        try {
          const response = await fetch(form.action, {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: new FormData(form),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Could not upload that file.');
          const card = findCard(id);
          if (card) swap(card, payload.card).classList.add('settled');
          await reloadDrawer(id);
          refresh();
          toast(payload.message);
        } catch (error) {
          toast(error.message, { tone: 'error' });
        }
        return;
      }

      if (!form.classList.contains('detail-moves')) return;
      const status = event.submitter && event.submitter.value;
      if (!status) return;
      event.preventDefault();
      try {
        const result = await requestMove(id, status, 0);
        const card = findCard(id);
        if (card) {
          const fresh = swap(card, result.card);
          placeInColumn(fresh, result.status, 0);
          fresh.classList.add('settled');
        }
        refresh();
        await reloadDrawer(id);
        toast(result.message);
      } catch (error) {
        toast(error.message, { tone: 'error' });
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer && !drawer.hidden) {
      event.preventDefault();
      closeDrawer();
    }
  });

  window.addEventListener('popstate', (event) => {
    const id = event.state && event.state.taskId;
    if (id) openTask(id, { push: false });
    else closeDrawer({ restoreHistory: false });
  });

  /* --------------------------------------------------------------- filter - */

  if (filterInput) {
    filterInput.addEventListener('input', refresh);
    filterInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      filterInput.value = '';
      refresh();
    });
  }

  refresh();
})();
