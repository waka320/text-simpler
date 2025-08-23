/**
 * Text-Simpler API Error Handler
 * API通信エラーの分類と処理
 */

class ApiErrorHandler {
    constructor() {
        this.errorTypes = {
            AUTH: 'auth',
            RATE_LIMIT: 'rate_limit',
            QUOTA: 'quota',
            NETWORK: 'network',
            SERVER: 'server',
            TEXT_TOO_LONG: 'text_too_long',
            UNKNOWN: 'unknown'
        };
    }

    /**
     * エラーを分類し、ユーザー向けメッセージを生成
     * @param {Error} error - エラーオブジェクト
     * @param {number} statusCode - HTTPステータスコード
     * @param {string} responseText - レスポンステキスト
     * @returns {Object} - {type, message, canRetry, statusCode}
     */
    classifyError(error, statusCode = null, responseText = '') {
        const message = error.message || 'Unknown error';

        // HTTPステータスコードベースの分類
        if (statusCode) {
            return this._classifyByStatusCode(statusCode, responseText, message);
        }

        // メッセージベースの分類
        return this._classifyByMessage(message);
    }

    /**
     * HTTPステータスコードによる分類
     * @private
     */
    _classifyByStatusCode(statusCode, responseText, message) {
        switch (statusCode) {
            case 401:
                return {
                    type: this.errorTypes.AUTH,
                    message: 'APIキーが無効です。オプションページで正しいAPIキーを設定してください。',
                    canRetry: false,
                    statusCode
                };

            case 403:
                return {
                    type: this.errorTypes.AUTH,
                    message: 'APIキーの権限が不足しています。APIキーの設定を確認してください。',
                    canRetry: false,
                    statusCode
                };

            case 429:
                return {
                    type: this.errorTypes.RATE_LIMIT,
                    message: 'API使用量の制限に達しました。しばらく時間をおいて再試行してください。',
                    canRetry: true,
                    statusCode,
                    retryAfter: this._extractRetryAfter(responseText)
                };

            case 400:
                if (responseText.includes('quota') || responseText.includes('billing')) {
                    return {
                        type: this.errorTypes.QUOTA,
                        message: 'APIの使用量上限に達しました。プランの確認または時間をおいて再試行してください。',
                        canRetry: false,
                        statusCode
                    };
                }
                if (responseText.includes('too long') || responseText.includes('token')) {
                    return {
                        type: this.errorTypes.TEXT_TOO_LONG,
                        message: 'テキストが長すぎます。短いテキストを選択して再試行してください。',
                        canRetry: false,
                        statusCode
                    };
                }
                return {
                    type: this.errorTypes.UNKNOWN,
                    message: `リクエストエラー: ${responseText || message}`,
                    canRetry: false,
                    statusCode
                };

            case 500:
            case 502:
            case 503:
            case 504:
                return {
                    type: this.errorTypes.SERVER,
                    message: 'サーバーで一時的な問題が発生しています。しばらく時間をおいて再試行してください。',
                    canRetry: true,
                    statusCode
                };

            default:
                return {
                    type: this.errorTypes.UNKNOWN,
                    message: `API応答エラー (${statusCode}): ${responseText || message}`,
                    canRetry: statusCode >= 500,
                    statusCode
                };
        }
    }

    /**
     * メッセージによる分類
     * @private
     */
    _classifyByMessage(message) {
        // 認証エラー
        if (message.includes('認証エラー') || message.includes('APIキー') || message.includes('unauthorized')) {
            return {
                type: this.errorTypes.AUTH,
                message: 'APIキーが無効または未設定です。オプションページで設定してください。',
                canRetry: false
            };
        }

        // レート制限
        if (message.includes('レート制限') || message.includes('rate limit') || message.includes('429')) {
            return {
                type: this.errorTypes.RATE_LIMIT,
                message: 'API使用量の制限に達しました。しばらく時間をおいて再試行してください。',
                canRetry: true
            };
        }

        // 配額制限
        if (message.includes('配額制限') || message.includes('quota') || message.includes('billing')) {
            return {
                type: this.errorTypes.QUOTA,
                message: 'APIの使用量上限に達しました。プランの確認または時間をおいて再試行してください。',
                canRetry: false
            };
        }

        // ネットワークエラー
        if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch') || message.includes('NetworkError')) {
            return {
                type: this.errorTypes.NETWORK,
                message: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
                canRetry: true
            };
        }

        // サーバーエラー
        if (message.includes('サーバーエラー') || message.includes('500') || message.includes('502') || message.includes('503')) {
            return {
                type: this.errorTypes.SERVER,
                message: 'サーバーで一時的な問題が発生しています。しばらく時間をおいて再試行してください。',
                canRetry: true
            };
        }

        // 長文超過
        if (message.includes('長すぎる') || message.includes('too long') || message.includes('token')) {
            return {
                type: this.errorTypes.TEXT_TOO_LONG,
                message: 'テキストが長すぎます。短いテキストを選択して再試行してください。',
                canRetry: false
            };
        }

        // その他のエラー
        return {
            type: this.errorTypes.UNKNOWN,
            message: `予期しないエラーが発生しました: ${message}`,
            canRetry: true
        };
    }

    /**
     * リトライ可能なエラーかどうかを判定
     * @param {Object} classifiedError - 分類されたエラー
     * @returns {boolean}
     */
    canRetry(classifiedError) {
        return classifiedError.canRetry === true;
    }

    /**
     * 指数バックオフでリトライを実行
     * @param {Function} fn - 実行する関数
     * @param {number} maxRetries - 最大リトライ回数
     * @param {number} baseDelay - 基本遅延時間（ミリ秒）
     * @param {Function} onRetry - リトライ時のコールバック
     * @returns {Promise} - 実行結果
     */
    async retryWithBackoff(fn, maxRetries = 2, baseDelay = 1000, onRetry = null) {
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

                // エラーを分類
                const classified = this.classifyError(error);

                // リトライ不可能なエラーの場合は即座に終了
                if (!this.canRetry(classified)) {
                    throw error;
                }

                // 指数バックオフで待機
                const delay = this._calculateDelay(baseDelay, attempt, classified);
                await this._delay(delay);

                // リトライコールバック
                if (onRetry) {
                    onRetry(attempt + 1, maxRetries, delay, classified);
                }

                console.log(`Text-Simpler: リトライ ${attempt + 1}/${maxRetries} を実行中...`);
            }
        }

        throw lastError;
    }

    /**
     * 遅延時間を計算
     * @private
     */
    _calculateDelay(baseDelay, attempt, classifiedError) {
        let delay = baseDelay * Math.pow(2, attempt);

        // レート制限の場合は特別な処理
        if (classifiedError.type === this.errorTypes.RATE_LIMIT && classifiedError.retryAfter) {
            delay = Math.max(delay, classifiedError.retryAfter * 1000);
        }

        // ジッターを追加（最大25%のランダム性）
        const jitter = delay * 0.25 * Math.random();
        return Math.floor(delay + jitter);
    }

    /**
     * 遅延実行
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry-Afterヘッダーから秒数を抽出
     * @private
     */
    _extractRetryAfter(responseText) {
        try {
            const match = responseText.match(/retry-after[:\s]+(\d+)/i);
            return match ? parseInt(match[1], 10) : null;
        } catch {
            return null;
        }
    }

    /**
     * エラー統計を記録
     * @param {Object} classifiedError - 分類されたエラー
     */
    recordError(classifiedError) {
        // 将来的にエラー統計を記録する場合の拡張ポイント
        console.log('API Error recorded:', {
            type: classifiedError.type,
            timestamp: new Date().toISOString(),
            canRetry: classifiedError.canRetry
        });
    }

    /**
     * カスタムエラー分類ルールを追加
     * @param {Function} classifier - カスタム分類関数
     */
    addCustomClassifier(classifier) {
        const originalClassify = this.classifyError.bind(this);
        this.classifyError = (error, statusCode, responseText) => {
            const customResult = classifier(error, statusCode, responseText);
            if (customResult) {
                return customResult;
            }
            return originalClassify(error, statusCode, responseText);
        };
    }
}

// グローバルインスタンス
const apiErrorHandler = new ApiErrorHandler();

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.ApiErrorHandler = ApiErrorHandler;
    window.apiErrorHandler = apiErrorHandler;
} else if (typeof global !== 'undefined') {
    global.ApiErrorHandler = ApiErrorHandler;
    global.apiErrorHandler = apiErrorHandler;
}
