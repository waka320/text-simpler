/**
 * ReadEasy. Floating UI Module
 * フローティングポップアップのUI管理
 */

// グローバル変数
let floatingPopup = null;
let isPopupVisible = false;

// フローティングポップアップの状態管理
let floatingState = {
  mode: 'lexicon',
  gradeLevel: 'junior',
  isMinimized: false,
  isProcessing: false,
  lastResult: null
};

/**
 * UIモジュールの初期化
 */
function initializeFloatingUI() {
  console.log('ReadEasy.: Floating UI module loaded');

  // カスタムイベントリスナーの設定
  setupEventListeners();
}

/**
 * カスタムイベントリスナーの設定
 */
function setupEventListeners() {
  // ポップアップ表示/非表示
  document.addEventListener('ts-show-popup', showFloatingPopup);
  document.addEventListener('ts-hide-popup', hideFloatingPopup);

  // 選択テキストの更新
  document.addEventListener('ts-update-selected-text', handleUpdateSelectedText);

  // 設定更新
  document.addEventListener('ts-update-settings', handleUpdateSettings);

  // 自動表示
  document.addEventListener('ts-auto-show-popup', showMinimizedPopupAutomatically);
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

  // 初期位置はJSで設定（ドラッグ可能にするためCSSの!importantを避ける）
  floatingPopup.style.position = 'fixed';
  floatingPopup.style.top = '20px';
  floatingPopup.style.right = '20px';
  floatingPopup.style.left = 'auto';
  floatingPopup.style.bottom = 'auto';

  // ポップアップの初期化
  initializeFloatingPopup();

  isPopupVisible = true;
}

/**
 * フローティングポップアップを非表示
 */
async function hideFloatingPopup() {
  if (floatingPopup) {
    // ポップアップを完全に削除
    if (floatingPopup.parentNode) {
      floatingPopup.parentNode.removeChild(floatingPopup);
    }
    floatingPopup = null;
    isPopupVisible = false;

    // ユーザーが閉じたことを記録（次回自動表示しない）
    await setStorageValue('popupUserClosed', true);
    console.log('ReadEasy.: Popup closed by user, auto-display disabled');
  }
}

/**
 * 選択テキスト更新の処理
 */
function handleUpdateSelectedText(event) {
  const { selectedText } = event.detail;

  if (isPopupVisible && floatingPopup) {
    updateFloatingSelectedTextPreview(selectedText);
    updateFloatingTransformButton();

    // 最小化状態の場合はタイトルも更新
    if (floatingState.isMinimized) {
      updateMinimizedTitle(selectedText);
    }
  }
}

/**
 * 設定更新の処理
 */
function handleUpdateSettings(event) {
  const { mode, gradeLevel } = event.detail;
  if (mode) floatingState.mode = mode;
  if (gradeLevel) floatingState.gradeLevel = gradeLevel;

  if (isPopupVisible) {
    updateFloatingPopupUI();
  }
}

/**
 * フローティングポップアップのHTML要素を作成
 */
function createFloatingPopup() {
  const popup = document.createElement('div');
  popup.id = 'text-simpler-floating-popup';
  popup.innerHTML = `
    <style>
      /* ポップアップコンテナのベーススタイル */
      #text-simpler-floating-popup {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000 !important;
        width: 320px !important;
        max-height: 400px !important;
        background: #ffffff !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 4px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
        font-size: 12px !important;
        line-height: 1.3 !important;
        color: #2c2c2c !important;
        overflow: hidden !important;
        display: block !important;
      }
      
      /* ポップアップヘッダー */
      .ts-popup-header {
        background: #f5f5f5 !important;
        border-bottom: 1px solid #e0e0e0 !important;
        padding: 6px 10px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        cursor: move !important;
        min-height: 32px !important;
      }
      
      .ts-popup-header h1 {
        margin: 0 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #2c2c2c !important;
      }
      
      /* ポップアップメイン */
      .ts-popup-main {
        padding: 10px !important;
      }
      
      /* 選択テキストプレビュー */
      .ts-selected-text-preview {
        background: #fafafa !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 3px !important;
        padding: 6px 8px !important;
        font-size: 11px !important;
        color: #666666 !important;
        max-height: 120px !important;
        overflow-y: auto !important;
        word-wrap: break-word !important;
        margin-bottom: 8px !important;
        line-height: 1.4 !important;
        white-space: pre-wrap !important;
      }
      
      /* スクロールバーのスタイル */
      .ts-selected-text-preview::-webkit-scrollbar {
        width: 6px !important;
      }
      
      .ts-selected-text-preview::-webkit-scrollbar-track {
        background: #f0f0f0 !important;
        border-radius: 3px !important;
      }
      
      .ts-selected-text-preview::-webkit-scrollbar-thumb {
        background: #d0d0d0 !important;
        border-radius: 3px !important;
      }
      
      .ts-selected-text-preview::-webkit-scrollbar-thumb:hover {
        background: #b0b0b0 !important;
      }
      
      .ts-selected-text-preview.ts-has-text {
        color: #2c2c2c !important;
        background: #f8f8f8 !important;
        border-color: #d0d0d0 !important;
      }
      
      .ts-selected-text-preview.ts-no-text {
        font-style: italic !important;
        color: #999999 !important;
      }
      
      /* 変換ボタン */
      .ts-transform-btn {
        width: 100% !important;
        padding: 8px !important;
        background: #2c2c2c !important;
        color: white !important;
        border: none !important;
        border-radius: 3px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        transition: background-color 0.2s !important;
        margin-bottom: 6px !important;
      }
      
      .ts-transform-btn:hover:not(:disabled) {
        background: #404040 !important;
      }
      
      .ts-transform-btn:disabled {
        background: #b0b0b0 !important;
        cursor: not-allowed !important;
        opacity: 0.6 !important;
      }
      
      /* 全て元に戻すボタン */
      .ts-undo-all-btn {
        width: 100% !important;
        padding: 6px !important;
        background: #666666 !important;
        color: white !important;
        border: none !important;
        border-radius: 3px !important;
        font-size: 11px !important;
        cursor: pointer !important;
        transition: background-color 0.2s !important;
      }
      
      .ts-undo-all-btn:hover {
        background: #808080 !important;
      }
      
      /* エラー表示 */
      .ts-error-section {
        background: #f5f5f5 !important;
        color: #2c2c2c !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 4px !important;
        padding: 12px !important;
        margin-bottom: 12px !important;
      }
      
      .ts-error-message {
        margin-bottom: 8px !important;
        font-size: 13px !important;
      }
      
      .ts-retry-btn, .ts-close-error-btn {
        padding: 6px 12px !important;
        margin-right: 8px !important;
        border: none !important;
        border-radius: 3px !important;
        font-size: 12px !important;
        cursor: pointer !important;
      }
      
      .ts-retry-btn {
        background: #2c2c2c !important;
        color: white !important;
      }
      
      .ts-close-error-btn {
        background: #666666 !important;
        color: white !important;
      }
      
      /* ローディング表示 */
      .ts-loading-section {
        text-align: center !important;
        padding: 20px !important;
      }
      
      .ts-spinner {
        border: 3px solid #f0f0f0 !important;
        border-top: 3px solid #2c2c2c !important;
        border-radius: 50% !important;
        width: 30px !important;
        height: 30px !important;
        animation: spin 1s linear infinite !important;
        margin: 0 auto 12px auto !important;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .ts-loading-message {
        font-size: 14px !important;
        color: #666666 !important;
      }
      
      /* モードタブ */
      .ts-mode-tabs {
        display: grid !important;
        grid-template-columns: 1fr 1fr 1fr !important;
        gap: 3px !important;
        margin-bottom: 6px !important;
      }
      
      .ts-mode-tab {
        padding: 5px 4px !important;
        border: 1px solid #e0e0e0 !important;
        background: #ffffff !important;
        color: #2c2c2c !important;
        font-size: 9px !important;
        cursor: pointer !important;
        border-radius: 2px !important;
        transition: all 0.2s !important;
        text-align: center !important;
        line-height: 1.1 !important;
      }
      
      .ts-mode-tab:hover {
        background: #f0f0f0 !important;
        border-color: #d0d0d0 !important;
      }
      
      .ts-mode-tab.ts-active {
        background: #2c2c2c !important;
        color: white !important;
        border-color: #2c2c2c !important;
      }
      
      /* 学年レベル選択 */
      .ts-grade-dropdown select {
        width: 100% !important;
        padding: 4px 6px !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 2px !important;
        background: white !important;
        font-size: 10px !important;
        color: #2c2c2c !important;
        cursor: pointer !important;
      }
      
      .ts-grade-dropdown select:focus {
        outline: none !important;
        border-color: #2c2c2c !important;
      }
      
      /* ヘッダーコントロール */
      .ts-header-controls {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
      }
      
      .ts-settings-btn {
        background: none !important;
        border: none !important;
        color: #2c2c2c !important;
        font-size: 14px !important;
        cursor: pointer !important;
        padding: 2px !important;
        border-radius: 2px !important;
        transition: all 0.2s !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 20px !important;
        min-height: 20px !important;
      }
      
      .ts-settings-btn:hover {
        background-color: #f0f0f0 !important;
        transform: scale(1.05) !important;
      }
      
      .ts-settings-icon {
        font-size: 14px !important;
        line-height: 1 !important;
      }
      
      .ts-control-btn {
        background: none !important;
        border: none !important;
        color: #2c2c2c !important;
        font-size: 12px !important;
        cursor: pointer !important;
        padding: 4px !important;
        border-radius: 3px !important;
        transition: all 0.2s !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 24px !important;
        min-height: 24px !important;
        user-select: none !important;
      }
      
      .ts-control-btn:hover {
        background-color: #f0f0f0 !important;
        transform: scale(1.05) !important;
      }
      
      .ts-control-btn#ts-minimize-btn {
        background: #2c2c2c !important;
        color: white !important;
        border: 1px solid #2c2c2c !important;
        font-weight: 600 !important;
        font-size: 14px !important;
        min-width: 22px !important;
        min-height: 22px !important;
        border-radius: 3px !important;
        box-shadow: 0 1px 3px rgba(44, 44, 44, 0.2) !important;
      }
      
      .ts-control-btn#ts-minimize-btn:hover {
        background: #404040 !important;
        border-color: #404040 !important;
        transform: scale(1.05) !important;
        box-shadow: 0 2px 6px rgba(44, 44, 44, 0.3) !important;
      }
      
      /* 最小化状態の「＋」ボタンを特別に目立たせる */
      .ts-control-btn#ts-minimize-btn[title="展開"] {
        background: #404040 !important;
        border-color: #404040 !important;
        box-shadow: 0 2px 6px rgba(44, 44, 44, 0.3) !important;
        animation: pulse 2s infinite !important;
      }
      
      .ts-control-btn#ts-minimize-btn[title="展開"]:hover {
        background: #2c2c2c !important;
        border-color: #2c2c2c !important;
        box-shadow: 0 4px 10px rgba(44, 44, 44, 0.4) !important;
        animation: none !important;
      }
      
      /* 閉じるボタンの特別なスタイル */
      .ts-control-btn#ts-close-btn {
        color: #666666 !important;
        font-weight: bold !important;
        font-size: 14px !important;
      }
      
      .ts-control-btn#ts-close-btn:hover {
        background-color: #ffebee !important;
        color: #d32f2f !important;
        transform: scale(1.1) !important;
      }
      
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      /* APIキー案内 */
      .ts-api-key-guide {
        background: #f8f8f8 !important;
        color: #2c2c2c !important;
        padding: 12px !important;
        border-radius: 6px !important;
        margin-bottom: 12px !important;
        border: 1px solid #e0e0e0 !important;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05) !important;
      }
      
      .ts-guide-content {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
      }
      
      .ts-guide-icon {
        font-size: 18px !important;
        flex-shrink: 0 !important;
        color: #666666 !important;
      }
      
      .ts-guide-text {
        flex: 1 !important;
      }
      
      .ts-guide-text h4 {
        margin: 0 0 2px 0 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #2c2c2c !important;
      }
      
      .ts-guide-text p {
        margin: 0 !important;
        font-size: 11px !important;
        color: #666666 !important;
        line-height: 1.2 !important;
        opacity: 0.9 !important;
      }
      
      .ts-setup-btn {
        background: #2c2c2c !important;
        border: 1px solid #2c2c2c !important;
        color: white !important;
        padding: 6px 12px !important;
        border-radius: 4px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        flex-shrink: 0 !important;
      }
      
      .ts-setup-btn:hover {
        background: #404040 !important;
        border-color: #404040 !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 2px 4px rgba(44, 44, 44, 0.2) !important;
      }
      
      /* セクションスタイル */
      .ts-popup-main section {
        margin-bottom: 8px !important;
      }
      
      .ts-grade-section {
        background: #f8f8f8 !important;
        padding: 6px !important;
        border-radius: 2px !important;
        border: 1px solid #e0e0e0 !important;
      }
    </style>
    <div class="ts-popup-container">
      <!-- ヘッダー（ドラッグハンドル） -->
      <header class="ts-popup-header" id="ts-popup-header">
        <h1>ReadEasy.</h1>
        <div class="ts-header-controls">
          <button id="ts-settings-btn" class="ts-control-btn ts-settings-btn" title="設定" aria-label="設定">
            <span class="ts-settings-icon">⚙️</span>
          </button>
          <button id="ts-minimize-btn" class="ts-control-btn" title="最小化">−</button>
          <button id="ts-close-btn" class="ts-control-btn" title="閉じる">×</button>
        </div>
      </header>

      <!-- メインコンテンツ -->
      <main class="ts-popup-main" id="ts-popup-main">
        <!-- モード選択 -->
        <section class="ts-mode-section">
          <div class="ts-mode-tabs">
            <button class="ts-mode-tab ts-active" data-mode="lexicon">語・記号の意味がわからない</button>
            <button class="ts-mode-tab" data-mode="load">情報量が多すぎる</button>
            <button class="ts-mode-tab" data-mode="cohesion">文と文の関係がわからない</button>
          </div>
        </section>

        <!-- 学年レベル選択 -->
        <section class="ts-grade-section" id="ts-grade-section">
          <div class="ts-grade-dropdown">
            <select id="ts-grade-level-select" name="ts-grade-level">
              <option value="none">学年レベル: なし</option>
              <option value="university">学年レベル: 大学生</option>
              <option value="senior">学年レベル: 高校生</option>
              <option value="junior" selected>学年レベル: 中学生</option>
              <option value="elementary">学年レベル: 小学生</option>
              <option value="kindergarten">学年レベル: 幼稚園児</option>
            </select>
          </div>
        </section>

        <!-- APIキー設定案内 -->
        <section class="ts-api-key-guide" id="ts-api-key-guide" style="display: none;">
          <div class="ts-guide-content">
            <div class="ts-guide-icon">🔑</div>
            <div class="ts-guide-text">
              <h4>APIキーを設定してください</h4>
              <p>Gemini APIキーを設定すると、テキスト変換機能が利用できます</p>
            </div>
            <button id="ts-setup-api-btn" class="ts-setup-btn">設定</button>
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

  return popup;
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

  // APIキーの状態をチェックして案内を表示
  setTimeout(() => {
    updateApiKeyGuideVisibility();
  }, 100);
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
    // テキスト選択の発生を抑止
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
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
    floatingPopup.style.bottom = 'auto';
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
  // 設定ボタン
  const settingsBtn = floatingPopup.querySelector('#ts-settings-btn');
  settingsBtn.addEventListener('click', handleFloatingSettings);

  // 最小化ボタン
  const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');
  minimizeBtn.addEventListener('click', toggleMinimize);

  // 閉じるボタン
  const closeBtn = floatingPopup.querySelector('#ts-close-btn');
  if (closeBtn) {
    console.log('ReadEasy.: Setting up close button event listener');
    closeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('ReadEasy.: Close button clicked');

      try {
        await hideFloatingPopup();
        console.log('ReadEasy.: Popup hidden successfully');
      } catch (error) {
        console.error('ReadEasy.: Failed to hide popup:', error);
        // フォールバック: 直接非表示にする
        if (floatingPopup) {
          floatingPopup.style.display = 'none';
          isPopupVisible = false;
          console.log('ReadEasy.: Popup hidden using fallback method');
        }
      }
    });
  } else {
    console.error('ReadEasy.: Close button not found');
  }

  // モードタブ
  const modeTabs = floatingPopup.querySelectorAll('.ts-mode-tab');
  modeTabs.forEach(tab => {
    tab.addEventListener('click', handleFloatingModeChange);
  });

  // 学年レベル
  const gradeLevelSelect = floatingPopup.querySelector('#ts-grade-level-select');
  gradeLevelSelect.addEventListener('change', handleFloatingGradeLevelChange);

  // APIキー設定ボタン
  const setupApiBtn = floatingPopup.querySelector('#ts-setup-api-btn');
  setupApiBtn.addEventListener('click', handleFloatingSettings);

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

/**
 * 最小化の切り替え
 */
function toggleMinimize() {
  const main = floatingPopup.querySelector('#ts-popup-main');
  const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');
  const settingsBtn = floatingPopup.querySelector('#ts-settings-btn');

  floatingState.isMinimized = !floatingState.isMinimized;

  if (floatingState.isMinimized) {
    // 最小化状態
    if (main) main.style.display = 'none';
    minimizeBtn.textContent = '+';
    minimizeBtn.title = '展開';
    floatingPopup.style.height = 'auto';
    floatingPopup.style.width = '200px'; // 最小化時は幅を狭く

    // 設定ボタンを非表示
    if (settingsBtn) {
      settingsBtn.style.display = 'none';
    }

    // 最小化状態でのタイトル更新
    updateMinimizedTitle();
  } else {
    // 展開状態
    if (main) main.style.display = 'block';
    minimizeBtn.textContent = '−';
    minimizeBtn.title = '最小化';
    floatingPopup.style.width = '320px'; // 元の幅に戻す

    // 設定ボタンを表示
    if (settingsBtn) {
      settingsBtn.style.display = 'flex';
    }

    // 元のタイトルに戻す
    const title = floatingPopup.querySelector('.ts-popup-header h1');
    if (title) {
      title.textContent = 'ReadEasy.';
    }
  }
}

/**
 * 最小化状態でのタイトル更新
 */
function updateMinimizedTitle(selectedText = null) {
  const title = floatingPopup.querySelector('.ts-popup-header h1');
  if (!title) return;

  // selectedTextが渡されない場合は、content.jsから取得
  if (!selectedText) {
    const event = new CustomEvent('ts-get-selected-text');
    document.dispatchEvent(event);
    return;
  }

  if (selectedText && selectedText.length > 0) {
    // 選択テキストがある場合（最小化時は短く表示）
    const truncated = selectedText.length > 20
      ? selectedText.substring(0, 20) + '...'
      : selectedText;
    title.textContent = `📝 ${truncated}`;
    title.style.fontSize = '12px';
  } else {
    // 選択テキストがない場合
    title.textContent = '📝 テキストを選択';
    title.style.fontSize = '12px';
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

  // 学年レベルの更新
  const gradeLevelSelect = floatingPopup.querySelector('#ts-grade-level-select');
  if (gradeLevelSelect) {
    gradeLevelSelect.value = floatingState.gradeLevel;
  }

  // APIキー設定案内の表示/非表示
  updateApiKeyGuideVisibility();

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
function updateFloatingSelectedTextPreview(selectedText = null) {
  const preview = floatingPopup.querySelector('#ts-selected-text-preview');
  if (!preview) return;

  // selectedTextが渡されない場合は、content.jsから取得
  if (!selectedText) {
    const event = new CustomEvent('ts-get-selected-text');
    document.dispatchEvent(event);
    return;
  }

  if (selectedText) {
    // 長いテキストでも省略せずに全体を表示（スクロール可能）
    preview.textContent = selectedText;
    preview.className = 'ts-selected-text-preview ts-has-text';

    // テキストが長い場合はスクロール位置を最上部に
    if (preview.scrollTop > 0) {
      preview.scrollTop = 0;
    }
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
  if (!transformBtn) return;

  // APIキーの状態をチェック
  chrome.runtime.sendMessage({
    action: 'getSettings',
    keys: ['geminiApiKey']
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to check API key status:', chrome.runtime.lastError);
      return;
    }

    const hasApiKey = response && response.success &&
      response.settings &&
      response.settings.geminiApiKey &&
      response.settings.geminiApiKey.trim().length > 0;

    // 選択テキストの状態を取得
    const event = new CustomEvent('ts-get-selected-text');
    document.dispatchEvent(event);

    transformBtn.disabled = !hasApiKey || floatingState.isProcessing;
    transformBtn.textContent = floatingState.isProcessing ? '変換中...' : '変換実行';

    if (!hasApiKey) {
      transformBtn.title = 'APIキーを設定してください';
    } else {
      transformBtn.title = '';
    }
  });
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
  if (floatingState.isProcessing) return;

  try {
    floatingState.isProcessing = true;
    hideFloatingError();
    showFloatingLoading();
    updateFloatingPopupUI();

    // content.jsに変換リクエストを送信
    const transformEvent = new CustomEvent('ts-transform-request', {
      detail: {
        mode: floatingState.mode,
        level: floatingState.gradeLevel
      }
    });
    document.dispatchEvent(transformEvent);

  } catch (error) {
    console.error('Floating transform error:', error);
    showFloatingError(error.message, true);
    floatingState.isProcessing = false;
    hideFloatingLoading();
    updateFloatingPopupUI();
  }
}

async function handleFloatingUndoAll() {
  try {
    // content.jsに取り消しリクエストを送信
    const undoEvent = new CustomEvent('ts-undo-all-request');
    document.dispatchEvent(undoEvent);

    // 「全て元に戻す」ボタンを非表示
    updateUndoAllButtonVisibility();

  } catch (error) {
    console.error('Floating undo all error:', error);
  }
}

/**
 * APIキー設定案内の表示/非表示を更新
 */
function updateApiKeyGuideVisibility() {
  if (!floatingPopup) return;

  const apiKeyGuide = floatingPopup.querySelector('#ts-api-key-guide');
  const transformBtn = floatingPopup.querySelector('#ts-transform-btn');
  const modeSection = floatingPopup.querySelector('.ts-mode-section');
  const selectedTextSection = floatingPopup.querySelector('.ts-selected-text-section');
  const actionSection = floatingPopup.querySelector('.ts-action-section');
  const gradeSection = floatingPopup.querySelector('.ts-grade-section');

  // APIキーの状態をチェック
  chrome.runtime.sendMessage({
    action: 'getSettings',
    keys: ['geminiApiKey']
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to check API key status:', chrome.runtime.lastError);
      return;
    }

    const hasApiKey = response && response.success &&
      response.settings &&
      response.settings.geminiApiKey &&
      response.settings.geminiApiKey.trim().length > 0;

    if (apiKeyGuide) {
      apiKeyGuide.style.display = hasApiKey ? 'none' : 'block';
    }

    // APIキーがない場合は不要なセクションを非表示
    if (modeSection) {
      modeSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (selectedTextSection) {
      selectedTextSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (actionSection) {
      actionSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (gradeSection) {
      gradeSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (transformBtn) {
      // APIキーがない場合は変換ボタンを無効化
      transformBtn.disabled = !hasApiKey;
      if (!hasApiKey) {
        transformBtn.title = 'APIキーを設定してください';
      } else {
        transformBtn.title = '';
      }
    }
  });
}

/**
 * 「全て元に戻す」ボタンの表示/非表示を更新
 */
function updateUndoAllButtonVisibility() {
  if (!floatingPopup) return;

  const undoAllBtn = floatingPopup.querySelector('#ts-undo-all-btn');
  const markers = document.querySelectorAll('.text-simpler-marker');

  // マーカーが存在する場合のみボタンを表示
  if (undoAllBtn) {
    undoAllBtn.style.display = markers.length > 0 ? 'inline-block' : 'none';
  }
}

function handleFloatingRetry() {
  hideFloatingError();
  handleFloatingTransform();
}

function handleFloatingCloseError() {
  hideFloatingError();
}

/**
 * フローティングポップアップの設定ボタンハンドラー
 */
function handleFloatingSettings() {
  console.log('Settings button clicked, attempting to open options page...');

  try {
    // 方法1: background.jsを経由してオプションページを開く
    chrome.runtime.sendMessage({
      action: 'openOptionsPage'
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        // フォールバック: 直接URLを開く
        openOptionsPageDirectly();
      } else if (response && response.success) {
        console.log('Options page opened successfully via background');
      } else {
        console.error('Failed to open options page via background:', response);
        openOptionsPageDirectly();
      }
    });
  } catch (error) {
    console.error('Error sending message to background:', error);
    // フォールバック: 直接URLを開く
    openOptionsPageDirectly();
  }
}

/**
 * 直接オプションページを開く（フォールバック）
 */
function openOptionsPageDirectly() {
  try {
    console.log('Opening options page directly...');
    const optionsUrl = chrome.runtime.getURL('html/options.html');
    console.log('Options URL:', optionsUrl);

    // 新しいタブで開く
    window.open(optionsUrl, '_blank');
  } catch (error) {
    console.error('Failed to open options page directly:', error);
    // 最後の手段: ユーザーに手動で開くよう指示
    alert('設定ページを開けませんでした。拡張機能の管理ページから手動で設定を開いてください。');
  }
}

// UI表示制御関数群
function showFloatingLoading() {
  const loadingSection = floatingPopup.querySelector('#ts-loading-section');
  if (loadingSection) {
    loadingSection.style.display = 'block';
  }
}

function hideFloatingLoading() {
  const loadingSection = floatingPopup.querySelector('#ts-loading-section');
  if (loadingSection) {
    loadingSection.style.display = 'none';
  }
}

function showFloatingError(message, canRetry = false) {
  const errorSection = floatingPopup.querySelector('#ts-error-section');
  const errorMessage = floatingPopup.querySelector('#ts-error-message');
  const retryBtn = floatingPopup.querySelector('#ts-retry-btn');

  if (errorMessage) errorMessage.textContent = message;
  if (retryBtn) retryBtn.style.display = canRetry ? 'inline-block' : 'none';
  if (errorSection) errorSection.style.display = 'block';
}

function hideFloatingError() {
  const errorSection = floatingPopup.querySelector('#ts-error-section');
  if (errorSection) {
    errorSection.style.display = 'none';
  }
}

/**
 * 最小化状態でポップアップを自動表示
 */
async function showMinimizedPopupAutomatically() {
  try {
    // すでに表示されている場合はスキップ
    if (isPopupVisible && floatingPopup) {
      return;
    }

    // ユーザーが明示的に閉じた場合は表示しない
    const userClosed = await getStorageValue('popupUserClosed', false);
    if (userClosed) {
      console.log('ReadEasy.: Popup auto-display skipped (user closed)');
      return;
    }

    // フローティングポップアップを作成・表示
    showFloatingPopup();

    // 展開状態のままにする（デフォルトで展開）
    if (floatingPopup) {
      floatingState.isMinimized = false;
      const main = floatingPopup.querySelector('#ts-popup-main');
      const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');

      if (main) {
        main.style.display = 'block';
      }
      if (minimizeBtn) {
        minimizeBtn.textContent = '−';
        minimizeBtn.title = '最小化';
      }

      // 展開状態用のスタイル調整
      floatingPopup.style.width = '320px'; // 通常の幅

      // 設定ボタンを表示
      const settingsBtn = floatingPopup.querySelector('#ts-settings-btn');
      if (settingsBtn) {
        settingsBtn.style.display = 'flex';
      }

      // 通常のタイトル
      const title = floatingPopup.querySelector('.ts-popup-header h1');
      if (title) {
        title.textContent = 'ReadEasy.';
      }

      console.log('ReadEasy.: Auto-displayed expanded popup');
    }
  } catch (error) {
    console.error('ReadEasy.: Auto-display error:', error);
  }
}

/**
 * ストレージから値を取得
 */
async function getStorageValue(key, defaultValue) {
  try {
    const result = await chrome.storage.local.get([key]);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error('Storage get error:', error);
    return defaultValue;
  }
}

/**
 * ストレージに値を保存
 */
async function setStorageValue(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error('Storage set error:', error);
  }
}

// 変換完了の通知を受信
document.addEventListener('ts-transform-complete', (event) => {
  floatingState.isProcessing = false;
  hideFloatingLoading();
  updateFloatingPopupUI();
  updateUndoAllButtonVisibility();
});

// 変換エラーの通知を受信
document.addEventListener('ts-transform-error', (event) => {
  floatingState.isProcessing = false;
  hideFloatingLoading();
  showFloatingError(event.detail.message, true);
  updateFloatingPopupUI();
});

// UIモジュールを初期化
initializeFloatingUI();

// グローバルオブジェクトとしてエクスポート（他のスクリプトからアクセス可能）
window.FloatingUI = {
  show: showFloatingPopup,
  hide: hideFloatingPopup,
  isVisible: () => isPopupVisible,
  updateSelectedText: (text) => updateFloatingSelectedTextPreview(text),
  updateSettings: (settings) => handleUpdateSettings({ detail: settings })
};
