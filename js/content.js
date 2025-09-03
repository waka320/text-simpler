/**
 * Text-Simpler Content Script (シンプル版)
 * コンテンツスクリプトの基本機能
 */

console.log('Text-Simpler: Simple content script loaded');

// グローバル変数
let currentSelectedText = '';
let currentSelection = null;
let isProcessing = false;
let floatingPopup = null;
let isPopupVisible = false;

// 初期化
function initialize() {
  // 選択テキストの監視（より包括的に）
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', handleTextSelection);
  document.addEventListener('selectionchange', handleTextSelection);

  // クリックで選択解除される場合にも対応
  document.addEventListener('click', handleTextSelection);

  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  console.log('Text-Simpler: Simple content script initialized');
}

// デバウンス用のタイマー
let selectionUpdateTimer = null;

/**
 * テキスト選択イベントハンドラ
 */
function handleTextSelection() {
  if (isProcessing) return;

  // 前のタイマーをクリア（デバウンス）
  if (selectionUpdateTimer) {
    clearTimeout(selectionUpdateTimer);
  }

  selectionUpdateTimer = setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // 選択テキストが変更された場合のみ処理
    if (selectedText !== currentSelectedText) {
      const previousText = currentSelectedText;
      currentSelectedText = selectedText;
      currentSelection = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

      // バックグラウンドに選択テキストを通知
      if (selectedText && selectedText.length > 5) {
        chrome.runtime.sendMessage({
          action: 'textSelected',
          text: selectedText
        }).catch(error => {
          console.error('Text-Simpler: Failed to send text selection:', error);
        });
      }

      // フローティングポップアップが表示されている場合はリアルタイム更新
      if (isPopupVisible && floatingPopup) {
        updateFloatingSelectedTextPreview();
        updateFloatingTransformButton();

        // デバッグログ（選択が変更された場合のみ）
        if (selectedText !== previousText) {
          console.log('Text-Simpler: Updated floating popup with selected text:',
            selectedText ? selectedText.substring(0, 50) + '...' : '(no selection)');
        }
      }
    }
  }, 150); // デバウンス時間を150msに調整
}

/**
 * ランタイムメッセージハンドラ
 */
function handleRuntimeMessage(request, sender, sendResponse) {
  switch (request.action) {
    case 'getSelectedText':
      sendResponse({
        success: true,
        text: currentSelectedText,
        selection: currentSelection
      });
      break;

    case 'transformText':
      handleTransformText(request, sendResponse);
      break;

    case 'undoTransform':
      handleUndoTransform(request, sendResponse);
      break;

    case 'undoAllTransforms':
      handleUndoAllTransforms(request, sendResponse);
      break;

    case 'toggleFloatingPopup':
      handleToggleFloatingPopup(request, sendResponse);
      break;

    default:
      sendResponse({
        success: false,
        error: `未対応のアクション: ${request.action}`
      });
  }
  return true;
}

/**
 * テキスト変換処理
 */
async function handleTransformText(request, sendResponse) {
  try {
    isProcessing = true;

    const { text, mode, level, elementId } = request;

    // 変換対象テキストの決定
    let targetText = text;
    if (!targetText && currentSelectedText) {
      targetText = currentSelectedText;
    }

    if (!targetText) {
      throw new Error('変換対象のテキストが見つかりません');
    }

    // バックグラウンドに変換リクエスト
    const response = await chrome.runtime.sendMessage({
      action: 'transform',
      text: targetText,
      mode: mode || 'simplify',
      level: level || 'junior'
    });

    if (!response.success) {
      throw new Error(response.error || '変換に失敗しました');
    }

    // 結果をページに適用
    const applyResult = applyTransformToPage(targetText, response.result, elementId);

    sendResponse({
      success: true,
      result: response.result,
      applied: applyResult.success,
      elementId: applyResult.elementId
    });

  } catch (error) {
    console.error('Transform error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * ページに変換結果を適用
 */
function applyTransformToPage(originalText, transformedText, elementId = null) {
  try {
    // 選択範囲を使用してマーカーを作成
    if (currentSelection) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = currentSelection;
        return applyMarkerToSelection(range, originalText, transformedText);
      }
    }

    // フォールバック: テキスト検索で適用
    return applyMarkerByTextSearch(originalText, transformedText);

  } catch (error) {
    console.error('Apply transform error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 選択範囲にマーカーを適用
 */
function applyMarkerToSelection(range, originalText, transformedText) {
  try {
    // 選択されたテキストが期待されるテキストと一致するか確認
    const selectedText = range.toString().trim();
    if (selectedText !== originalText.trim()) {
      console.warn('Selected text does not match original text');
    }

    // マーカー要素を作成
    const marker = createMarkerElement(transformedText, originalText, getCurrentMode());

    // 選択範囲を削除してマーカーを挿入
    range.deleteContents();
    range.insertNode(marker);

    // 選択をクリア
    window.getSelection().removeAllRanges();

    return {
      success: true,
      elementId: marker.id,
      marker: marker
    };

  } catch (error) {
    console.error('Apply marker to selection error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * テキスト検索でマーカーを適用（フォールバック）
 */
function applyMarkerByTextSearch(originalText, transformedText) {
  try {
    // TreeWalkerを使用してテキストノードを検索
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          // マーカー内のテキストは除外
          if (node.parentElement && node.parentElement.classList.contains('text-simpler-marker')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent.includes(originalText) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let textNode = walker.nextNode();
    while (textNode) {
      const textContent = textNode.textContent;
      const index = textContent.indexOf(originalText);

      if (index !== -1) {
        // テキストノードを分割してマーカーを挿入
        const beforeText = textContent.substring(0, index);
        const afterText = textContent.substring(index + originalText.length);

        // 新しいテキストノードを作成
        const beforeNode = document.createTextNode(beforeText);
        const afterNode = document.createTextNode(afterText);
        const marker = createMarkerElement(transformedText, originalText, getCurrentMode());

        // 親要素に新しいノードを挿入
        const parent = textNode.parentNode;
        parent.insertBefore(beforeNode, textNode);
        parent.insertBefore(marker, textNode);
        parent.insertBefore(afterNode, textNode);
        parent.removeChild(textNode);

        return {
          success: true,
          elementId: marker.id,
          marker: marker
        };
      }

      textNode = walker.nextNode();
    }

    return {
      success: false,
      error: 'Original text not found in document'
    };

  } catch (error) {
    console.error('Apply marker by text search error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * マーカー要素を作成
 */
function createMarkerElement(transformedText, originalText, mode) {
  const marker = document.createElement('span');
  marker.className = `text-simpler-marker text-simpler-${mode}`;
  marker.id = 'text-simpler-marker-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  marker.textContent = transformedText;

  // 元のテキストをデータ属性として保存
  marker.setAttribute('data-original-text', originalText);
  marker.setAttribute('data-mode', mode);
  marker.setAttribute('title', 'ダブルクリックで元に戻す');

  // ダブルクリックで元に戻すイベントリスナー
  marker.addEventListener('dblclick', function () {
    restoreMarker(this);
  });

  return marker;
}

/**
 * 現在のモードを取得
 */
function getCurrentMode() {
  if (floatingState && floatingState.mode) {
    return floatingState.mode;
  }
  return 'simplify'; // デフォルト
}

/**
 * マーカーを元のテキストに戻す
 */
function restoreMarker(marker) {
  try {
    const originalText = marker.getAttribute('data-original-text');
    const textNode = document.createTextNode(originalText);

    marker.parentNode.replaceChild(textNode, marker);

    // フローティングポップアップの「全て元に戻す」ボタンの状態を更新
    if (isPopupVisible) {
      updateUndoAllButtonVisibility();
    }

    console.log('Marker restored to original text:', originalText);
  } catch (error) {
    console.error('Restore marker error:', error);
  }
}

/**
 * 変換の取り消し
 */
function handleUndoTransform(request, sendResponse) {
  try {
    const { elementId } = request;

    if (!elementId) {
      throw new Error('要素IDが指定されていません');
    }

    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error('指定された要素が見つかりません');
    }

    // 要素を削除
    element.remove();

    sendResponse({
      success: true,
      message: '変換を取り消しました'
    });

  } catch (error) {
    console.error('Undo transform error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * すべての変換を取り消し
 */
function handleUndoAllTransforms(request, sendResponse) {
  try {
    // text-simpler-markerクラスを持つ要素をすべて元に戻す
    const markers = document.querySelectorAll('.text-simpler-marker');
    let count = 0;

    markers.forEach(marker => {
      restoreMarker(marker);
      count++;
    });

    // 古いシステムの要素も削除（後方互換性）
    const oldElements = document.querySelectorAll('.text-simpler-result');
    oldElements.forEach(element => {
      element.remove();
      count++;
    });

    sendResponse({
      success: true,
      message: `${count}個の変換を取り消しました`
    });

  } catch (error) {
    console.error('Undo all transforms error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * フローティングポップアップの切り替え
 */
function handleToggleFloatingPopup(request, sendResponse) {
  try {
    if (isPopupVisible) {
      hideFloatingPopup();
    } else {
      showFloatingPopup();
    }

    sendResponse({
      success: true,
      visible: isPopupVisible
    });
  } catch (error) {
    console.error('Toggle floating popup error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * フローティングポップアップを表示
 */
function showFloatingPopup() {
  if (floatingPopup) {
    floatingPopup.style.display = 'block';
    isPopupVisible = true;
    return;
  }

  // フローティングポップアップを作成
  floatingPopup = createFloatingPopup();
  document.body.appendChild(floatingPopup);

  // ポップアップの初期化
  initializeFloatingPopup();

  isPopupVisible = true;
}

/**
 * フローティングポップアップを非表示
 */
function hideFloatingPopup() {
  if (floatingPopup) {
    floatingPopup.style.display = 'none';
    isPopupVisible = false;
  }
}

/**
 * フローティングポップアップのHTML要素を作成
 */
function createFloatingPopup() {
  const popup = document.createElement('div');
  popup.id = 'text-simpler-floating-popup';
  popup.innerHTML = `
    <div class="ts-popup-container">
      <!-- ヘッダー（ドラッグハンドル） -->
      <header class="ts-popup-header" id="ts-popup-header">
        <h1>Text-Simpler</h1>
        <div class="ts-header-controls">
          <button id="ts-minimize-btn" class="ts-control-btn" title="最小化">−</button>
          <button id="ts-close-btn" class="ts-control-btn" title="閉じる">×</button>
        </div>
      </header>

      <!-- メインコンテンツ -->
      <main class="ts-popup-main" id="ts-popup-main">
        <!-- モード選択 -->
        <section class="ts-mode-section">
          <div class="ts-mode-tabs">
            <button class="ts-mode-tab ts-active" data-mode="simplify">わかりやすく</button>
            <button class="ts-mode-tab" data-mode="concretize">具体化</button>
            <button class="ts-mode-tab" data-mode="abstract">抽象化</button>
            <button class="ts-mode-tab" data-mode="grade">学年レベル</button>
          </div>
        </section>

        <!-- 学年レベル選択 -->
        <section class="ts-grade-section" id="ts-grade-section" style="display: none;">
          <h3>学年レベル</h3>
          <div class="ts-grade-options">
            <label class="ts-grade-option">
              <input type="radio" name="ts-grade-level" value="elementary">
              <span>小学生</span>
            </label>
            <label class="ts-grade-option">
              <input type="radio" name="ts-grade-level" value="junior" checked>
              <span>中学生</span>
            </label>
            <label class="ts-grade-option">
              <input type="radio" name="ts-grade-level" value="senior">
              <span>高校生</span>
            </label>
          </div>
        </section>


        <!-- 選択テキスト表示 -->
        <section class="ts-selected-text-section">
          <div class="ts-selected-text-preview" id="ts-selected-text-preview">
            テキストを選択してください
          </div>
        </section>

        <!-- 実行ボタン -->
        <section class="ts-action-section">
          <button id="ts-transform-btn" class="ts-transform-btn" disabled>
            変換実行
          </button>
          <button id="ts-undo-all-btn" class="ts-undo-all-btn" style="display: none;">
            全て元に戻す
          </button>
        </section>



        <!-- エラー表示 -->
        <section class="ts-error-section" id="ts-error-section" style="display: none;">
          <div class="ts-error-content">
            <div class="ts-error-message" id="ts-error-message"></div>
            <div class="ts-error-actions">
              <button id="ts-retry-btn" class="ts-retry-btn" style="display: none;">再試行</button>
              <button id="ts-close-error-btn" class="ts-close-error-btn">閉じる</button>
            </div>
          </div>
        </section>

        <!-- ローディング表示 -->
        <section class="ts-loading-section" id="ts-loading-section" style="display: none;">
          <div class="ts-loading-content">
            <div class="ts-spinner"></div>
            <div class="ts-loading-message">変換中...</div>
          </div>
        </section>
      </main>
    </div>
  `;

  // スタイルを適用
  applyFloatingPopupStyles(popup);

  return popup;
}

/**
 * フローティングポップアップにスタイルを適用
 */
function applyFloatingPopupStyles(popup) {
  popup.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    width: 320px;
    max-height: 500px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: #333;
    overflow: hidden;
  `;
}

/**
 * フローティングポップアップの初期化
 */
function initializeFloatingPopup() {
  if (!floatingPopup) return;

  // ドラッグ機能の初期化
  initializeDragFunctionality();

  // イベントリスナーの設定
  setupFloatingPopupEventListeners();

  // 初期状態の更新
  updateFloatingPopupUI();
}

/**
 * ドラッグ機能の初期化
 */
function initializeDragFunctionality() {
  const header = floatingPopup.querySelector('#ts-popup-header');
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  header.style.cursor = 'move';

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = floatingPopup.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    // ドラッグ中のスタイル
    floatingPopup.style.opacity = '0.8';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    // 画面外に出ないように制限
    const maxX = window.innerWidth - floatingPopup.offsetWidth;
    const maxY = window.innerHeight - floatingPopup.offsetHeight;

    floatingPopup.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    floatingPopup.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    floatingPopup.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      floatingPopup.style.opacity = '1';
      document.body.style.userSelect = '';
    }
  });
}

/**
 * フローティングポップアップのイベントリスナー設定
 */
function setupFloatingPopupEventListeners() {
  // 最小化ボタン
  const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');
  minimizeBtn.addEventListener('click', toggleMinimize);

  // 閉じるボタン
  const closeBtn = floatingPopup.querySelector('#ts-close-btn');
  closeBtn.addEventListener('click', hideFloatingPopup);

  // モードタブ
  const modeTabs = floatingPopup.querySelectorAll('.ts-mode-tab');
  modeTabs.forEach(tab => {
    tab.addEventListener('click', handleFloatingModeChange);
  });

  // 学年レベル
  const gradeOptions = floatingPopup.querySelectorAll('input[name="ts-grade-level"]');
  gradeOptions.forEach(option => {
    option.addEventListener('change', handleFloatingGradeLevelChange);
  });

  // 変換ボタン
  const transformBtn = floatingPopup.querySelector('#ts-transform-btn');
  transformBtn.addEventListener('click', handleFloatingTransform);

  // その他のボタン
  const undoAllBtn = floatingPopup.querySelector('#ts-undo-all-btn');
  undoAllBtn.addEventListener('click', handleFloatingUndoAll);



  const retryBtn = floatingPopup.querySelector('#ts-retry-btn');
  retryBtn.addEventListener('click', handleFloatingRetry);

  const closeErrorBtn = floatingPopup.querySelector('#ts-close-error-btn');
  closeErrorBtn.addEventListener('click', handleFloatingCloseError);
}

// フローティングポップアップの状態管理
let floatingState = {
  mode: 'simplify',
  gradeLevel: 'junior',
  isMinimized: false,
  isProcessing: false,
  lastResult: null
};

/**
 * 最小化の切り替え
 */
function toggleMinimize() {
  const main = floatingPopup.querySelector('#ts-popup-main');
  const footer = floatingPopup.querySelector('.ts-popup-footer');
  const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');

  floatingState.isMinimized = !floatingState.isMinimized;

  if (floatingState.isMinimized) {
    main.style.display = 'none';
    footer.style.display = 'none';
    minimizeBtn.textContent = '+';
    minimizeBtn.title = '最大化';
    floatingPopup.style.height = 'auto';
  } else {
    main.style.display = 'block';
    footer.style.display = 'block';
    minimizeBtn.textContent = '−';
    minimizeBtn.title = '最小化';
  }
}

/**
 * フローティングポップアップのUI更新
 */
function updateFloatingPopupUI() {
  if (!floatingPopup) return;

  // モードタブの更新
  const modeTabs = floatingPopup.querySelectorAll('.ts-mode-tab');
  modeTabs.forEach(tab => {
    tab.classList.toggle('ts-active', tab.dataset.mode === floatingState.mode);
  });

  // 学年セクションの表示/非表示
  const gradeSection = floatingPopup.querySelector('#ts-grade-section');
  gradeSection.style.display = floatingState.mode === 'grade' ? 'block' : 'none';

  // 学年レベルの更新
  const gradeOptions = floatingPopup.querySelectorAll('input[name="ts-grade-level"]');
  gradeOptions.forEach(option => {
    option.checked = option.value === floatingState.gradeLevel;
  });

  // 選択テキストプレビューの更新
  updateFloatingSelectedTextPreview();

  // 変換ボタンの状態更新
  updateFloatingTransformButton();

  // 「全て元に戻す」ボタンの状態更新
  updateUndoAllButtonVisibility();
}

/**
 * 選択テキストプレビューの更新
 */
function updateFloatingSelectedTextPreview() {
  const preview = floatingPopup.querySelector('#ts-selected-text-preview');

  if (currentSelectedText) {
    const truncated = currentSelectedText.length > 120
      ? currentSelectedText.substring(0, 120) + '...'
      : currentSelectedText;
    preview.textContent = truncated;
    preview.className = 'ts-selected-text-preview ts-has-text';
  } else {
    preview.textContent = 'テキストを選択してください';
    preview.className = 'ts-selected-text-preview ts-no-text';
  }
}

/**
 * 変換ボタンの状態更新
 */
function updateFloatingTransformButton() {
  const transformBtn = floatingPopup.querySelector('#ts-transform-btn');
  const canTransform = !floatingState.isProcessing &&
    currentSelectedText &&
    currentSelectedText.length > 5;

  transformBtn.disabled = !canTransform;
  transformBtn.textContent = floatingState.isProcessing ? '変換中...' : '変換実行';
}

// イベントハンドラー関数群
function handleFloatingModeChange(event) {
  floatingState.mode = event.target.dataset.mode;
  updateFloatingPopupUI();
}

function handleFloatingGradeLevelChange(event) {
  floatingState.gradeLevel = event.target.value;
}

async function handleFloatingTransform() {
  if (floatingState.isProcessing || !currentSelectedText) return;

  try {
    floatingState.isProcessing = true;
    hideFloatingError();
    showFloatingLoading();
    updateFloatingPopupUI();

    // 変換リクエストを送信（既存のhandleTransformText関数を利用）
    const request = {
      text: currentSelectedText,
      mode: floatingState.mode,
      level: floatingState.gradeLevel
    };

    await new Promise((resolve, reject) => {
      handleTransformText(request, (response) => {
        if (response.success) {
          floatingState.lastResult = response.result;

          // 「全て元に戻す」ボタンの表示を更新
          updateUndoAllButtonVisibility();

          // ステータスメッセージを更新（フッターが存在する場合のみ）
          const statusText = floatingPopup.querySelector('#ts-status-text');
          if (statusText) {
            statusText.textContent = '変換完了';
          }

          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });

  } catch (error) {
    console.error('Floating transform error:', error);
    showFloatingError(error.message, true);
  } finally {
    floatingState.isProcessing = false;
    hideFloatingLoading();
    updateFloatingPopupUI();
  }
}

async function handleFloatingUndoAll() {
  try {
    await new Promise((resolve, reject) => {
      handleUndoAllTransforms({}, (response) => {
        if (response.success) {
          // 「全て元に戻す」ボタンを非表示
          updateUndoAllButtonVisibility();

          const statusText = floatingPopup.querySelector('#ts-status-text');
          if (statusText) {
            statusText.textContent = response.message || '変換を元に戻しました';
          }

          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  } catch (error) {
    console.error('Floating undo all error:', error);
  }
}

/**
 * 「全て元に戻す」ボタンの表示/非表示を更新
 */
function updateUndoAllButtonVisibility() {
  if (!floatingPopup) return;

  const undoAllBtn = floatingPopup.querySelector('#ts-undo-all-btn');
  const markers = document.querySelectorAll('.text-simpler-marker');

  // マーカーが存在する場合のみボタンを表示
  undoAllBtn.style.display = markers.length > 0 ? 'inline-block' : 'none';
}



function handleFloatingRetry() {
  hideFloatingError();
  handleFloatingTransform();
}

function handleFloatingCloseError() {
  hideFloatingError();
  const statusText = floatingPopup.querySelector('#ts-status-text');
  if (statusText) {
    statusText.textContent = '準備完了';
  }
}

// UI表示制御関数群
function showFloatingLoading() {
  const loadingSection = floatingPopup.querySelector('#ts-loading-section');
  loadingSection.style.display = 'block';
}

function hideFloatingLoading() {
  const loadingSection = floatingPopup.querySelector('#ts-loading-section');
  loadingSection.style.display = 'none';
}



function showFloatingError(message, canRetry = false) {
  const errorSection = floatingPopup.querySelector('#ts-error-section');
  const errorMessage = floatingPopup.querySelector('#ts-error-message');
  const retryBtn = floatingPopup.querySelector('#ts-retry-btn');

  errorMessage.textContent = message;
  retryBtn.style.display = canRetry ? 'inline-block' : 'none';
  errorSection.style.display = 'block';
}

function hideFloatingError() {
  const errorSection = floatingPopup.querySelector('#ts-error-section');
  errorSection.style.display = 'none';
}



// 初期化を実行
initialize();
