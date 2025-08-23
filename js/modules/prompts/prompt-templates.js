/**
 * Text-Simpler Prompt Templates
 * プロンプトテンプレートの定義と管理
 */

// プロンプトテンプレートの定義
const PROMPT_TEMPLATES = {
    // 基本指示
    BASE_INSTRUCTIONS: '事実を追加しない。固有名詞と数値は保持する。意味は変えない。出力は日本語の自然文のみ。',

    // モード別システムプロンプト
    SYSTEM_PROMPTS: {
        simplify: 'あなたは日本語のリライト支援AI。専門用語をやさしい言葉に置き換え、文を短くし、意味は変えない。{baseInstructions}',
        concretize: '抽象概念を具体例・手順・数値目安で補う。ただし事実の追加は禁止。推定は「例」として明示。{baseInstructions}',
        abstract: '具体例から本質を抽出し一般化する。個別事例名は必要時のみ保持。{baseInstructions}',
        grade: '日本語の文章を{gradeName}向けに書き直す。平均文長{maxLength}文字以下。{gradeDescription}。{baseInstructions}'
    },

    // モード別ユーザープロンプト
    USER_PROMPTS: {
        simplify: '以下の文章をわかりやすく書き直してください。\n---\n{text}\n---',
        concretize: '以下の文章を具体的に言い換え、例や手順を加えてください。\n---\n{text}\n---',
        abstract: '以下の文章を抽象化し、原理や共通パターンを示してください。専門用語は最小限。\n---\n{text}\n---',
        grade: '以下の文章を{gradeName}向けにリライトしてください。\n---\n{text}\n---'
    },

    // 学年レベル情報
    GRADE_LEVELS: {
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
    },

    // 拡張可能なカスタムプロンプト
    CUSTOM_PROMPTS: {
        // カスタムプロンプトはここに追加可能
        // 例: business: { system: '...', user: '...' }
    }
};

// プロンプトテンプレート管理クラス
class PromptTemplateManager {
    constructor() {
        this.templates = { ...PROMPT_TEMPLATES };
    }

    /**
     * システムプロンプトテンプレートを取得
     * @param {string} mode - 変換モード
     * @returns {string} システムプロンプトテンプレート
     */
    getSystemPromptTemplate(mode) {
        return this.templates.SYSTEM_PROMPTS[mode] || this.templates.SYSTEM_PROMPTS.simplify;
    }

    /**
     * ユーザープロンプトテンプレートを取得
     * @param {string} mode - 変換モード
     * @returns {string} ユーザープロンプトテンプレート
     */
    getUserPromptTemplate(mode) {
        return this.templates.USER_PROMPTS[mode] || this.templates.USER_PROMPTS.simplify;
    }

    /**
     * 学年レベル情報を取得
     * @param {string} level - 学年レベル
     * @returns {Object} 学年レベル情報
     */
    getGradeInfo(level) {
        return this.templates.GRADE_LEVELS[level] || this.templates.GRADE_LEVELS.junior;
    }

    /**
     * 基本指示を取得
     * @returns {string} 基本指示
     */
    getBaseInstructions() {
        return this.templates.BASE_INSTRUCTIONS;
    }

    /**
     * カスタムプロンプトを追加
     * @param {string} mode - モード名
     * @param {Object} prompts - プロンプト定義
     * @param {string} prompts.system - システムプロンプト
     * @param {string} prompts.user - ユーザープロンプト
     */
    addCustomPrompt(mode, prompts) {
        this.templates.CUSTOM_PROMPTS[mode] = prompts;
        this.templates.SYSTEM_PROMPTS[mode] = prompts.system;
        this.templates.USER_PROMPTS[mode] = prompts.user;
    }

    /**
     * カスタム学年レベルを追加
     * @param {string} level - レベル名
     * @param {Object} info - レベル情報
     */
    addCustomGradeLevel(level, info) {
        this.templates.GRADE_LEVELS[level] = info;
    }

    /**
     * テンプレートをリセット
     */
    resetToDefaults() {
        this.templates = { ...PROMPT_TEMPLATES };
    }

    /**
     * 全テンプレートを取得（デバッグ用）
     * @returns {Object} 全テンプレート
     */
    getAllTemplates() {
        return { ...this.templates };
    }
}

// グローバルインスタンス
const promptTemplateManager = new PromptTemplateManager();

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.PromptTemplateManager = PromptTemplateManager;
    window.promptTemplateManager = promptTemplateManager;
} else if (typeof global !== 'undefined') {
    global.PromptTemplateManager = PromptTemplateManager;
    global.promptTemplateManager = promptTemplateManager;
}
