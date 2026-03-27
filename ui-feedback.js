/**
 * ui-feedback.js
 * Global UI feedback system for loading states, errors, and notifications
 */

// ============================
// LOADING OVERLAY
// ============================

const LoadingOverlay = {
  element: null,

  init() {
    if (this.element) return;

    this.element = document.createElement('div');
    this.element.id = 'loadingOverlay';
    this.element.className = 'loading-overlay hidden';
    this.element.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-message">Loading...</div>
        <div class="loading-details"></div>
      </div>
    `;
    document.body.appendChild(this.element);
  },

  show(message = 'Loading...', details = '') {
    this.init();
    const messageEl = this.element.querySelector('.loading-message');
    const detailsEl = this.element.querySelector('.loading-details');

    if (messageEl) messageEl.textContent = message;
    if (detailsEl) detailsEl.textContent = details;

    this.element.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  updateMessage(message, details = '') {
    if (!this.element) return;
    const messageEl = this.element.querySelector('.loading-message');
    const detailsEl = this.element.querySelector('.loading-details');

    if (messageEl) messageEl.textContent = message;
    if (detailsEl) detailsEl.textContent = details;
  },

  hide() {
    if (!this.element) return;
    this.element.classList.add('hidden');
    document.body.style.overflow = '';
  }
};

// ============================
// ERROR/SUCCESS MODAL
// ============================

const MessageModal = {
  element: null,

  init() {
    if (this.element) return;

    this.element = document.createElement('div');
    this.element.id = 'messageModal';
    this.element.className = 'modal';
    this.element.innerHTML = `
      <div class="modal-content message-modal-content">
        <div class="message-modal-header">
          <div class="message-modal-icon"></div>
          <h2 class="message-modal-title"></h2>
          <button class="close" onclick="MessageModal.hide()">&times;</button>
        </div>
        <div class="message-modal-body">
          <p class="message-modal-text"></p>
          <div class="message-modal-details hidden">
            <button class="message-details-toggle" onclick="MessageModal.toggleDetails()">
              Show Details ▼
            </button>
            <pre class="message-details-content"></pre>
          </div>
        </div>
        <div class="message-modal-actions"></div>
      </div>
    `;
    document.body.appendChild(this.element);

    // Close on outside click
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.hide();
      }
    });
  },

  show(options = {}) {
    this.init();

    const {
      type = 'info', // 'success', 'error', 'warning', 'info'
      title = 'Message',
      message = '',
      details = null,
      actions = []
    } = options;

    // Set type class
    const content = this.element.querySelector('.message-modal-content');
    content.className = `modal-content message-modal-content message-modal-${type}`;

    // Set icon
    const iconEl = this.element.querySelector('.message-modal-icon');
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };
    iconEl.textContent = icons[type] || icons.info;

    // Set title and message
    this.element.querySelector('.message-modal-title').textContent = title;
    this.element.querySelector('.message-modal-text').textContent = message;

    // Set details
    const detailsEl = this.element.querySelector('.message-modal-details');
    const detailsContent = this.element.querySelector('.message-details-content');
    if (details) {
      detailsContent.textContent = typeof details === 'object' ? JSON.stringify(details, null, 2) : details;
      detailsEl.classList.remove('hidden');
      detailsContent.classList.add('hidden');
    } else {
      detailsEl.classList.add('hidden');
    }

    // Set actions
    const actionsEl = this.element.querySelector('.message-modal-actions');
    actionsEl.innerHTML = '';

    if (actions.length === 0) {
      // Default "OK" button
      actions.push({
        label: 'OK',
        onClick: () => this.hide(),
        primary: true
      });
    }

    actions.forEach(action => {
      const button = document.createElement('button');
      button.textContent = action.label;
      button.className = action.primary ? 'primary-button' : 'secondary-button';
      button.onclick = () => {
        if (action.onClick) action.onClick();
        if (action.closeOnClick !== false) this.hide();
      };
      actionsEl.appendChild(button);
    });

    this.element.style.display = 'block';
  },

  hide() {
    if (!this.element) return;
    this.element.style.display = 'none';
  },

  toggleDetails() {
    const detailsContent = this.element.querySelector('.message-details-content');
    const toggle = this.element.querySelector('.message-details-toggle');

    if (detailsContent.classList.contains('hidden')) {
      detailsContent.classList.remove('hidden');
      toggle.textContent = 'Hide Details ▲';
    } else {
      detailsContent.classList.add('hidden');
      toggle.textContent = 'Show Details ▼';
    }
  },

  // Convenience methods
  success(title, message, options = {}) {
    this.show({ type: 'success', title, message, ...options });
  },

  error(title, message, options = {}) {
    this.show({ type: 'error', title, message, ...options });
  },

  warning(title, message, options = {}) {
    this.show({ type: 'warning', title, message, ...options });
  },

  info(title, message, options = {}) {
    this.show({ type: 'info', title, message, ...options });
  }
};

// ============================
// TOAST NOTIFICATIONS
// ============================

const Toast = {
  container: null,
  toasts: [],

  init() {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'toastContainer';
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(options = {}) {
    this.init();

    const {
      type = 'info', // 'success', 'error', 'warning', 'info'
      message = '',
      duration = 4000,
      dismissible = true
    } = options;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-enter`;

    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-message">${message}</div>
      ${dismissible ? '<button class="toast-close" onclick="Toast.dismiss(this)">&times;</button>' : ''}
    `;

    this.container.appendChild(toast);
    this.toasts.push(toast);

    // Trigger animation
    setTimeout(() => toast.classList.remove('toast-enter'), 10);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  },

  dismiss(toastOrButton) {
    const toast = toastOrButton.classList?.contains('toast')
      ? toastOrButton
      : toastOrButton.closest('.toast');

    if (!toast) return;

    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.toasts = this.toasts.filter(t => t !== toast);
    }, 300);
  },

  // Convenience methods
  success(message, duration = 4000) {
    return this.show({ type: 'success', message, duration });
  },

  error(message, duration = 6000) {
    return this.show({ type: 'error', message, duration });
  },

  warning(message, duration = 5000) {
    return this.show({ type: 'warning', message, duration });
  },

  info(message, duration = 4000) {
    return this.show({ type: 'info', message, duration });
  }
};

// ============================
// INLINE LOADING STATES
// ============================

const InlineLoader = {
  show(element, size = 'small') {
    if (!element) return;

    const loader = document.createElement('span');
    loader.className = `inline-loader inline-loader-${size}`;
    loader.innerHTML = '<span class="inline-spinner"></span>';

    element.appendChild(loader);
    return loader;
  },

  hide(loader) {
    if (loader && loader.parentNode) {
      loader.parentNode.removeChild(loader);
    }
  },

  // Show loader next to button
  showButton(button) {
    if (!button) return;

    const loader = this.show(button, 'small');
    button.disabled = true;
    button.dataset.originalText = button.textContent;

    return loader;
  },

  hideButton(button, loader) {
    if (!button) return;

    if (loader) this.hide(loader);
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
};

// ============================
// GLOBAL EXPOSURE
// ============================

window.LoadingOverlay = LoadingOverlay;
window.MessageModal = MessageModal;
window.Toast = Toast;
window.InlineLoader = InlineLoader;

// ============================
// FORECAST LOAD FAILURE HANDLER
// ============================

/**
 * Listen for forecast load failures and show a user-visible warning
 * This provides feedback when no forecast data is available from any source
 */
window.addEventListener('apr:forecast-load-failed', (event) => {
  const { year, planVersion, stage, sourcesAttempted, reason } = event.detail;

  // Build a user-friendly message
  const contextParts = [];
  if (year) contextParts.push(year);
  if (planVersion) contextParts.push(planVersion);
  if (stage) contextParts.push(stage);

  const contextStr = contextParts.length > 0 ? contextParts.join(' / ') : 'current context';
  const sourcesStr = sourcesAttempted.length > 0
    ? ` (checked: ${sourcesAttempted.join(', ')})`
    : '';

  const message = `No forecast data available for ${contextStr}${sourcesStr}`;

  // Show a non-blocking warning toast
  Toast.warning(message, 6000);

  // Log details for debugging
  console.warn('Forecast load failed:', event.detail);
});

/**
 * Listen for successful comment bulk saves and provide lightweight feedback.
 */
window.addEventListener('apr:comments-saved', (event) => {
  const { count, durationMs } = event.detail || {};
  if (!count) return;

  const durationText = typeof durationMs === 'number' ? ` in ${durationMs}ms` : '';
  Toast.success(`Saved ${count} comment${count === 1 ? '' : 's'}${durationText}`, 3000);
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  LoadingOverlay.init();
  MessageModal.init();
  Toast.init();
});
