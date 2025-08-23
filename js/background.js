/**
 * Text-Simpler Background Script (MVP版)
 * Service Workerとして動作し、API呼び出しとメッセージ処理を担当
 * 全モジュールを統合してimport/exportの問題を回避
 */

// ===== Gemini API モジュール =====
const GeminiAPI = {
  /**
   * 統一インターフェース：テキスト変換
   * @param {Object} params - 変換パラメータ
   * @param {string} params.text - 変換対象テキスト
   * @param {string} params.mode - 変換モード ('simplify'|'concretize'|'abstract'|'grade')
   * @param {string} params.level - 学年レベル ('elementary'|'junior'|'senior')
   * @param {number} params.temperature - 温度パラメータ (0.0-1.0)
   * @param {string} params.apiKey - Gemini API キー
   * @returns {Promise<string>} - 変換されたテキスト
   */
  async transform({ text, mode, level, temperature = 0.2, apiKey }) {
    if (!apiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('変換対象のテキストが空です');
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent';

    try {
      const prompt = this._generatePrompt(text, mode, level);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: Math.max(0.0, Math.min(1.0, temperature)),
            topP: 0.8,
            topK: 40
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        this._handleApiError(response.status, errorText);
      }

      const data = await response.json();
      return this._extractResponseText(data);

    } catch (error) {
      console.error('Gemini API呼び出しエラー:', error);
      throw error;
    }
  },

  /**
   * プロンプト生成
   * @private
   */
  _generatePrompt(text, mode, level) {
    const baseInstructions = '事実を追加しない。固有名詞と数値は保持する。意味は変えない。出力は日本語の自然文のみ。';

    let systemPrompt = '';
    let userPrompt = '';

    switch (mode) {
      case 'simplify':
        systemPrompt = `あなたは日本語のリライト支援AI。専門用語をやさしい言葉に置き換え、文を短くし、意味は変えない。${baseInstructions}`;
        userPrompt = `以下の文章をわかりやすく書き直してください。\n---\n${text}\n---`;
        break;

      case 'concretize':
        systemPrompt = `抽象概念を具体例・手順・数値目安で補う。ただし事実の追加は禁止。推定は「例」として明示。${baseInstructions}`;
        userPrompt = `以下の文章を具体的に言い換え、例や手順を加えてください。\n---\n${text}\n---`;
        break;

      case 'abstract':
        systemPrompt = `具体例から本質を抽出し一般化する。個別事例名は必要時のみ保持。${baseInstructions}`;
        userPrompt = `以下の文章を抽象化し、原理や共通パターンを示してください。専門用語は最小限。\n---\n${text}\n---`;
        break;

      case 'grade':
        const gradeInfo = this._getGradeInfo(level);
        systemPrompt = `日本語の文章を${gradeInfo.name}向けに書き直す。平均文長${gradeInfo.maxLength}文字以下。${gradeInfo.description}。${baseInstructions}`;
        userPrompt = `以下の文章を${gradeInfo.name}向けにリライトしてください。\n---\n${text}\n---`;
        break;

      default:
        throw new Error(`未対応の変換モード: ${mode}`);
    }

    return `${systemPrompt}\n\n${userPrompt}`;
  },

  /**
   * 学年レベル情報取得
   * @private
   */
  _getGradeInfo(level) {
    const gradeMap = {
      'elementary': {
        name: '小学生',
        maxLength: 25,
        description: 'ひらがな多め、二重否定回避'
      },
      'junior': {
        name: '中学生',
        maxLength: 35,
        description: '基本語彙＋頻出専門語に簡単な注釈'
      },
      'senior': {
        name: '高校生',
        maxLength: 45,
        description: '論理接続明確、必要最小の専門語'
      }
    };

    return gradeMap[level] || gradeMap['junior'];
  },

  /**
   * APIエラーハンドリング
   * @private
   */
  _handleApiError(status, errorText) {
    switch (status) {
      case 401:
        throw new Error('認証エラー: APIキーが無効です');
      case 403:
        throw new Error('認証エラー: APIキーの権限が不足しています');
      case 429:
        throw new Error('レート制限: しばらく時間をおいて再試行してください');
      case 400:
        if (errorText.includes('quota')) {
          throw new Error('配額制限: APIの使用量上限に達しました');
        }
        throw new Error(`リクエストエラー: ${errorText}`);
      case 500:
      case 502:
      case 503:
        throw new Error('サーバーエラー: しばらく時間をおいて再試行してください');
      default:
        throw new Error(`API応答エラー (${status}): ${errorText}`);
    }
  },

  /**
   * レスポンステキスト抽出
   * @private
   */
  _extractResponseText(data) {
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text;
    } else if (data.content && data.content.parts && data.content.parts[0]) {
      return data.content.parts[0].text;
    } else {
      throw new Error('APIから有効なレスポンスが返されませんでした');
    }
  }
};

// ===== ストレージユーティリティ モジュール =====
const StorageUtils = {
  /**
   * 設定値を取得する
   * @param {string|Array<string>} keys - 取得する設定のキー
   * @returns {Promise<Object>} - 設定値
   */
  async getSettings(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => {
        resolve(result);
      });
    });
  },

  /**
   * 設定値を保存する
   * @param {Object} settings - 保存する設定
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, () => {
        resolve();
      });
    });
  },

  /**
   * デフォルト設定を取得
   * @returns {Object} - デフォルト設定
   */
  getDefaultSettings() {
    return {
      apiProvider: 'gemini',
      model: 'gemini-2.5-pro',
      temperature: 0.2,
      defaultMode: 'simplify',
      gradeLevel: 'junior',
      outputView: 'single',
      streaming: false
    };
  },

  /**
   * 設定を初期化（デフォルト値で補完）
   * @param {Object} settings - 現在の設定
   * @returns {Object} - 補完された設定
   */
  initializeSettings(settings) {
    const defaults = this.getDefaultSettings();
    return { ...defaults, ...settings };
  }
};

// ===== エラーハンドリング モジュール =====
const ErrorHandler = {
  /**
   * エラーを分類し、ユーザー向けメッセージを生成
   * @param {Error} error - エラーオブジェクト
   * @returns {Object} - {type, message, canRetry}
   */
  classifyError(error) {
    const message = error.message || 'Unknown error';

    // 認証エラー
    if (message.includes('認証エラー') || message.includes('APIキー')) {
      return {
        type: 'auth',
        message: 'APIキーが無効または未設定です。オプションページで設定してください。',
        canRetry: false
      };
    }

    // レート制限
    if (message.includes('レート制限') || message.includes('429')) {
      return {
        type: 'rate_limit',
        message: 'API使用量の制限に達しました。しばらく時間をおいて再試行してください。',
        canRetry: true
      };
    }

    // 配額制限
    if (message.includes('配額制限') || message.includes('quota')) {
      return {
        type: 'quota',
        message: 'APIの使用量上限に達しました。プランの確認または時間をおいて再試行してください。',
        canRetry: false
      };
    }

    // ネットワークエラー
    if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
      return {
        type: 'network',
        message: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
        canRetry: true
      };
    }

    // サーバーエラー
    if (message.includes('サーバーエラー') || message.includes('500') || message.includes('502') || message.includes('503')) {
      return {
        type: 'server',
        message: 'サーバーで一時的な問題が発生しています。しばらく時間をおいて再試行してください。',
        canRetry: true
      };
    }

    // 長文超過
    if (message.includes('長すぎる') || message.includes('too long') || message.includes('token')) {
      return {
        type: 'text_too_long',
        message: 'テキストが長すぎます。短いテキストを選択して再試行してください。',
        canRetry: false
      };
    }

    // その他のエラー
    return {
      type: 'unknown',
      message: `予期しないエラーが発生しました: ${message}`,
      canRetry: true
    };
  },

  /**
   * リトライ可能なエラーかどうかを判定
   * @param {Error} error - エラーオブジェクト
   * @returns {boolean}
   */
  canRetry(error) {
    const classified = this.classifyError(error);
    return classified.canRetry;
  },

  /**
   * 指数バックオフでリトライを実行
   * @param {Function} fn - 実行する関数
   * @param {number} maxRetries - 最大リトライ回数
   * @param {number} baseDelay - 基本遅延時間（ミリ秒）
   * @returns {Promise} - 実行結果
   */
  async retryWithBackoff(fn, maxRetries = 2, baseDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 最後の試行の場合はエラーを投げる
        if (attempt === maxRetries) {
          throw error;
        }

        // リトライ不可能なエラーの場合は即座に終了
        if (!this.canRetry(error)) {
          throw error;
        }

        // 指数バックオフで待機
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));

        console.log(`リトライ ${attempt + 1}/${maxRetries} を実行中...`);
      }
    }

    throw lastError;
  }
};

// ===== メイン処理 =====

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  // デフォルト設定の初期化
  const settings = await StorageUtils.getSettings([
    'apiProvider', 'model', 'temperature', 'defaultMode', 'gradeLevel', 'outputView', 'streaming'
  ]);

  const initializedSettings = StorageUtils.initializeSettings(settings);
  await StorageUtils.saveSettings(initializedSettings);

  console.log('Text-Simpler: Initialized with settings:', initializedSettings);
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 非同期処理のためにPromiseを返す
  handleMessage(request, sender, sendResponse);
  return true; // 非同期レスポンスを示す
});

/**
 * メッセージハンドリング
 */
async function handleMessage(request, sender, sendResponse) {
  try {
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

/**
 * テキスト変換リクエストの処理
 */
async function handleTransformRequest(request, sendResponse) {
  const { text, mode, level, chunks } = request;

  try {
    // 設定を取得
    const settings = await StorageUtils.getSettings([
      'geminiApiKey', 'temperature', 'defaultMode', 'gradeLevel'
    ]);

    if (!settings.geminiApiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    // 単一テキストの場合
    if (text && !chunks) {
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
      return;
    }

    // チャンク処理の場合
    if (chunks && Array.isArray(chunks)) {
      const results = await transformChunks({
        chunks,
        mode: mode || settings.defaultMode,
        level: level || settings.gradeLevel,
        apiKey: settings.geminiApiKey,
        temperature: settings.temperature
      });

      sendResponse({
        success: true,
        results: results
      });
      return;
    }

    throw new Error('無効なリクエスト形式です');

  } catch (error) {
    const classified = ErrorHandler.classifyError(error);
    sendResponse({
      success: false,
      error: classified.message,
      errorType: classified.type,
      canRetry: classified.canRetry
    });
  }
}

/**
 * 単一テキストの変換
 */
async function transformSingleText({ text, mode, level, apiKey, temperature }) {
  return await ErrorHandler.retryWithBackoff(async () => {
    return await GeminiAPI.transform({
      text,
      mode,
      level,
      temperature,
      apiKey
    });
  });
}

/**
 * チャンクの順次変換
 */
async function transformChunks({ chunks, mode, level, apiKey, temperature }) {
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const result = await transformSingleText({
        text: chunk.text,
        mode,
        level,
        apiKey,
        temperature
      });

      results.push({
        index: chunk.index,
        originalText: chunk.text,
        transformedText: result,
        success: true
      });

    } catch (error) {
      const classified = ErrorHandler.classifyError(error);
      results.push({
        index: chunk.index,
        originalText: chunk.text,
        error: classified.message,
        errorType: classified.type,
        success: false
      });

      // 認証エラーなど致命的なエラーの場合は処理を中断
      if (!classified.canRetry) {
        break;
      }
    }
  }

  return results;
}

/**
 * 設定取得の処理
 */
async function handleGetSettings(request, sendResponse) {
  try {
    const keys = request.keys || [
      'geminiApiKey', 'apiProvider', 'model', 'temperature',
      'defaultMode', 'gradeLevel', 'outputView', 'streaming'
    ];

    const settings = await StorageUtils.getSettings(keys);
    const initializedSettings = StorageUtils.initializeSettings(settings);

    sendResponse({
      success: true,
      settings: initializedSettings
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 設定保存の処理
 */
async function handleSaveSettings(request, sendResponse) {
  try {
    await StorageUtils.saveSettings(request.settings);
    sendResponse({
      success: true
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * APIキー検証の処理
 */
async function handleValidateApiKey(request, sendResponse) {
  try {
    const { apiKey } = request;

    if (!apiKey) {
      throw new Error('APIキーが指定されていません');
    }

    // 簡単なテストリクエストでAPIキーを検証
    const testResult = await GeminiAPI.transform({
      text: 'テスト',
      mode: 'simplify',
      level: 'junior',
      temperature: 0.2,
      apiKey
    });

    sendResponse({
      success: true,
      valid: true
    });

  } catch (error) {
    const classified = ErrorHandler.classifyError(error);
    sendResponse({
      success: false,
      valid: false,
      error: classified.message
    });
  }
}

console.log('Text-Simpler: Background script loaded');
