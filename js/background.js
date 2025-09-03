/**
 * Text-Simpler Background Script (シンプル版)
 * Manifest V3対応のService Worker
 */

// ============================================================================
// 基本設定
// ============================================================================

const DEFAULT_SETTINGS = {
  apiProvider: 'gemini',
  model: 'gemini-2.5-flash',
  geminiApiKey: '',
  temperature: 0.2,
  defaultMode: 'lexicon',
  gradeLevel: 'junior',
  maxChunkSize: 300,
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
    this.defaultModel = 'gemini-2.5-flash';
  }

  async generateText(prompt, options = {}) {
    const { apiKey, temperature = 0.2, timeout = 30000, model = this.defaultModel } = options;

    console.log('🚀 Gemini API呼び出し開始');
    console.log('📝 プロンプト長:', prompt.length);
    console.log('🔑 APIキー:', apiKey ? `${apiKey.substring(0, 10)}...` : 'なし');
    console.log('🌡️ Temperature:', temperature);

    if (!apiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    const endpoint = `${this.baseUrl}/${model}:generateContent`;
    console.log('🤖 使用モデル:', model);
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
    // 共通方針（簡潔版）
    const commonPolicy = `やさしい日本語で変換。一文一義、固有名詞・数値・記号・否定・範囲を保持。二重否定回避、外来語に注意。事実は追加しない。`;

    let levelInfo = '';
    if (level && level !== 'none') {
      const gradeInfo = this._getGradeInfo(level);
      levelInfo = `${gradeInfo.name}レベル（文長≤${gradeInfo.maxLength}字）。`;
    }

    switch (mode) {
      case 'lexicon':
        return `${commonPolicy}${levelInfo}難語に注釈、指示語を具体化、記号の意味を明記。`;
      case 'load':
        return `${commonPolicy}${levelInfo}一文一義、目的→結論→要旨→本文の順。`;
      case 'cohesion':
        return `${commonPolicy}${levelInfo}接続詞追加、主語再掲、前提補足。`;
      // 後方互換性のため旧モードも残す
      case 'simplify':
        return `${commonPolicy}${levelInfo}簡単な言葉で短く。`;
      case 'concretize':
        return `${commonPolicy}${levelInfo}具体例で説明。`;
      case 'abstract':
        return `${commonPolicy}${levelInfo}要点をまとめる。`;
      case 'grade':
        const gradeInfo = this._getGradeInfo(level);
        return `${commonPolicy}${gradeInfo.name}向けに変換。`;
      default:
        return `${commonPolicy}${levelInfo}語・記号の意味を明確化。`;
    }
  }

  _getUserPrompt(text, mode, level) {
    switch (mode) {
      case 'lexicon':
        return `次の文を語と記号の意味が分かるように直してください。--- ${text} ---`;
      case 'load':
        return `次の文は情報が多いので、目的→結論→要旨→本文の順に短く並べ替え、文を分割してください。--- ${text} ---`;
      case 'cohesion':
        return `次の文のつながりが分かるように、接続詞を足し、指示語を具体化し、必要なら前提を一文で補ってください。--- ${text} ---`;
      // 後方互換性のため旧モードも残す
      case 'simplify':
      case 'concretize':
      case 'abstract':
      case 'grade':
      default:
        return text;
    }
  }

  _getGradeInfo(level) {
    const gradeLevels = {
      none: {
        name: 'なし',
        maxLength: 0,
        description: 'レベル指定なし'
      },
      kindergarten: {
        name: '幼稚園児',
        maxLength: 20,
        description: 'ひらがな中心、短文、簡単な言葉のみ'
      },
      elementary: {
        name: '小学生',
        maxLength: 25,
        description: 'ひらがな多め、二重否定回避'
      },
      junior: {
        name: '中学生',
        maxLength: 35,
        description: '基本語彙＋頻出専門語に簡注'
      },
      senior: {
        name: '高校生',
        maxLength: 45,
        description: '論理接続を明確、専門語は最小限'
      },
      university: {
        name: '大学生',
        maxLength: 60,
        description: '専門用語可、論理的構成重視'
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
// テキスト分割処理
// ============================================================================

/**
 * 長いテキストを適切なサイズのチャンクに分割
 */
function splitTextIntoChunks(text, maxChunkSize = 800) {
  const chunks = [];

  // テキストが短い場合は分割不要
  if (text.length <= maxChunkSize) {
    return [text];
  }

  // 文単位で分割（句点、感嘆符、疑問符で区切る）
  const sentences = text.split(/[。！？]/).filter(s => s.trim().length > 0);

  let currentChunk = '';

  for (const sentence of sentences) {
    const sentenceWithPunctuation = sentence + '。';

    // 現在のチャンクに文を追加した場合の長さをチェック
    if ((currentChunk + sentenceWithPunctuation).length > maxChunkSize && currentChunk.length > 0) {
      // チャンクが満杯になったら保存して新しいチャンクを開始
      chunks.push(currentChunk.trim());
      currentChunk = sentenceWithPunctuation;
    } else {
      // チャンクに文を追加
      currentChunk += sentenceWithPunctuation;
    }
  }

  // 最後のチャンクを追加
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // チャンクが空の場合は元のテキストをそのまま返す
  if (chunks.length === 0) {
    return [text];
  }

  return chunks;
}

/**
 * 複数のチャンクを段階的に処理
 */
async function processLongText({ text, mode, level, apiKey, temperature, model }) {
  console.log('📏 長文処理開始、テキスト長:', text.length);

  // テキストをチャンクに分割
  const chunks = splitTextIntoChunks(text);
  console.log('🔀 チャンク数:', chunks.length);

  if (chunks.length === 1) {
    // 単一チャンクの場合は通常処理
    console.log('📝 単一チャンク、通常処理を実行');
    return await transformSingleText({ text, mode, level, apiKey, temperature, model });
  }

  // 複数チャンクの場合は段階的処理
  console.log('🔄 複数チャンク、段階的処理を実行');
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`📋 チャンク ${i + 1}/${chunks.length} 処理中 (${chunk.length}文字)`);

    try {
      const result = await transformSingleText({
        text: chunk,
        mode,
        level,
        apiKey,
        temperature,
        model
      });

      results.push({
        chunkIndex: i,
        originalText: chunk,
        transformedText: result,
        success: true
      });

      console.log(`✅ チャンク ${i + 1} 処理完了`);

    } catch (error) {
      console.error(`❌ チャンク ${i + 1} 処理エラー:`, error);
      results.push({
        chunkIndex: i,
        originalText: chunk,
        error: error.message,
        success: false
      });
    }

    // チャンク間で少し待機（API制限を考慮）
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 結果を統合
  const successfulResults = results.filter(r => r.success);
  if (successfulResults.length === 0) {
    throw new Error('すべてのチャンクの処理に失敗しました');
  }

  // 変換されたテキストを結合
  const combinedText = successfulResults
    .map(r => r.transformedText)
    .join('\n\n');

  console.log('🎯 長文処理完了、統合テキスト長:', combinedText.length);

  return {
    text: combinedText,
    chunks: results,
    totalChunks: chunks.length,
    successfulChunks: successfulResults.length
  };
}

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
      return await processLongText({ text, mode, level, apiKey, temperature, model });
    }

    // 通常の処理（短いテキスト）
    console.log('📝 通常処理を実行');

    // プロンプト生成
    console.log('🛠️ プロンプト生成中...');
    const prompt = modules.promptEngine.generatePrompt(text, mode, level);
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

console.log('Text-Simpler: Simple background script loaded');
