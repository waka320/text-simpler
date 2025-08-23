/**
 * Text-Simpler Options Script (MVP版)
 * 設定ページのUI制御と設定の保存/読み込み
 */

// DOM要素の取得
const elements = {
  // API設定
  geminiApiKey: document.getElementById('geminiApiKey'),
  toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
  validateApiKey: document.getElementById('validateApiKey'),
  validationStatus: document.getElementById('validationStatus'),

  // デフォルト設定
  defaultMode: document.getElementById('defaultMode'),
  gradeLevel: document.getElementById('gradeLevel'),
  temperature: document.getElementById('temperature'),
  temperatureValue: document.getElementById('temperatureValue'),

  // アクション
  saveSettings: document.getElementById('saveSettings'),
  resetSettings: document.getElementById('resetSettings'),
  saveStatus: document.getElementById('saveStatus'),

  // ローディング
  loadingOverlay: document.getElementById('loadingOverlay')
};

// 状態管理
let currentSettings = {};
let isApiKeyVisible = false;
let hasUnsavedChanges = false;

/**
 * 初期化
 */
async function initialize() {
  try {
    // イベントリスナーの設定
    setupEventListeners();

    // 設定の読み込み
    await loadSettings();

    // UI状態の更新
    updateUI();

    console.log('Text-Simpler: Options page initialized');
  } catch (error) {
    console.error('Text-Simpler: Options initialization error:', error);
    showStatus('初期化エラーが発生しました', 'error');
  }
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
  // API設定
  elements.geminiApiKey.addEventListener('input', handleApiKeyChange);
  elements.toggleApiKeyVisibility.addEventListener('click', handleToggleApiKeyVisibility);
  elements.validateApiKey.addEventListener('click', handleValidateApiKey);

  // デフォルト設定
  elements.defaultMode.addEventListener('change', handleSettingChange);
  elements.gradeLevel.addEventListener('change', handleSettingChange);
  elements.temperature.addEventListener('input', handleTemperatureChange);

  // アクション
  elements.saveSettings.addEventListener('click', handleSaveSettings);
  elements.resetSettings.addEventListener('click', handleResetSettings);

  // ページ離脱時の警告
  window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * 設定の読み込み
 */
async function loadSettings() {
  try {
    showLoading();

    const response = await chrome.runtime.sendMessage({
      action: 'getSettings'
    });

    if (response.success) {
      currentSettings = response.settings;
      populateForm(currentSettings);
      hasUnsavedChanges = false;
    } else {
      throw new Error(response.error || '設定の読み込みに失敗しました');
    }
  } catch (error) {
    console.error('Settings load error:', error);
    showStatus('設定の読み込みに失敗しました', 'error');
  } finally {
    hideLoading();
  }
}

/**
 * フォームに設定値を反映
 */
function populateForm(settings) {
  // APIキー（セキュリティのため伏字で表示）
  if (settings.geminiApiKey) {
    elements.geminiApiKey.value = '●'.repeat(20);
    elements.geminiApiKey.dataset.hasValue = 'true';
  } else {
    elements.geminiApiKey.value = '';
    elements.geminiApiKey.dataset.hasValue = 'false';
  }

  // デフォルト設定
  elements.defaultMode.value = settings.defaultMode || 'simplify';
  elements.gradeLevel.value = settings.gradeLevel || 'junior';
  elements.temperature.value = settings.temperature || 0.2;
  elements.temperatureValue.textContent = settings.temperature || 0.2;
}

/**
 * UI状態の更新
 */
function updateUI() {
  // 保存ボタンの状態
  elements.saveSettings.disabled = !hasUnsavedChanges;
  elements.saveSettings.textContent = hasUnsavedChanges ? '設定を保存 *' : '設定を保存';

  // APIキー表示切替ボタン
  elements.toggleApiKeyVisibility.textContent = isApiKeyVisible ? '🙈' : '👁️';
  elements.geminiApiKey.type = isApiKeyVisible ? 'text' : 'password';
}

/**
 * APIキー変更ハンドラ
 */
function handleApiKeyChange() {
  hasUnsavedChanges = true;
  elements.geminiApiKey.dataset.hasValue = elements.geminiApiKey.value.length > 0 ? 'true' : 'false';
  clearValidationStatus();
  updateUI();
}

/**
 * APIキー表示切替ハンドラ
 */
function handleToggleApiKeyVisibility() {
  isApiKeyVisible = !isApiKeyVisible;

  // 伏字表示の場合は実際の値を取得
  if (isApiKeyVisible && elements.geminiApiKey.dataset.hasValue === 'true' && elements.geminiApiKey.value.startsWith('●')) {
    // 実際のAPIキーを取得して表示
    loadActualApiKey();
  }

  updateUI();
}

/**
 * 実際のAPIキーを取得
 */
async function loadActualApiKey() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getSettings',
      keys: ['geminiApiKey']
    });

    if (response.success && response.settings.geminiApiKey) {
      elements.geminiApiKey.value = response.settings.geminiApiKey;
    }
  } catch (error) {
    console.error('Failed to load actual API key:', error);
  }
}

/**
 * APIキー検証ハンドラ
 */
async function handleValidateApiKey() {
  const apiKey = elements.geminiApiKey.value;

  if (!apiKey || apiKey.startsWith('●')) {
    showValidationStatus('APIキーを入力してください', 'error');
    return;
  }

  try {
    showValidationStatus('検証中...', 'loading');
    elements.validateApiKey.disabled = true;

    const response = await chrome.runtime.sendMessage({
      action: 'validateApiKey',
      apiKey: apiKey
    });

    if (response.success && response.valid) {
      showValidationStatus('✓ APIキーは有効です', 'success');
    } else {
      showValidationStatus('✗ APIキーが無効です: ' + (response.error || '不明なエラー'), 'error');
    }
  } catch (error) {
    console.error('API key validation error:', error);
    showValidationStatus('✗ 検証エラー: ' + error.message, 'error');
  } finally {
    elements.validateApiKey.disabled = false;
  }
}

/**
 * 設定変更ハンドラ
 */
function handleSettingChange() {
  hasUnsavedChanges = true;
  updateUI();
}

/**
 * 温度パラメータ変更ハンドラ
 */
function handleTemperatureChange() {
  const value = parseFloat(elements.temperature.value);
  elements.temperatureValue.textContent = value.toFixed(1);
  handleSettingChange();
}

/**
 * 設定保存ハンドラ
 */
async function handleSaveSettings() {
  try {
    showLoading();

    const settings = {
      defaultMode: elements.defaultMode.value,
      gradeLevel: elements.gradeLevel.value,
      temperature: parseFloat(elements.temperature.value)
    };

    // APIキーが変更されている場合のみ保存
    const apiKeyValue = elements.geminiApiKey.value;
    if (apiKeyValue && !apiKeyValue.startsWith('●')) {
      settings.geminiApiKey = apiKeyValue;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: settings
    });

    if (response.success) {
      currentSettings = { ...currentSettings, ...settings };
      hasUnsavedChanges = false;
      showStatus('設定を保存しました', 'success');

      // APIキーを伏字表示に戻す
      if (settings.geminiApiKey) {
        elements.geminiApiKey.value = '●'.repeat(20);
        elements.geminiApiKey.dataset.hasValue = 'true';
        isApiKeyVisible = false;
      }
    } else {
      throw new Error(response.error || '設定の保存に失敗しました');
    }
  } catch (error) {
    console.error('Settings save error:', error);
    showStatus('設定の保存に失敗しました: ' + error.message, 'error');
  } finally {
    hideLoading();
    updateUI();
  }
}

/**
 * 設定リセットハンドラ
 */
async function handleResetSettings() {
  if (!confirm('設定をデフォルト値に戻しますか？\n（APIキーは削除されません）')) {
    return;
  }

  try {
    showLoading();

    // デフォルト設定（APIキー以外）
    const defaultSettings = {
      defaultMode: 'simplify',
      gradeLevel: 'junior',
      temperature: 0.2
    };

    const response = await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: defaultSettings
    });

    if (response.success) {
      // フォームを更新（APIキーは保持）
      elements.defaultMode.value = defaultSettings.defaultMode;
      elements.gradeLevel.value = defaultSettings.gradeLevel;
      elements.temperature.value = defaultSettings.temperature;
      elements.temperatureValue.textContent = defaultSettings.temperature;

      hasUnsavedChanges = false;
      showStatus('設定をデフォルト値に戻しました', 'success');
    } else {
      throw new Error(response.error || '設定のリセットに失敗しました');
    }
  } catch (error) {
    console.error('Settings reset error:', error);
    showStatus('設定のリセットに失敗しました: ' + error.message, 'error');
  } finally {
    hideLoading();
    updateUI();
  }
}

/**
 * ページ離脱前の警告
 */
function handleBeforeUnload(event) {
  if (hasUnsavedChanges) {
    event.preventDefault();
    event.returnValue = '未保存の変更があります。ページを離れますか？';
    return event.returnValue;
  }
}

/**
 * ローディング表示
 */
function showLoading() {
  elements.loadingOverlay.style.display = 'flex';
}

/**
 * ローディング非表示
 */
function hideLoading() {
  elements.loadingOverlay.style.display = 'none';
}

/**
 * ステータス表示
 */
function showStatus(message, type = 'info') {
  elements.saveStatus.textContent = message;
  elements.saveStatus.className = `save-status ${type}`;

  // 成功メッセージは3秒後に自動で消す
  if (type === 'success') {
    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'save-status';
    }, 3000);
  }
}

/**
 * 検証ステータス表示
 */
function showValidationStatus(message, type = 'info') {
  elements.validationStatus.textContent = message;
  elements.validationStatus.className = `validation-status ${type}`;
}

/**
 * 検証ステータスクリア
 */
function clearValidationStatus() {
  elements.validationStatus.textContent = '';
  elements.validationStatus.className = 'validation-status';
}

// 初期化実行
document.addEventListener('DOMContentLoaded', initialize);
