/**
 * Gemini APIを使用したテキスト処理機能
 */
export const GeminiAPI = {
  /**
   * テキストを簡略化する
   * @param {string} text - 簡略化する元のテキスト
   * @param {string} level - 難易度レベル (小学生, 中学生, 高校生, 大学生)
   * @param {string} apiKey - Gemini API キー
   * @returns {Promise<string>} - 簡略化されたテキスト
   */
  async simplifyText(text, level, apiKey) {
    if (!apiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent';
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `次の文章を${level}レベルに平易化してください。重要な専門用語や理解すべき単語には<mark>タグをつけてください:\n${text}`
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            topK: 40
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API応答エラー (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // レスポンスデータの解析
      let resultText = '';
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        resultText = data.candidates[0].content.parts[0].text;
      } else if (data.content && data.content.parts && data.content.parts[0]) {
        resultText = data.content.parts[0].text;
      } else {
        throw new Error('APIから有効なレスポンスが返されませんでした');
      }

      return resultText;
    } catch (error) {
      console.error('Gemini API呼び出しエラー:', error);
      throw error;
    }
  },
  
  /**
   * 単語の定義を取得する
   * @param {string} word - 定義を取得する単語
   * @param {string} apiKey - Gemini API キー
   * @returns {Promise<string>} - 単語の定義
   */
  async getWordDefinition(word, apiKey) {
    // 単語定義取得処理
  },
  
  /**
   * 利用可能なモデルの一覧を取得する
   * @param {string} apiKey - Gemini API キー
   * @returns {Promise<Array>} - 利用可能なモデルの一覧
   */
  async listAvailableModels(apiKey) {
    // モデル一覧取得処理
  }
};