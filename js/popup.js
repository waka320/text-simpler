/**
 * Text-Simpler Popup Script (MVP版)
 * ポップアップUIの制御とユーザー操作の処理
 */

// DOM要素の取得
const elements = {
    // モード選択
    modeTabs: document.querySelectorAll('.mode-tab'),
    gradeSection: document.getElementById('gradeSection'),
    gradeOptions: document.querySelectorAll('input[name="gradeLevel"]'),

    // 対象選択
    targetOptions: document.querySelectorAll('input[name="targetType"]'),
    selectedTextPreview: document.getElementById('selectedTextPreview'),

    // アクション
    transformBtn: document.getElementById('transformBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    settingsBtn: document.getElementById('settingsBtn'),

    // 結果表示
    resultSection: document.getElementById('resultSection'),
    resultText: document.getElementById('resultText'),
    copyBtn: document.getElementById('copyBtn'),
    clearBtn: document.getElementById('clearBtn'),

    // エラー表示
    errorSection: document.getElementById('errorSection'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),
    closeErrorBtn: document.getElementById('closeErrorBtn'),

    // ローディング
    loadingSection: document.getElementById('loadingSection'),

    // ステータス
    statusText: document.getElementById('statusText')
};

// 状態管理
let currentState = {
    mode: 'simplify',
    gradeLevel: 'junior',
    targetType: 'selection',
    selectedText: '',
    isProcessing: false,
    lastResult: null
};

/**
 * 初期化
 */
async function initialize() {
    try {
        // イベントリスナーの設定
        setupEventListeners();

        // 設定の読み込み
        await loadSettings();

        // 選択テキストの取得
        await updateSelectedText();

        // UI状態の更新
        updateUI();

        console.log('Text-Simpler: Popup initialized');
    } catch (error) {
        console.error('Text-Simpler: Popup initialization error:', error);
        showError('初期化エラーが発生しました');
    }
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
    // モードタブ
    elements.modeTabs.forEach(tab => {
        tab.addEventListener('click', handleModeChange);
    });

    // 学年レベル
    elements.gradeOptions.forEach(option => {
        option.addEventListener('change', handleGradeLevelChange);
    });

    // 対象タイプ
    elements.targetOptions.forEach(option => {
        option.addEventListener('change', handleTargetTypeChange);
    });

    // アクションボタン
    elements.transformBtn.addEventListener('click', handleTransform);
    elements.cancelBtn.addEventListener('click', handleCancel);
    elements.settingsBtn.addEventListener('click', handleSettings);

    // 結果アクション
    elements.copyBtn.addEventListener('click', handleCopy);
    elements.clearBtn.addEventListener('click', handleClear);

    // エラーアクション
    elements.retryBtn.addEventListener('click', handleRetry);
    elements.closeErrorBtn.addEventListener('click', handleCloseError);
}

/**
 * 設定の読み込み
 */
async function loadSettings() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getSettings',
            keys: ['defaultMode', 'gradeLevel']
        });

        if (response.success) {
            currentState.mode = response.settings.defaultMode || 'simplify';
            currentState.gradeLevel = response.settings.gradeLevel || 'junior';
        }
    } catch (error) {
        console.error('Settings load error:', error);
    }
}

/**
 * 選択テキストの更新
 */
async function updateSelectedText() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'getSelectedText'
        });

        if (response && response.success) {
            currentState.selectedText = response.text || '';
        }
    } catch (error) {
        console.error('Selected text update error:', error);
        currentState.selectedText = '';
    }
}

/**
 * UI状態の更新
 */
function updateUI() {
    // モードタブの更新
    elements.modeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === currentState.mode);
    });

    // 学年セクションの表示/非表示
    elements.gradeSection.style.display = currentState.mode === 'grade' ? 'block' : 'none';

    // 学年レベルの更新
    elements.gradeOptions.forEach(option => {
        option.checked = option.value === currentState.gradeLevel;
    });

    // 対象タイプの更新
    elements.targetOptions.forEach(option => {
        option.checked = option.value === currentState.targetType;
    });

    // 選択テキストプレビューの更新
    updateSelectedTextPreview();

    // 変換ボタンの状態更新
    updateTransformButton();
}

/**
 * 選択テキストプレビューの更新
 */
function updateSelectedTextPreview() {
    const preview = elements.selectedTextPreview;

    if (currentState.targetType === 'page') {
        preview.textContent = 'ページ全体のテキストを変換します';
        preview.className = 'selected-text-preview page-mode';
    } else if (currentState.selectedText) {
        const truncated = currentState.selectedText.length > 100
            ? currentState.selectedText.substring(0, 100) + '...'
            : currentState.selectedText;
        preview.textContent = truncated;
        preview.className = 'selected-text-preview has-text';
    } else {
        preview.textContent = 'テキストを選択してください';
        preview.className = 'selected-text-preview no-text';
    }
}

/**
 * 変換ボタンの状態更新
 */
function updateTransformButton() {
    const canTransform = !currentState.isProcessing && (
        currentState.targetType === 'page' ||
        (currentState.selectedText && currentState.selectedText.length > 5)
    );

    elements.transformBtn.disabled = !canTransform;
    elements.transformBtn.textContent = currentState.isProcessing ? '変換中...' : '変換実行';
}

/**
 * モード変更ハンドラ
 */
function handleModeChange(event) {
    currentState.mode = event.target.dataset.mode;
    updateUI();
}

/**
 * 学年レベル変更ハンドラ
 */
function handleGradeLevelChange(event) {
    currentState.gradeLevel = event.target.value;
}

/**
 * 対象タイプ変更ハンドラ
 */
function handleTargetTypeChange(event) {
    currentState.targetType = event.target.value;
    updateUI();
}

/**
 * 変換実行ハンドラ
 */
async function handleTransform() {
    if (currentState.isProcessing) return;

    try {
        currentState.isProcessing = true;
        hideError();
        hideResult();
        showLoading();
        updateUI();

        // APIキーの確認
        const settingsResponse = await chrome.runtime.sendMessage({
            action: 'getSettings',
            keys: ['geminiApiKey']
        });

        if (!settingsResponse.success || !settingsResponse.settings.geminiApiKey) {
            throw new Error('Gemini APIキーが設定されていません。設定ページで設定してください。');
        }

        // コンテンツスクリプトに変換リクエストを送信
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const transformRequest = {
            action: 'transformSelectedText',
            mode: currentState.mode,
            level: currentState.gradeLevel,
            useSelectedText: currentState.targetType === 'selection'
        };

        const response = await chrome.tabs.sendMessage(tab.id, transformRequest);

        if (response.success) {
            currentState.lastResult = response.result;
            showResult(response.result, response.originalText);
            elements.statusText.textContent = '変換完了';
        } else {
            throw new Error(response.error || '変換に失敗しました');
        }

    } catch (error) {
        console.error('Transform error:', error);
        showError(error.message, true);
        elements.statusText.textContent = 'エラー';
    } finally {
        currentState.isProcessing = false;
        hideLoading();
        updateUI();
    }
}

/**
 * キャンセルハンドラ
 */
function handleCancel() {
    // MVP版では同期処理のためキャンセル機能は簡易実装
    currentState.isProcessing = false;
    hideLoading();
    updateUI();
    elements.statusText.textContent = 'キャンセル';
}

/**
 * 設定ハンドラ
 */
function handleSettings() {
    chrome.runtime.openOptionsPage();
}

/**
 * コピーハンドラ
 */
async function handleCopy() {
    if (!currentState.lastResult) return;

    try {
        let textToCopy = '';

        if (typeof currentState.lastResult === 'string') {
            textToCopy = currentState.lastResult;
        } else if (Array.isArray(currentState.lastResult)) {
            // チャンク結果の場合
            textToCopy = currentState.lastResult
                .filter(chunk => chunk.success)
                .map(chunk => chunk.transformedText)
                .join('\n\n');
        }

        await navigator.clipboard.writeText(textToCopy);
        elements.statusText.textContent = 'コピー完了';

        // 一時的にボタンテキストを変更
        const originalText = elements.copyBtn.textContent;
        elements.copyBtn.textContent = 'コピー完了!';
        setTimeout(() => {
            elements.copyBtn.textContent = originalText;
        }, 1000);

    } catch (error) {
        console.error('Copy error:', error);
        elements.statusText.textContent = 'コピー失敗';
    }
}

/**
 * クリアハンドラ
 */
function handleClear() {
    currentState.lastResult = null;
    hideResult();
    elements.statusText.textContent = '準備完了';
}

/**
 * リトライハンドラ
 */
function handleRetry() {
    hideError();
    handleTransform();
}

/**
 * エラー閉じるハンドラ
 */
function handleCloseError() {
    hideError();
    elements.statusText.textContent = '準備完了';
}

/**
 * ローディング表示
 */
function showLoading() {
    elements.loadingSection.style.display = 'block';
    elements.cancelBtn.style.display = 'inline-block';
}

/**
 * ローディング非表示
 */
function hideLoading() {
    elements.loadingSection.style.display = 'none';
    elements.cancelBtn.style.display = 'none';
}

/**
 * 結果表示
 */
function showResult(result, originalText) {
    let displayText = '';

    if (typeof result === 'string') {
        displayText = result;
    } else if (Array.isArray(result)) {
        // チャンク結果の場合
        const successfulChunks = result.filter(chunk => chunk.success);
        const failedChunks = result.filter(chunk => !chunk.success);

        displayText = successfulChunks
            .map(chunk => chunk.transformedText)
            .join('\n\n');

        if (failedChunks.length > 0) {
            displayText += `\n\n[注意: ${failedChunks.length}個のチャンクで変換に失敗しました]`;
        }
    }

    elements.resultText.textContent = displayText;
    elements.resultSection.style.display = 'block';
}

/**
 * 結果非表示
 */
function hideResult() {
    elements.resultSection.style.display = 'none';
}

/**
 * エラー表示
 */
function showError(message, canRetry = false) {
    elements.errorMessage.textContent = message;
    elements.retryBtn.style.display = canRetry ? 'inline-block' : 'none';
    elements.errorSection.style.display = 'block';
}

/**
 * エラー非表示
 */
function hideError() {
    elements.errorSection.style.display = 'none';
}

// 初期化実行
document.addEventListener('DOMContentLoaded', initialize);
