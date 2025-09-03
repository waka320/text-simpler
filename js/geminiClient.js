/**
 * Text-Simpler Gemini API Client Module
 * Gemini APIとの通信とレスポンス処理
 */

/**
 * Gemini API クライアントクラス
 */
class GeminiClient {
    constructor() {
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1/models';
        this.defaultModel = 'gemini-2.5-flash';
    }

    /**
     * テキスト生成APIを呼び出し
     */
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

    /**
     * APIキーの検証
     */
    async validateApiKey(apiKey) {
        try {
            const response = await this.generateText('Hello', { apiKey, maxOutputTokens: 10 });
            return true;
        } catch (error) {
            console.error('API key validation failed:', error);
            return false;
        }
    }

    /**
     * APIレスポンスからテキストを抽出
     */
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

// ES6モジュールとしてエクスポート
export default GeminiClient;
