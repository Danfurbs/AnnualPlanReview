/**
 * Undo/Redo system for forecast data
 * Provides history management and recovery from accidental changes
 */

// History stack for undo/redo
window.forecastHistory = {
  undoStack: [],
  redoStack: [],
  maxHistorySize: 50, // Keep last 50 states
  currentState: null,
  enabled: true
};

/**
 * Create a snapshot of current forecast data
 * @returns {Object} Snapshot with data, metadata, and timestamp
 */
function createForecastSnapshot() {
  const editorData = window.getForecastEditorData?.();
  if (!editorData) return null;

  return {
    data: cloneForecastData(editorData),
    year: window.forecastEditorState?.year,
    planVersion: window.forecastEditorState?.planVersion,
    workGroup: window.forecastEditorState?.workGroup,
    timestamp: Date.now(),
    description: `Edit ${window.forecastEditorState?.workGroup || 'forecast'}`
  };
}

/**
 * Save current state to undo stack before making changes
 * Call this before any operation that modifies Forecast Builder data
 */
function saveUndoState(description = null) {
  if (!window.forecastHistory.enabled) return;
  if (!window.getForecastEditorData?.()) return;

  const snapshot = createForecastSnapshot();
  if (!snapshot) return;

  if (description) {
    snapshot.description = description;
  }

  // Check if this state is different from the last saved state
  if (window.forecastHistory.currentState) {
    if (areSnapshotsEqual(snapshot, window.forecastHistory.currentState)) {
      return; // No changes, don't save duplicate state
    }
  }

  // Save current state to undo stack
  window.forecastHistory.undoStack.push(snapshot);

  // Limit stack size
  if (window.forecastHistory.undoStack.length > window.forecastHistory.maxHistorySize) {
    window.forecastHistory.undoStack.shift(); // Remove oldest
  }

  // Clear redo stack when new action is taken
  window.forecastHistory.redoStack = [];

  // Update current state
  window.forecastHistory.currentState = snapshot;

  // Update UI
  updateUndoRedoUI();
}

/**
 * Compare two snapshots to see if they're equal
 */
function areSnapshotsEqual(snap1, snap2) {
  if (!snap1 || !snap2) return false;
  if (snap1.year !== snap2.year) return false;
  if (snap1.planVersion !== snap2.planVersion) return false;
  if (snap1.workGroup !== snap2.workGroup) return false;

  // Compare data maps
  const data1 = serializeForecastData(snap1.data);
  const data2 = serializeForecastData(snap2.data);
  return JSON.stringify(data1) === JSON.stringify(data2);
}

/**
 * Undo last change
 */
async function undo() {
  if (!canUndo()) return;

  // Save current state to redo stack
  const currentSnapshot = createForecastSnapshot();
  if (currentSnapshot) {
    window.forecastHistory.redoStack.push(currentSnapshot);
  }

  // Pop from undo stack
  const previousState = window.forecastHistory.undoStack.pop();
  if (!previousState) return;

  // Restore the state
  await restoreForecastSnapshot(previousState);

  // Update current state
  window.forecastHistory.currentState = previousState;

  // Update UI
  updateUndoRedoUI();

  // Show feedback
  if (window.Toast) {
    window.Toast.show({
      type: 'info',
      message: `Undone: ${previousState.description}`,
      duration: 2000
    });
  }
}

/**
 * Redo last undone change
 */
async function redo() {
  if (!canRedo()) return;

  // Pop from redo stack
  const nextState = window.forecastHistory.redoStack.pop();
  if (!nextState) return;

  // Save current state to undo stack
  const currentSnapshot = createForecastSnapshot();
  if (currentSnapshot) {
    window.forecastHistory.undoStack.push(currentSnapshot);
  }

  // Restore the state
  await restoreForecastSnapshot(nextState);

  // Update current state
  window.forecastHistory.currentState = nextState;

  // Update UI
  updateUndoRedoUI();

  // Show feedback
  if (window.Toast) {
    window.Toast.show({
      type: 'info',
      message: `Redone: ${nextState.description}`,
      duration: 2000
    });
  }
}

/**
 * Restore forecast data from a snapshot
 */
async function restoreForecastSnapshot(snapshot) {
  if (!snapshot) return;

  // Restore data
  const restoredData = cloneForecastData(snapshot.data);
  window.setForecastEditorData?.(restoredData);

  // Restore context if in forecast editor
  if (window.forecastEditorState) {
    window.forecastEditorState.year = snapshot.year;
    window.forecastEditorState.planVersion = snapshot.planVersion;
    window.forecastEditorState.workGroup = snapshot.workGroup;

    // Update selectors
    if (typeof renderForecastEditorSelectors === 'function') {
      renderForecastEditorSelectors();
    }

    // Re-render table
    if (typeof renderForecastEditorTable === 'function') {
      renderForecastEditorTable();
    }

    // Update summary
    if (typeof updateForecastEditorSummary === 'function') {
      updateForecastEditorSummary();
    }
  }

  // Save to storage
  if (typeof saveForecastToStorageAsync === 'function') {
    await saveForecastToStorageAsync(restoredData, restoredData.size, snapshot.year, snapshot.planVersion);
  }

  // Update main app if needed
  if (typeof window.render === 'function') {
    window.render();
  }
}

/**
 * Check if undo is available
 */
function canUndo() {
  return window.forecastHistory.undoStack.length > 0;
}

/**
 * Check if redo is available
 */
function canRedo() {
  return window.forecastHistory.redoStack.length > 0;
}

/**
 * Clear history (useful when switching contexts)
 */
function clearHistory() {
  window.forecastHistory.undoStack = [];
  window.forecastHistory.redoStack = [];
  window.forecastHistory.currentState = null;
  updateUndoRedoUI();
}

/**
 * Update undo/redo button states
 */
function updateUndoRedoUI() {
  const undoBtn = document.getElementById('undoButton');
  const redoBtn = document.getElementById('redoButton');

  if (undoBtn) {
    undoBtn.disabled = !canUndo();
    undoBtn.title = canUndo()
      ? `Undo: ${window.forecastHistory.undoStack[window.forecastHistory.undoStack.length - 1]?.description || 'last action'} (Ctrl+Z)`
      : 'Nothing to undo (Ctrl+Z)';
  }

  if (redoBtn) {
    redoBtn.disabled = !canRedo();
    redoBtn.title = canRedo()
      ? `Redo: ${window.forecastHistory.redoStack[window.forecastHistory.redoStack.length - 1]?.description || 'last action'} (Ctrl+Y)`
      : 'Nothing to redo (Ctrl+Y)';
  }
}

/**
 * Initialize undo/redo system
 */
function initializeUndoRedo() {
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Z or Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });

  // Button click handlers
  const undoBtn = document.getElementById('undoButton');
  const redoBtn = document.getElementById('redoButton');

  if (undoBtn) {
    undoBtn.addEventListener('click', undo);
  }

  if (redoBtn) {
    redoBtn.addEventListener('click', redo);
  }

  // Initial UI update
  updateUndoRedoUI();

  console.log('✓ Undo/Redo system initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeUndoRedo);
} else {
  initializeUndoRedo();
}

// Export functions
if (typeof window !== 'undefined') {
  window.saveUndoState = saveUndoState;
  window.undo = undo;
  window.redo = redo;
  window.canUndo = canUndo;
  window.canRedo = canRedo;
  window.clearHistory = clearHistory;
  window.updateUndoRedoUI = updateUndoRedoUI;
}
