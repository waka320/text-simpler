/**
 * Text-Simpler Settings Manager
 * 設定の保存・読み込み・管理を担当
 */

class SettingsManager {
    constructor() {
        this.defaultSettings = {
            // API設定
            apiProvider: 'gemini',
            model: 'gemini-2.5-pro',
            geminiApiKey: '',
            temperature: 0.2,

            // デフォルト動作
            defaultMode: 'simplify',
            gradeLevel: 'junior',
            outputView: 'single',
            streaming: false,

            // UI設定
            autoApplyTransform: true,
            showTooltips: true,
            confirmBeforeUndo: false,

            // 高度な設定
            maxChunkSize: 600,
            maxRetries: 2,
            retryDelay: 1000,
            requestTimeout: 30000,

            // プライバシー設定
            saveHistory: false,
            anonymousUsage: false,

            // カスタム設定
            customPrompts: {},
            customGradeLevels: {}
        };

        this.settingsCache = null;
        this.listeners = new Map();
    }

    /**
     * 設定を取得
     * @param {string|Array<string>} keys - 取得する設定のキー
     * @returns {Promise<Object>} - 設定値
     */
    async getSettings(keys = null) {
        try {
            // キャッシュがある場合はキャッシュから返す
            if (this.settingsCache) {
                return this._filterSettings(this.settingsCache, keys);
            }

            // ストレージから読み込み
            const stored = await this._getFromStorage(keys);
            const settings = this._mergeWithDefaults(stored);

            // 全設定を取得した場合はキャッシュに保存
            if (!keys) {
                this.settingsCache = settings;
            }

            return this._filterSettings(settings, keys);

        } catch (error) {
            console.error('Settings get error:', error);
            return this._filterSettings(this.defaultSettings, keys);
        }
    }

    /**
     * 設定を保存
     * @param {Object} settings - 保存する設定
     * @returns {Promise<boolean>} - 成功したかどうか
     */
    async saveSettings(settings) {
        try {
            // 設定の検証
            const validatedSettings = this._validateSettings(settings);

            // ストレージに保存
            await this._saveToStorage(validatedSettings);

            // キャッシュを更新
            if (this.settingsCache) {
                this.settingsCache = { ...this.settingsCache, ...validatedSettings };
            }

            // リスナーに通知
            this._notifyListeners('settingsChanged', validatedSettings);

            return true;

        } catch (error) {
            console.error('Settings save error:', error);
            return false;
        }
    }

    /**
     * 設定をリセット
     * @param {Array<string>} keys - リセットするキー（省略時は全て）
     * @returns {Promise<boolean>} - 成功したかどうか
     */
    async resetSettings(keys = null) {
        try {
            if (keys) {
                // 指定されたキーのみリセット
                const resetValues = {};
                for (const key of keys) {
                    if (key in this.defaultSettings) {
                        resetValues[key] = this.defaultSettings[key];
                    }
                }
                return await this.saveSettings(resetValues);
            } else {
                // 全設定をリセット
                await this._clearStorage();
                this.settingsCache = null;
                this._notifyListeners('settingsReset', this.defaultSettings);
                return true;
            }
        } catch (error) {
            console.error('Settings reset error:', error);
            return false;
        }
    }

    /**
     * 設定の変更を監視
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     * @returns {Function} - リスナー解除関数
     */
    onSettingsChange(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        this.listeners.get(event).add(callback);

        // リスナー解除関数を返す
        return () => {
            const eventListeners = this.listeners.get(event);
            if (eventListeners) {
                eventListeners.delete(callback);
            }
        };
    }

    /**
     * APIキーの有効性をチェック
     * @param {string} apiKey - チェックするAPIキー
     * @returns {Object} - {isValid, error}
     */
    validateApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            return { isValid: false, error: 'APIキーが空です' };
        }

        if (apiKey.length < 10) {
            return { isValid: false, error: 'APIキーが短すぎます' };
        }

        if (!apiKey.startsWith('AIza')) {
            return { isValid: false, error: 'Gemini APIキーの形式が正しくありません' };
        }

        return { isValid: true };
    }

    /**
     * カスタムプロンプトを追加
     * @param {string} mode - モード名
     * @param {Object} prompts - プロンプト定義
     * @returns {Promise<boolean>} - 成功したかどうか
     */
    async addCustomPrompt(mode, prompts) {
        try {
            const settings = await this.getSettings(['customPrompts']);
            const customPrompts = { ...settings.customPrompts };
            customPrompts[mode] = prompts;

            return await this.saveSettings({ customPrompts });
        } catch (error) {
            console.error('Add custom prompt error:', error);
            return false;
        }
    }

    /**
     * カスタム学年レベルを追加
     * @param {string} level - レベル名
     * @param {Object} info - レベル情報
     * @returns {Promise<boolean>} - 成功したかどうか
     */
    async addCustomGradeLevel(level, info) {
        try {
            const settings = await this.getSettings(['customGradeLevels']);
            const customGradeLevels = { ...settings.customGradeLevels };
            customGradeLevels[level] = info;

            return await this.saveSettings({ customGradeLevels });
        } catch (error) {
            console.error('Add custom grade level error:', error);
            return false;
        }
    }

    /**
     * 設定のエクスポート
     * @returns {Promise<Object>} - エクスポートされた設定
     */
    async exportSettings() {
        const settings = await this.getSettings();

        // APIキーなどの機密情報は除外
        const exportData = { ...settings };
        delete exportData.geminiApiKey;

        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            settings: exportData
        };
    }

    /**
     * 設定のインポート
     * @param {Object} importData - インポートする設定
     * @returns {Promise<boolean>} - 成功したかどうか
     */
    async importSettings(importData) {
        try {
            if (!importData.settings) {
                throw new Error('Invalid import data format');
            }

            // バージョンチェック
            if (importData.version !== '1.0') {
                console.warn('Import data version mismatch:', importData.version);
            }

            // APIキーは除外して保存
            const settingsToImport = { ...importData.settings };
            delete settingsToImport.geminiApiKey;

            return await this.saveSettings(settingsToImport);

        } catch (error) {
            console.error('Import settings error:', error);
            return false;
        }
    }

    /**
     * ストレージから読み込み
     * @private
     */
    async _getFromStorage(keys) {
        return new Promise((resolve) => {
            const targetKeys = keys || Object.keys(this.defaultSettings);
            chrome.storage.sync.get(targetKeys, (result) => {
                resolve(result);
            });
        });
    }

    /**
     * ストレージに保存
     * @private
     */
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

    /**
     * ストレージをクリア
     * @private
     */
    async _clearStorage() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.clear(() => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * デフォルト値とマージ
     * @private
     */
    _mergeWithDefaults(stored) {
        return { ...this.defaultSettings, ...stored };
    }

    /**
     * 設定をフィルタリング
     * @private
     */
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

    /**
     * 設定を検証
     * @private
     */
    _validateSettings(settings) {
        const validated = {};

        for (const [key, value] of Object.entries(settings)) {
            if (key in this.defaultSettings) {
                validated[key] = this._validateSettingValue(key, value);
            }
        }

        return validated;
    }

    /**
     * 設定値を検証
     * @private
     */
    _validateSettingValue(key, value) {
        const defaultValue = this.defaultSettings[key];
        const defaultType = typeof defaultValue;

        // 型チェック
        if (typeof value !== defaultType) {
            console.warn(`Setting ${key} type mismatch, using default:`, defaultValue);
            return defaultValue;
        }

        // 特定の設定の範囲チェック
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

    /**
     * リスナーに通知
     * @private
     */
    _notifyListeners(event, data) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const callback of eventListeners) {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Settings listener error:', error);
                }
            }
        }
    }

    /**
     * キャッシュをクリア
     */
    clearCache() {
        this.settingsCache = null;
    }

    /**
     * デフォルト設定を取得
     * @returns {Object} - デフォルト設定
     */
    getDefaultSettings() {
        return { ...this.defaultSettings };
    }
}

// グローバルインスタンス
const settingsManager = new SettingsManager();

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.SettingsManager = SettingsManager;
    window.settingsManager = settingsManager;
} else if (typeof global !== 'undefined') {
    global.SettingsManager = SettingsManager;
    global.settingsManager = settingsManager;
}
