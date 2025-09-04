/**
 * ReadEasy. Background Script (モジュール版)
 * Manifest V3対応のService Worker
 */

// ============================================================================
// モジュールインポート
// ============================================================================

import { generateCompletePrompt } from './promptEngine.js';
import { processLongText } from './textProcessor.js';
import GeminiClient from './geminiClient.js';

// ============================================================================
// 基本設定
// ============================================================================

const DEFAULT_SETTINGS = {
  apiProvider: 'gemini',
  model: 'gemini-1.5-flash',
  geminiApiKey: '',
  temperature: 0.2,
  defaultMode: 'lexicon',
  gradeLevel: 'junior',
  maxChunkSize: 800,
  maxRetries: 2,
  retryDelay: 1000,
  requestTimeout: 30000
};

// ============================================================================
// 設定管理
// ============================================================================

class SettingsManager {
  constructor() {
    this.defaultSettings = { ...DEFAULT_SETTINGS };
    this.settingsCache = null;
  }

  async getSettings(keys = null) {
    try {
      if (this.settingsCache) {
        return this._filterSettings(this.settingsCache, keys);
      }

      const stored = await this._getFromStorage(keys);
      const settings = this._mergeWithDefaults(stored);

      if (!keys) {
        this.settingsCache = settings;
      }

      return this._filterSettings(settings, keys);

    } catch (error) {
      console.error('Settings get error:', error);
      return this._filterSettings(this.defaultSettings, keys);
    }
  }

  async saveSettings(settings) {
    try {
      const validatedSettings = this._validateSettings(settings);
      await this._saveToStorage(validatedSettings);

      if (this.settingsCache) {
        this.settingsCache = { ...this.settingsCache, ...validatedSettings };
      }

      return true;

    } catch (error) {
      console.error('Settings save error:', error);
      return false;
    }
  }

  validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return { isValid: false, error: 'APIキーが空です' };
    }

    if (apiKey.length < 10) {
      return { isValid: false, error: 'APIキーが短すぎます' };
    }

    if (!apiKey.startsWith('AIza')) {
      return { isValid: false, error: 'Gemini APIキーの形式が正しくありません（AIza...で始まる必要があります）' };
    }

    return { isValid: true };
  }

  async _getFromStorage(keys) {
    return new Promise((resolve) => {
      const targetKeys = keys || Object.keys(this.defaultSettings);
      chrome.storage.sync.get(targetKeys, (result) => {
        resolve(result);
      });
    });
  }

  async _saveToStorage(settings) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  _mergeWithDefaults(stored) {
    return { ...this.defaultSettings, ...stored };
  }

  _filterSettings(settings, keys) {
    if (!keys) {
      return settings;
    }

    const filtered = {};
    const keyArray = Array.isArray(keys) ? keys : [keys];

    for (const key of keyArray) {
      if (key in settings) {
        filtered[key] = settings[key];
      }
    }

    return filtered;
  }

  _validateSettings(settings) {
    const validated = {};

    for (const [key, value] of Object.entries(settings)) {
      if (key in this.defaultSettings) {
        validated[key] = this._validateSettingValue(key, value);
      }
    }

    return validated;
  }

  _validateSettingValue(key, value) {
    const defaultValue = this.defaultSettings[key];
    const defaultType = typeof defaultValue;

    if (typeof value !== defaultType) {
      console.warn(`Setting ${key} type mismatch, using default:`, defaultValue);
      return defaultValue;
    }

    switch (key) {
      case 'temperature':
        return Math.max(0.0, Math.min(1.0, value));
      case 'maxChunkSize':
        return Math.max(100, Math.min(2000, value));
      case 'maxRetries':
        return Math.max(0, Math.min(10, value));
      case 'retryDelay':
        return Math.max(100, Math.min(10000, value));
      case 'requestTimeout':
        return Math.max(5000, Math.min(60000, value));
      default:
        return value;
    }
  }
}

// ============================================================================
// Gemini API クライアント（モジュール化済み）
// ============================================================================

// ============================================================================
// プロンプト生成（モジュール化済み）
// ============================================================================

// ============================================================================
// モジュール初期化
// ============================================================================

let modules = {};

function initializeModules() {
  try {
    const settingsManager = new SettingsManager();
    const geminiClient = new GeminiClient();

    modules = {
      settingsManager,
      geminiClient
    };

    console.log('ReadEasy.: All modules initialized successfully');
    return true;

  } catch (error) {
    console.error('ReadEasy.: Module initialization failed:', error);
    return false;
  }
}

// ============================================================================
// テキスト分割処理（モジュール化済み）
// ============================================================================

// ============================================================================
// テキスト変換処理
// ============================================================================

async function transformSingleText({ text, mode, level, apiKey, temperature, model }) {
  console.log('🔄 テキスト変換開始');
  console.log('📝 入力テキスト:', text.substring(0, 100) + '...');
  console.log('🎯 モード:', mode);
  console.log('📚 レベル:', level);
  console.log('🌡️ Temperature:', temperature);

  try {
    // 長文の場合はチャンク分割処理を使用
    if (text.length > 800) {
      console.log('📏 長文検出、チャンク分割処理を実行');
      const result = await processLongText({
        text,
        mode,
        level,
        apiKey,
        temperature,
        model,
        transformFunction: async (chunkData) => {
          // チャンクごとの処理を直接実行（再帰呼び出しを避ける）
          console.log('📝 チャンク処理実行:', chunkData.text.substring(0, 100) + '...');

          const prompt = generateCompletePrompt(chunkData.text, chunkData.mode, chunkData.level);
          const response = await modules.geminiClient.generateText(prompt, {
            apiKey: chunkData.apiKey,
            temperature: chunkData.temperature,
            model: chunkData.model,
            timeout: 30000
          });

          return response.text;
        }
      });

      // processLongTextの戻り値からtextプロパティを抽出
      return result.text;
    }

    // 通常の処理（短いテキスト）
    console.log('📝 通常処理を実行');

    // プロンプト生成
    console.log('🛠️ プロンプト生成中...');
    const prompt = generateCompletePrompt(text, mode, level);
    console.log('📋 生成されたプロンプト:', prompt.substring(0, 200) + '...');

    // API呼び出し
    console.log('🌐 API呼び出し中...');
    const response = await modules.geminiClient.generateText(prompt, {
      apiKey,
      temperature,
      model,
      timeout: 30000
    });

    console.log('✅ 変換完了:', response.text.substring(0, 100) + '...');
    return response.text;

  } catch (error) {
    console.error('❌ Transform error:', error);
    throw new Error(error.message || '変換に失敗しました');
  }
}

// ============================================================================
// メッセージハンドリング
// ============================================================================

async function handleMessage(request, sender, sendResponse) {
  try {
    // モジュールが未初期化の場合は初期化
    if (!modules.settingsManager) {
      const modulesInitialized = initializeModules();
      if (!modulesInitialized) {
        throw new Error('モジュールの初期化に失敗しました');
      }
    }

    switch (request.action) {
      case 'transform':
        await handleTransformRequest(request, sendResponse);
        break;

      case 'getSettings':
        await handleGetSettings(request, sendResponse);
        break;

      case 'saveSettings':
        await handleSaveSettings(request, sendResponse);
        break;

      case 'validateApiKey':
        await handleValidateApiKey(request, sendResponse);
        break;

      case 'openOptionsPage':
        await handleOpenOptionsPage(request, sendResponse);
        break;

      default:
        sendResponse({
          success: false,
          error: `未対応のアクション: ${request.action}`
        });
    }
  } catch (error) {
    console.error('ReadEasy.: Message handling error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function handleTransformRequest(request, sendResponse) {
  console.log('📨 変換リクエスト受信:', request);

  const { text, mode, level } = request;

  try {
    console.log('⚙️ 設定読み込み中...');
    const settings = await modules.settingsManager.getSettings([
      'geminiApiKey', 'temperature', 'defaultMode', 'gradeLevel', 'model'
    ]);
    console.log('📋 読み込まれた設定:', { ...settings, geminiApiKey: settings.geminiApiKey ? '設定済み' : '未設定' });

    if (!settings.geminiApiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    console.log('🚀 変換処理開始...');
    const result = await transformSingleText({
      text,
      mode: mode || settings.defaultMode,
      level: level || settings.gradeLevel,
      apiKey: settings.geminiApiKey,
      temperature: settings.temperature,
      model: settings.model
    });

    console.log('✅ 変換成功、レスポンス送信');

    // 長文処理の結果を適切に処理
    let responseResult = result;
    if (typeof result === 'object' && result.text) {
      // チャンク分割処理の結果
      responseResult = result.text;
      console.log(`📊 チャンク処理結果: ${result.totalChunks}チャンク中${result.successfulChunks}チャンク成功`);
    }

    sendResponse({
      success: true,
      result: responseResult,
      isLongText: typeof result === 'object' && result.chunks,
      chunkInfo: typeof result === 'object' && result.chunks ? {
        total: result.totalChunks,
        successful: result.successfulChunks
      } : null
    });

  } catch (error) {
    console.error('❌ 変換リクエスト処理エラー:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function handleGetSettings(request, sendResponse) {
  try {
    const settings = await modules.settingsManager.getSettings(request.keys);
    sendResponse({
      success: true,
      settings: settings
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function handleSaveSettings(request, sendResponse) {
  try {
    const success = await modules.settingsManager.saveSettings(request.settings);
    sendResponse({
      success: success
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function handleValidateApiKey(request, sendResponse) {
  try {
    const { apiKey } = request;

    if (!apiKey) {
      throw new Error('APIキーが指定されていません');
    }

    console.log('Starting API key validation...');
    const isValid = await modules.geminiClient.validateApiKey(apiKey);
    console.log('API key validation result:', isValid);

    sendResponse({
      success: true,
      valid: isValid
    });

  } catch (error) {
    console.error('API key validation handler error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function handleOpenOptionsPage(request, sendResponse) {
  try {
    console.log('Opening options page...');

    // オプションページを開く
    await chrome.runtime.openOptionsPage();

    sendResponse({
      success: true,
      message: 'Options page opened successfully'
    });

  } catch (error) {
    console.error('Failed to open options page:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// ============================================================================
// Service Worker イベントハンドラー
// ============================================================================

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  const modulesInitialized = initializeModules();

  if (modulesInitialized && modules.settingsManager) {
    const settings = await modules.settingsManager.getSettings();
    console.log('ReadEasy.: Initialized with settings:', settings);
  }
});

// Service Worker起動時の初期化
chrome.runtime.onStartup.addListener(async () => {
  initializeModules();
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true;
});

// アクションクリック時の処理
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // コンテンツスクリプトにフローティングポップアップの表示を指示
    await chrome.tabs.sendMessage(tab.id, {
      action: 'toggleFloatingPopup'
    });
  } catch (error) {
    console.error('Action click error:', error);
  }
});

console.log('ReadEasy.: Modular background script loaded');
