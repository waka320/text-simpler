/**
 * Text-Simpler Background Script (シンプル版)
 * Manifest V3対応のService Worker
 */

// ============================================================================
// 基本設定
// ============================================================================

const DEFAULT_SETTINGS = {
  apiProvider: 'gemini',
  model: 'gemini-2.5-pro',
  geminiApiKey: '',
  temperature: 0.2,
  defaultMode: 'simplify',
  gradeLevel: 'junior',
  maxChunkSize: 600,
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
// Gemini API クライアント
// ============================================================================

class GeminiClient {
  constructor() {
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1/models';
    this.defaultModel = 'gemini-2.5-pro';
  }

  async generateText(prompt, options = {}) {
    const { apiKey, temperature = 0.2, timeout = 30000 } = options;

    if (!apiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    const endpoint = `${this.baseUrl}/${this.defaultModel}:generateContent`;
    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: temperature,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048
      }
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return this._extractResponseText(data);

    } catch (error) {
      console.error('Gemini API呼び出しエラー:', error);
      throw error;
    }
  }

  async validateApiKey(apiKey) {
    try {
      const response = await this.generateText('Hello', { apiKey, maxOutputTokens: 10 });
      return true;
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }

  _extractResponseText(data) {
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const content = data.candidates[0].content;
      if (content.parts && content.parts[0] && content.parts[0].text) {
        return { text: content.parts[0].text.trim() };
      }
    }

    if (data.error) {
      throw new Error(`API Error: ${data.error.message || 'Unknown error'}`);
    }

    throw new Error('APIから有効なレスポンスが返されませんでした');
  }
}

// ============================================================================
// プロンプト生成
// ============================================================================

class PromptEngine {
  generatePrompt(text, mode, level = 'junior') {
    const systemPrompt = this._getSystemPrompt(mode, level);
    const userPrompt = this._getUserPrompt(text, mode, level);
    return `${systemPrompt}\n\n${userPrompt}`;
  }

  _getSystemPrompt(mode, level) {
    const baseInstructions = '事実を追加しない。固有名詞と数値は保持する。意味は変えない。出力は日本語の自然文のみ。';

    switch (mode) {
      case 'simplify':
        return `あなたは日本語のリライト支援AI。専門用語をやさしい言葉に置き換え、文を短くし、意味は変えない。${baseInstructions}`;
      case 'concretize':
        return `抽象概念を具体例・手順・数値目安で補う。ただし事実の追加は禁止。推定は「例」として明示。${baseInstructions}`;
      case 'abstract':
        return `具体例から本質を抽出し一般化する。個別事例名は必要時のみ保持。${baseInstructions}`;
      case 'grade':
        const gradeInfo = this._getGradeInfo(level);
        return `日本語の文章を${gradeInfo.name}向けに書き直す。平均文長${gradeInfo.maxLength}文字以下。${gradeInfo.description}。${baseInstructions}`;
      default:
        return `あなたは日本語のリライト支援AI。専門用語をやさしい言葉に置き換え、文を短くし、意味は変えない。${baseInstructions}`;
    }
  }

  _getUserPrompt(text, mode, level) {
    switch (mode) {
      case 'grade':
        const gradeInfo = this._getGradeInfo(level);
        return `以下の文章を${gradeInfo.name}向けにリライトしてください。\n---\n${text}\n---`;
      default:
        return `以下の文章を${mode === 'simplify' ? 'わかりやすく' : mode === 'concretize' ? '具体的に' : '抽象化して'}書き直してください。\n---\n${text}\n---`;
    }
  }

  _getGradeInfo(level) {
    const gradeLevels = {
      elementary: {
        name: '小学生',
        maxLength: 25,
        description: 'ひらがな多め、二重否定回避'
      },
      junior: {
        name: '中学生',
        maxLength: 35,
        description: '基本語彙＋頻出専門語に簡単な注釈'
      },
      senior: {
        name: '高校生',
        maxLength: 45,
        description: '論理接続明確、必要最小の専門語'
      }
    };

    return gradeLevels[level] || gradeLevels.junior;
  }
}

// ============================================================================
// モジュール初期化
// ============================================================================

let modules = {};

function initializeModules() {
  try {
    const settingsManager = new SettingsManager();
    const geminiClient = new GeminiClient();
    const promptEngine = new PromptEngine();

    modules = {
      settingsManager,
      geminiClient,
      promptEngine
    };

    console.log('Text-Simpler: All modules initialized successfully');
    return true;

  } catch (error) {
    console.error('Text-Simpler: Module initialization failed:', error);
    return false;
  }
}

// ============================================================================
// テキスト変換処理
// ============================================================================

async function transformSingleText({ text, mode, level, apiKey, temperature }) {
  try {
    // プロンプト生成
    const prompt = modules.promptEngine.generatePrompt(text, mode, level);

    // API呼び出し
    const response = await modules.geminiClient.generateText(prompt, {
      apiKey,
      temperature,
      timeout: 30000
    });

    return response.text;

  } catch (error) {
    console.error('Transform error:', error);
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

      default:
        sendResponse({
          success: false,
          error: `未対応のアクション: ${request.action}`
        });
    }
  } catch (error) {
    console.error('Text-Simpler: Message handling error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function handleTransformRequest(request, sendResponse) {
  const { text, mode, level } = request;

  try {
    const settings = await modules.settingsManager.getSettings([
      'geminiApiKey', 'temperature', 'defaultMode', 'gradeLevel'
    ]);

    if (!settings.geminiApiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    const result = await transformSingleText({
      text,
      mode: mode || settings.defaultMode,
      level: level || settings.gradeLevel,
      apiKey: settings.geminiApiKey,
      temperature: settings.temperature
    });

    sendResponse({
      success: true,
      result: result
    });

  } catch (error) {
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
      valid: false,
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
    console.log('Text-Simpler: Initialized with settings:', settings);
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

console.log('Text-Simpler: Simple background script loaded');
