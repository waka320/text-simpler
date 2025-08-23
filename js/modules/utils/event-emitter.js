/**
 * Text-Simpler Event Emitter
 * モジュール間の通信とイベント管理
 */

class EventEmitter {
    constructor() {
        this.events = new Map();
        this.maxListeners = 10;
    }

    /**
     * イベントリスナーを追加
     * @param {string} event - イベント名
     * @param {Function} listener - リスナー関数
     * @returns {Function} - リスナー解除関数
     */
    on(event, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener must be a function');
        }

        if (!this.events.has(event)) {
            this.events.set(event, []);
        }

        const listeners = this.events.get(event);

        // 最大リスナー数チェック
        if (listeners.length >= this.maxListeners) {
            console.warn(`Maximum listeners (${this.maxListeners}) exceeded for event: ${event}`);
        }

        listeners.push(listener);

        // リスナー解除関数を返す
        return () => this.off(event, listener);
    }

    /**
     * 一度だけ実行されるイベントリスナーを追加
     * @param {string} event - イベント名
     * @param {Function} listener - リスナー関数
     * @returns {Function} - リスナー解除関数
     */
    once(event, listener) {
        const onceWrapper = (...args) => {
            this.off(event, onceWrapper);
            listener.apply(this, args);
        };

        return this.on(event, onceWrapper);
    }

    /**
     * イベントリスナーを削除
     * @param {string} event - イベント名
     * @param {Function} listener - 削除するリスナー関数
     */
    off(event, listener) {
        const listeners = this.events.get(event);
        if (!listeners) return;

        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }

        // リスナーがなくなったらイベントを削除
        if (listeners.length === 0) {
            this.events.delete(event);
        }
    }

    /**
     * 指定されたイベントの全リスナーを削除
     * @param {string} event - イベント名
     */
    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }

    /**
     * イベントを発火
     * @param {string} event - イベント名
     * @param {...any} args - イベント引数
     * @returns {boolean} - リスナーが存在したかどうか
     */
    emit(event, ...args) {
        const listeners = this.events.get(event);
        if (!listeners || listeners.length === 0) {
            return false;
        }

        // リスナーのコピーを作成（実行中の変更に対応）
        const listenersCopy = [...listeners];

        for (const listener of listenersCopy) {
            try {
                listener.apply(this, args);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
                // エラーイベントを発火
                this.emit('error', error, event);
            }
        }

        return true;
    }

    /**
     * 非同期イベントを発火
     * @param {string} event - イベント名
     * @param {...any} args - イベント引数
     * @returns {Promise<Array>} - 全リスナーの実行結果
     */
    async emitAsync(event, ...args) {
        const listeners = this.events.get(event);
        if (!listeners || listeners.length === 0) {
            return [];
        }

        const promises = listeners.map(async (listener) => {
            try {
                return await listener.apply(this, args);
            } catch (error) {
                console.error(`Error in async event listener for ${event}:`, error);
                this.emit('error', error, event);
                throw error;
            }
        });

        return Promise.allSettled(promises);
    }

    /**
     * イベントのリスナー数を取得
     * @param {string} event - イベント名
     * @returns {number} - リスナー数
     */
    listenerCount(event) {
        const listeners = this.events.get(event);
        return listeners ? listeners.length : 0;
    }

    /**
     * 登録されている全イベント名を取得
     * @returns {Array<string>} - イベント名の配列
     */
    eventNames() {
        return Array.from(this.events.keys());
    }

    /**
     * 指定されたイベントのリスナーを取得
     * @param {string} event - イベント名
     * @returns {Array<Function>} - リスナーの配列
     */
    listeners(event) {
        const listeners = this.events.get(event);
        return listeners ? [...listeners] : [];
    }

    /**
     * 最大リスナー数を設定
     * @param {number} n - 最大リスナー数
     */
    setMaxListeners(n) {
        if (typeof n !== 'number' || n < 0) {
            throw new TypeError('Max listeners must be a non-negative number');
        }
        this.maxListeners = n;
    }

    /**
     * 最大リスナー数を取得
     * @returns {number} - 最大リスナー数
     */
    getMaxListeners() {
        return this.maxListeners;
    }

    /**
     * イベントの統計情報を取得
     * @returns {Object} - 統計情報
     */
    getStats() {
        const stats = {
            totalEvents: this.events.size,
            totalListeners: 0,
            events: {}
        };

        for (const [event, listeners] of this.events) {
            stats.events[event] = listeners.length;
            stats.totalListeners += listeners.length;
        }

        return stats;
    }

    /**
     * デバッグ情報を出力
     */
    debug() {
        console.log('EventEmitter Debug Info:', {
            events: this.eventNames(),
            stats: this.getStats(),
            maxListeners: this.maxListeners
        });
    }
}

/**
 * グローバルイベントバス
 * アプリケーション全体で使用するイベントエミッター
 */
class GlobalEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // グローバルバスは多くのリスナーを許可

        // 標準的なイベントタイプを定義
        this.EVENT_TYPES = {
            // 設定関連
            SETTINGS_CHANGED: 'settings:changed',
            SETTINGS_RESET: 'settings:reset',

            // 変換関連
            TRANSFORM_START: 'transform:start',
            TRANSFORM_SUCCESS: 'transform:success',
            TRANSFORM_ERROR: 'transform:error',
            TRANSFORM_UNDO: 'transform:undo',

            // UI関連
            UI_SHOW_LOADING: 'ui:showLoading',
            UI_HIDE_LOADING: 'ui:hideLoading',
            UI_SHOW_ERROR: 'ui:showError',
            UI_SHOW_SUCCESS: 'ui:showSuccess',

            // API関連
            API_REQUEST_START: 'api:requestStart',
            API_REQUEST_SUCCESS: 'api:requestSuccess',
            API_REQUEST_ERROR: 'api:requestError',

            // 選択関連
            SELECTION_CHANGED: 'selection:changed',
            SELECTION_CLEARED: 'selection:cleared'
        };
    }

    /**
     * 型安全なイベント発火
     * @param {string} eventType - イベントタイプ（EVENT_TYPESから）
     * @param {any} data - イベントデータ
     */
    emitTyped(eventType, data) {
        if (!Object.values(this.EVENT_TYPES).includes(eventType)) {
            console.warn(`Unknown event type: ${eventType}`);
        }

        this.emit(eventType, data);
    }

    /**
     * 変換開始イベントを発火
     * @param {Object} data - 変換データ
     */
    emitTransformStart(data) {
        this.emitTyped(this.EVENT_TYPES.TRANSFORM_START, data);
    }

    /**
     * 変換成功イベントを発火
     * @param {Object} data - 変換結果データ
     */
    emitTransformSuccess(data) {
        this.emitTyped(this.EVENT_TYPES.TRANSFORM_SUCCESS, data);
    }

    /**
     * 変換エラーイベントを発火
     * @param {Object} error - エラーデータ
     */
    emitTransformError(error) {
        this.emitTyped(this.EVENT_TYPES.TRANSFORM_ERROR, error);
    }

    /**
     * UI状態変更イベントを発火
     * @param {string} state - UI状態
     * @param {any} data - 状態データ
     */
    emitUIStateChange(state, data) {
        const eventType = `ui:${state}`;
        this.emit(eventType, data);
    }
}

// グローバルインスタンス
const eventBus = new GlobalEventBus();

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.EventEmitter = EventEmitter;
    window.GlobalEventBus = GlobalEventBus;
    window.eventBus = eventBus;
} else if (typeof global !== 'undefined') {
    global.EventEmitter = EventEmitter;
    global.GlobalEventBus = GlobalEventBus;
    global.eventBus = eventBus;
}
