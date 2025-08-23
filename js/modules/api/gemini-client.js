/**
 * Text-Simpler Gemini API Client
 * Gemini APIとの通信を担当
 */

class GeminiClient {
    constructor(errorHandler) {
        this.errorHandler = errorHandler || (typeof apiErrorHandler !== 'undefined' ? apiErrorHandler : null);
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1/models';
        this.defaultModel = 'gemini-2.5-pro';
        this.defaultConfig = {
            temperature: 0.2,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 2048
        };
    }

    /**
     * テキスト変換を実行
     * @param {Object} params - 変換パラメータ
     * @param {string} params.prompt - 生成されたプロンプト
     * @param {string} params.apiKey - Gemini API キー
     * @param {string} params.model - 使用するモデル
     * @param {Object} params.config - 生成設定
     * @returns {Promise<string>} - 変換されたテキスト
     */
    async transform({ prompt, apiKey, model = null, config = {} }) {
        if (!apiKey) {
            throw new Error('Gemini APIキーが設定されていません');
        }

        if (!prompt || prompt.trim().length === 0) {
            throw new Error('プロンプトが空です');
        }

        const targetModel = model || this.defaultModel;
        const endpoint = `${this.baseUrl}/${targetModel}:generateContent`;

        try {
            const requestBody = this._buildRequestBody(prompt, config);
            const response = await this._makeRequest(endpoint, apiKey, requestBody);

            if (!response.ok) {
                const errorText = await response.text();
                const error = new Error(`API request failed: ${errorText}`);

                if (this.errorHandler) {
                    const classified = this.errorHandler.classifyError(error, response.status, errorText);
                    this.errorHandler.recordError(classified);
                    throw new Error(classified.message);
                }

                throw error;
            }

            const data = await response.json();
            return this._extractResponseText(data);

        } catch (error) {
            console.error('Gemini API呼び出しエラー:', error);

            if (this.errorHandler && !error.message.includes('API request failed')) {
                const classified = this.errorHandler.classifyError(error);
                this.errorHandler.recordError(classified);
                throw new Error(classified.message);
            }

            throw error;
        }
    }

    /**
     * リトライ付きでテキスト変換を実行
     * @param {Object} params - 変換パラメータ
     * @param {Object} retryOptions - リトライオプション
     * @returns {Promise<string>} - 変換されたテキスト
     */
    async transformWithRetry(params, retryOptions = {}) {
        const {
            maxRetries = 2,
            baseDelay = 1000,
            onRetry = null
        } = retryOptions;

        if (!this.errorHandler) {
            return this.transform(params);
        }

        return this.errorHandler.retryWithBackoff(
            () => this.transform(params),
            maxRetries,
            baseDelay,
            onRetry
        );
    }

    /**
     * APIキーの有効性をテスト
     * @param {string} apiKey - テストするAPIキー
     * @returns {Promise<boolean>} - 有効かどうか
     */
    async validateApiKey(apiKey) {
        try {
            await this.transform({
                prompt: 'テスト',
                apiKey,
                config: { maxOutputTokens: 10 }
            });
            return true;
        } catch (error) {
            console.log('API key validation failed:', error.message);
            return false;
        }
    }

    /**
     * 利用可能なモデル一覧を取得
     * @param {string} apiKey - APIキー
     * @returns {Promise<Array>} - モデル一覧
     */
    async listModels(apiKey) {
        if (!apiKey) {
            throw new Error('APIキーが必要です');
        }

        const endpoint = `${this.baseUrl}`;

        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'x-goog-api-key': apiKey
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();
            return data.models || [];

        } catch (error) {
            console.error('Models list fetch error:', error);
            throw error;
        }
    }

    /**
     * リクエストボディを構築
     * @private
     */
    _buildRequestBody(prompt, config) {
        const generationConfig = {
            ...this.defaultConfig,
            ...config
        };

        // 設定値の検証
        generationConfig.temperature = Math.max(0.0, Math.min(1.0, generationConfig.temperature));
        generationConfig.topP = Math.max(0.0, Math.min(1.0, generationConfig.topP));
        generationConfig.topK = Math.max(1, Math.min(100, generationConfig.topK));

        return {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig,
            safetySettings: this._getSafetySettings()
        };
    }

    /**
     * HTTPリクエストを実行
     * @private
     */
    async _makeRequest(endpoint, apiKey, requestBody) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト

        try {
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
            return response;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('リクエストがタイムアウトしました');
            }
            throw error;
        }
    }

    /**
     * レスポンステキストを抽出
     * @private
     */
    _extractResponseText(data) {
        // 標準的なレスポンス構造
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const content = data.candidates[0].content;
            if (content.parts && content.parts[0] && content.parts[0].text) {
                return content.parts[0].text.trim();
            }
        }

        // 代替的なレスポンス構造
        if (data.content && data.content.parts && data.content.parts[0]) {
            return data.content.parts[0].text.trim();
        }

        // エラーレスポンスの場合
        if (data.error) {
            throw new Error(`API Error: ${data.error.message || 'Unknown error'}`);
        }

        // 安全性フィルターでブロックされた場合
        if (data.candidates && data.candidates[0] && data.candidates[0].finishReason === 'SAFETY') {
            throw new Error('コンテンツが安全性フィルターによってブロックされました');
        }

        throw new Error('APIから有効なレスポンスが返されませんでした');
    }

    /**
     * 安全性設定を取得
     * @private
     */
    _getSafetySettings() {
        return [
            {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            }
        ];
    }

    /**
     * 設定を更新
     * @param {Object} newConfig - 新しい設定
     */
    updateConfig(newConfig) {
        this.defaultConfig = { ...this.defaultConfig, ...newConfig };
    }

    /**
     * モデルを変更
     * @param {string} model - 新しいモデル名
     */
    setModel(model) {
        this.defaultModel = model;
    }

    /**
     * 使用統計を取得（将来の拡張用）
     * @returns {Object} - 使用統計
     */
    getUsageStats() {
        // 将来的に使用統計を追跡する場合の拡張ポイント
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0
        };
    }
}

// グローバルインスタンス
let geminiClient = null;

// 初期化関数
function initializeGeminiClient() {
    if (typeof apiErrorHandler !== 'undefined') {
        geminiClient = new GeminiClient(apiErrorHandler);
    } else {
        geminiClient = new GeminiClient();
    }
    return geminiClient;
}

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.GeminiClient = GeminiClient;
    window.initializeGeminiClient = initializeGeminiClient;
    window.geminiClient = geminiClient;
} else if (typeof global !== 'undefined') {
    global.GeminiClient = GeminiClient;
    global.initializeGeminiClient = initializeGeminiClient;
    global.geminiClient = geminiClient;
}
