/**
 * Text-Simpler Prompt Engine
 * プロンプト生成とカスタマイズのメインエンジン
 */

class PromptEngine {
    constructor(templateManager) {
        this.templateManager = templateManager || (typeof promptTemplateManager !== 'undefined' ? promptTemplateManager : null);
        if (!this.templateManager) {
            throw new Error('PromptTemplateManager is required');
        }
    }

    /**
     * プロンプトを生成
     * @param {string} text - 変換対象テキスト
     * @param {string} mode - 変換モード
     * @param {string} level - 学年レベル（gradeモード時のみ）
     * @param {Object} options - 追加オプション
     * @returns {string} 生成されたプロンプト
     */
    generatePrompt(text, mode, level = 'junior', options = {}) {
        try {
            // テキストの前処理
            const processedText = this._preprocessText(text, options);

            // システムプロンプトの生成
            const systemPrompt = this._generateSystemPrompt(mode, level, options);

            // ユーザープロンプトの生成
            const userPrompt = this._generateUserPrompt(mode, processedText, level, options);

            // 最終プロンプトの組み立て
            return this._assemblePrompt(systemPrompt, userPrompt, options);

        } catch (error) {
            console.error('Prompt generation error:', error);
            throw new Error(`プロンプト生成エラー: ${error.message}`);
        }
    }

    /**
     * システムプロンプトを生成
     * @private
     */
    _generateSystemPrompt(mode, level, options) {
        let template = this.templateManager.getSystemPromptTemplate(mode);
        const baseInstructions = this.templateManager.getBaseInstructions();

        // 基本指示の置換
        template = template.replace('{baseInstructions}', baseInstructions);

        // 学年モードの場合の特別処理
        if (mode === 'grade') {
            const gradeInfo = this.templateManager.getGradeInfo(level);
            template = template
                .replace('{gradeName}', gradeInfo.name)
                .replace('{maxLength}', gradeInfo.maxLength)
                .replace('{gradeDescription}', gradeInfo.description);
        }

        // カスタム置換処理
        if (options.customReplacements) {
            for (const [key, value] of Object.entries(options.customReplacements)) {
                template = template.replace(new RegExp(`{${key}}`, 'g'), value);
            }
        }

        return template;
    }

    /**
     * ユーザープロンプトを生成
     * @private
     */
    _generateUserPrompt(mode, text, level, options) {
        let template = this.templateManager.getUserPromptTemplate(mode);

        // テキストの置換
        template = template.replace('{text}', text);

        // 学年モードの場合の特別処理
        if (mode === 'grade') {
            const gradeInfo = this.templateManager.getGradeInfo(level);
            template = template.replace('{gradeName}', gradeInfo.name);
        }

        // カスタム置換処理
        if (options.customReplacements) {
            for (const [key, value] of Object.entries(options.customReplacements)) {
                template = template.replace(new RegExp(`{${key}}`, 'g'), value);
            }
        }

        return template;
    }

    /**
     * テキストの前処理
     * @private
     */
    _preprocessText(text, options) {
        let processedText = text.trim();

        // 長すぎるテキストの警告
        if (processedText.length > 10000) {
            console.warn('Text is very long, consider chunking:', processedText.length);
        }

        // カスタム前処理
        if (options.preprocessor && typeof options.preprocessor === 'function') {
            processedText = options.preprocessor(processedText);
        }

        // 改行の正規化
        if (options.normalizeLineBreaks !== false) {
            processedText = processedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        }

        // 余分な空白の除去
        if (options.trimExtraSpaces !== false) {
            processedText = processedText.replace(/\s+/g, ' ').trim();
        }

        return processedText;
    }

    /**
     * 最終プロンプトの組み立て
     * @private
     */
    _assemblePrompt(systemPrompt, userPrompt, options) {
        // デフォルトの組み立て方法
        let finalPrompt = `${systemPrompt}\n\n${userPrompt}`;

        // カスタム組み立て方法
        if (options.assembler && typeof options.assembler === 'function') {
            finalPrompt = options.assembler(systemPrompt, userPrompt);
        }

        // デバッグ情報の追加
        if (options.debug) {
            console.log('Generated prompt:', {
                systemPrompt,
                userPrompt,
                finalPrompt: finalPrompt.substring(0, 200) + '...'
            });
        }

        return finalPrompt;
    }

    /**
     * プロンプトの品質チェック
     * @param {string} prompt - チェック対象のプロンプト
     * @returns {Object} チェック結果
     */
    validatePrompt(prompt) {
        const issues = [];
        const warnings = [];

        // 長さチェック
        if (prompt.length < 10) {
            issues.push('プロンプトが短すぎます');
        }
        if (prompt.length > 50000) {
            warnings.push('プロンプトが非常に長いです');
        }

        // 必要な要素のチェック
        if (!prompt.includes('日本語')) {
            warnings.push('日本語指定が含まれていません');
        }

        // 禁止語句のチェック
        const forbiddenPhrases = ['事実を追加', '情報を作成'];
        for (const phrase of forbiddenPhrases) {
            if (prompt.includes(phrase)) {
                issues.push(`禁止語句が含まれています: ${phrase}`);
            }
        }

        return {
            isValid: issues.length === 0,
            issues,
            warnings,
            length: prompt.length
        };
    }

    /**
     * プロンプトテンプレートをカスタマイズ
     * @param {string} mode - モード名
     * @param {Object} customization - カスタマイズ内容
     */
    customizePromptTemplate(mode, customization) {
        if (customization.systemPrompt && customization.userPrompt) {
            this.templateManager.addCustomPrompt(mode, {
                system: customization.systemPrompt,
                user: customization.userPrompt
            });
        }
    }

    /**
     * 学年レベルをカスタマイズ
     * @param {string} level - レベル名
     * @param {Object} info - レベル情報
     */
    customizeGradeLevel(level, info) {
        this.templateManager.addCustomGradeLevel(level, info);
    }

    /**
     * プロンプト生成のプリセット
     */
    getPresets() {
        return {
            // 簡潔モード
            concise: {
                customReplacements: {
                    baseInstructions: '事実を追加しない。簡潔に。出力は日本語のみ。'
                }
            },

            // 詳細モード
            detailed: {
                customReplacements: {
                    baseInstructions: '事実を追加しない。詳しく説明。固有名詞と数値は保持。出力は日本語の自然文のみ。'
                }
            },

            // 技術文書モード
            technical: {
                customReplacements: {
                    baseInstructions: '技術的正確性を保持。専門用語は必要に応じて保持。出力は日本語の自然文のみ。'
                }
            }
        };
    }
}

// グローバルインスタンス
let promptEngine = null;

// 初期化関数
function initializePromptEngine() {
    if (typeof promptTemplateManager !== 'undefined') {
        promptEngine = new PromptEngine(promptTemplateManager);
    }
    return promptEngine;
}

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.PromptEngine = PromptEngine;
    window.initializePromptEngine = initializePromptEngine;
    window.promptEngine = promptEngine;
} else if (typeof global !== 'undefined') {
    global.PromptEngine = PromptEngine;
    global.initializePromptEngine = initializePromptEngine;
    global.promptEngine = promptEngine;
}
