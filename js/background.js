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

    console.log('🚀 Gemini API呼び出し開始');
    console.log('📝 プロンプト長:', prompt.length);
    console.log('🔑 APIキー:', apiKey ? `${apiKey.substring(0, 10)}...` : 'なし');
    console.log('🌡️ Temperature:', temperature);

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
        maxOutputTokens: 1024
      }
    };

    console.log('🌐 エンドポイント:', endpoint);
    console.log('📦 リクエストボディ:', JSON.stringify(requestBody, null, 2));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      console.log('⏰ リクエスト送信中...');
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

      console.log('📡 レスポンス受信:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API エラーレスポンス:', errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('📄 APIレスポンスデータ:', JSON.stringify(data, null, 2));

      const result = this._extractResponseText(data);
      console.log('✅ 抽出されたテキスト:', result);

      return result;

    } catch (error) {
      console.error('❌ Gemini API呼び出しエラー:', error);
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
    console.log('🔍 レスポンス解析開始');
    console.log('📊 データ構造:', {
      hasCandidates: !!data.candidates,
      candidatesLength: data.candidates?.length,
      hasError: !!data.error,
      dataKeys: Object.keys(data)
    });

    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];
      console.log('🎯 候補データ:', {
        hasContent: !!candidate.content,
        hasFinishReason: !!candidate.finishReason,
        finishReason: candidate.finishReason,
        candidateKeys: Object.keys(candidate)
      });

      if (candidate.content) {
        const content = candidate.content;
        console.log('📝 コンテンツデータ:', {
          hasParts: !!content.parts,
          partsLength: content.parts?.length,
          contentKeys: Object.keys(content)
        });

        if (content.parts && content.parts[0]) {
          const part = content.parts[0];
          console.log('📄 パートデータ:', {
            hasText: !!part.text,
            textLength: part.text?.length,
            partKeys: Object.keys(part)
          });

          if (part.text) {
            const extractedText = part.text.trim();
            console.log('✅ 抽出成功:', extractedText.substring(0, 100) + '...');
            return { text: extractedText };
          }
        }
      }

      // finishReasonをチェック
      if (candidate.finishReason === 'SAFETY') {
        throw new Error('コンテンツが安全性フィルターによってブロックされました');
      }

      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('生成されたテキストが長すぎます。短いテキストで再試行してください。');
      }

      if (candidate.finishReason === 'RECITATION') {
        throw new Error('著作権の問題により生成が停止されました');
      }

      if (candidate.finishReason === 'OTHER') {
        throw new Error('不明な理由により生成が停止されました');
      }
    }

    if (data.error) {
      console.error('🚨 APIエラー:', data.error);
      throw new Error(`API Error: ${data.error.message || 'Unknown error'}`);
    }

    console.error('❌ 予期しないレスポンス構造:', data);
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
    switch (mode) {
      case 'simplify':
        return `専門用語を簡単な言葉に変え、短い文で書き直してください。意味は変えずに。`;
      case 'concretize':
        return `抽象的な内容を具体例で説明してください。事実は追加しないでください。`;
      case 'abstract':
        return `具体例から共通点を見つけて、一般的な内容にしてください。`;
      case 'grade':
        const gradeInfo = this._getGradeInfo(level);
        return `${gradeInfo.name}にわかるように書き直してください。一文は${gradeInfo.maxLength}文字以下で。`;
      default:
        return `専門用語を簡単な言葉に変え、短い文で書き直してください。意味は変えずに。`;
    }
  }

  _getUserPrompt(text, mode, level) {
    return `次の文章を書き直してください：\n\n${text}`;
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
  console.log('🔄 テキスト変換開始');
  console.log('📝 入力テキスト:', text.substring(0, 100) + '...');
  console.log('🎯 モード:', mode);
  console.log('📚 レベル:', level);
  console.log('🌡️ Temperature:', temperature);

  try {
    // プロンプト生成
    console.log('🛠️ プロンプト生成中...');
    const prompt = modules.promptEngine.generatePrompt(text, mode, level);
    console.log('📋 生成されたプロンプト:', prompt.substring(0, 200) + '...');

    // API呼び出し
    console.log('🌐 API呼び出し中...');
    const response = await modules.geminiClient.generateText(prompt, {
      apiKey,
      temperature,
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
  console.log('📨 変換リクエスト受信:', request);

  const { text, mode, level } = request;

  try {
    console.log('⚙️ 設定読み込み中...');
    const settings = await modules.settingsManager.getSettings([
      'geminiApiKey', 'temperature', 'defaultMode', 'gradeLevel'
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
      temperature: settings.temperature
    });

    console.log('✅ 変換成功、レスポンス送信');
    sendResponse({
      success: true,
      result: result
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
