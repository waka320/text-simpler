/**
 * Text-Simpler UI Components
 * 再利用可能なUI部品とヘルパー関数
 */

class UIComponents {
    constructor() {
        this.activeElements = new Map();
    }

    /**
     * ローディングスピナーを作成
     * @param {string} message - ローディングメッセージ
     * @param {Object} options - オプション
     * @returns {HTMLElement} - ローディング要素
     */
    createLoadingSpinner(message = '処理中...', options = {}) {
        const {
            size = 'medium',
            color = '#667eea',
            className = 'text-simpler-loading'
        } = options;

        const container = document.createElement('div');
        container.className = `${className} loading-${size}`;

        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.style.borderTopColor = color;

        const messageEl = document.createElement('div');
        messageEl.className = 'loading-message';
        messageEl.textContent = message;

        container.appendChild(spinner);
        container.appendChild(messageEl);

        return container;
    }

    /**
     * エラーメッセージを作成
     * @param {string} message - エラーメッセージ
     * @param {Object} options - オプション
     * @returns {HTMLElement} - エラー要素
     */
    createErrorMessage(message, options = {}) {
        const {
            canRetry = false,
            onRetry = null,
            className = 'text-simpler-error'
        } = options;

        const container = document.createElement('div');
        container.className = className;

        const messageEl = document.createElement('div');
        messageEl.className = 'error-text';
        messageEl.textContent = message;

        const actionsEl = document.createElement('div');
        actionsEl.className = 'error-actions';

        if (canRetry && onRetry) {
            const retryBtn = this.createButton('再試行', {
                variant: 'secondary',
                size: 'small',
                onClick: onRetry
            });
            actionsEl.appendChild(retryBtn);
        }

        const closeBtn = this.createButton('閉じる', {
            variant: 'text',
            size: 'small',
            onClick: () => container.remove()
        });
        actionsEl.appendChild(closeBtn);

        container.appendChild(messageEl);
        container.appendChild(actionsEl);

        return container;
    }

    /**
     * 成功メッセージを作成
     * @param {string} message - 成功メッセージ
     * @param {Object} options - オプション
     * @returns {HTMLElement} - 成功要素
     */
    createSuccessMessage(message, options = {}) {
        const {
            autoHide = true,
            hideDelay = 3000,
            className = 'text-simpler-success'
        } = options;

        const container = document.createElement('div');
        container.className = className;
        container.textContent = message;

        if (autoHide) {
            setTimeout(() => {
                if (container.parentNode) {
                    container.remove();
                }
            }, hideDelay);
        }

        return container;
    }

    /**
     * ボタンを作成
     * @param {string} text - ボタンテキスト
     * @param {Object} options - オプション
     * @returns {HTMLElement} - ボタン要素
     */
    createButton(text, options = {}) {
        const {
            variant = 'primary',
            size = 'medium',
            disabled = false,
            onClick = null,
            className = ''
        } = options;

        const button = document.createElement('button');
        button.textContent = text;
        button.className = `btn btn-${variant} btn-${size} ${className}`.trim();
        button.disabled = disabled;

        if (onClick) {
            button.addEventListener('click', onClick);
        }

        return button;
    }

    /**
     * プログレスバーを作成
     * @param {Object} options - オプション
     * @returns {Object} - {element, update, complete}
     */
    createProgressBar(options = {}) {
        const {
            max = 100,
            className = 'text-simpler-progress'
        } = options;

        const container = document.createElement('div');
        container.className = `${className}-container`;

        const bar = document.createElement('div');
        bar.className = `${className}-bar`;

        const fill = document.createElement('div');
        fill.className = `${className}-fill`;
        fill.style.width = '0%';

        const text = document.createElement('div');
        text.className = `${className}-text`;
        text.textContent = '0%';

        bar.appendChild(fill);
        container.appendChild(bar);
        container.appendChild(text);

        return {
            element: container,
            update: (value) => {
                const percentage = Math.min(100, Math.max(0, (value / max) * 100));
                fill.style.width = `${percentage}%`;
                text.textContent = `${Math.round(percentage)}%`;
            },
            complete: () => {
                fill.style.width = '100%';
                text.textContent = '完了';
                container.classList.add('completed');
            }
        };
    }

    /**
     * モーダルダイアログを作成
     * @param {Object} options - オプション
     * @returns {Object} - {element, show, hide}
     */
    createModal(options = {}) {
        const {
            title = '',
            content = '',
            closable = true,
            className = 'text-simpler-modal'
        } = options;

        const overlay = document.createElement('div');
        overlay.className = `${className}-overlay`;
        overlay.style.display = 'none';

        const modal = document.createElement('div');
        modal.className = `${className}`;

        if (title) {
            const header = document.createElement('div');
            header.className = `${className}-header`;

            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            header.appendChild(titleEl);

            if (closable) {
                const closeBtn = this.createButton('×', {
                    variant: 'text',
                    className: `${className}-close`,
                    onClick: () => this.hideModal(overlay)
                });
                header.appendChild(closeBtn);
            }

            modal.appendChild(header);
        }

        const body = document.createElement('div');
        body.className = `${className}-body`;
        if (typeof content === 'string') {
            body.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            body.appendChild(content);
        }
        modal.appendChild(body);

        overlay.appendChild(modal);

        // オーバーレイクリックで閉じる
        if (closable) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hideModal(overlay);
                }
            });
        }

        return {
            element: overlay,
            show: () => this.showModal(overlay),
            hide: () => this.hideModal(overlay),
            updateContent: (newContent) => {
                if (typeof newContent === 'string') {
                    body.innerHTML = newContent;
                } else if (newContent instanceof HTMLElement) {
                    body.innerHTML = '';
                    body.appendChild(newContent);
                }
            }
        };
    }

    /**
     * ツールチップを作成
     * @param {HTMLElement} target - ツールチップを表示する要素
     * @param {string} content - ツールチップ内容
     * @param {Object} options - オプション
     */
    createTooltip(target, content, options = {}) {
        const {
            position = 'top',
            delay = 500,
            className = 'text-simpler-tooltip'
        } = options;

        let tooltip = null;
        let showTimeout = null;
        let hideTimeout = null;

        const show = () => {
            if (tooltip) return;

            tooltip = document.createElement('div');
            tooltip.className = `${className} ${className}-${position}`;
            tooltip.textContent = content;

            document.body.appendChild(tooltip);

            // 位置を計算
            const targetRect = target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
            let top = targetRect.top - tooltipRect.height - 8;

            if (position === 'bottom') {
                top = targetRect.bottom + 8;
            }

            // 画面外に出ないよう調整
            left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            tooltip.style.opacity = '1';
        };

        const hide = () => {
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
        };

        target.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            showTimeout = setTimeout(show, delay);
        });

        target.addEventListener('mouseleave', () => {
            clearTimeout(showTimeout);
            hideTimeout = setTimeout(hide, 100);
        });

        return { show, hide };
    }

    /**
     * モーダルを表示
     * @private
     */
    showModal(overlay) {
        document.body.appendChild(overlay);
        overlay.style.display = 'flex';

        // アニメーション
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });
    }

    /**
     * モーダルを非表示
     * @private
     */
    hideModal(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 200);
    }

    /**
     * 要素をクリアする
     * @param {HTMLElement} element - クリアする要素
     */
    clearElement(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    /**
     * 要素の表示/非表示を切り替え
     * @param {HTMLElement} element - 対象要素
     * @param {boolean} show - 表示するかどうか
     */
    toggleElement(element, show) {
        element.style.display = show ? 'block' : 'none';
    }

    /**
     * クリップボードにコピー
     * @param {string} text - コピーするテキスト
     * @returns {Promise<boolean>} - 成功したかどうか
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('クリップボードコピーエラー:', error);

            // フォールバック方法
            try {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textArea);
                return success;
            } catch (fallbackError) {
                console.error('フォールバックコピーエラー:', fallbackError);
                return false;
            }
        }
    }

    /**
     * アクティブな要素を管理
     * @param {string} id - 要素ID
     * @param {HTMLElement} element - 要素
     */
    registerActiveElement(id, element) {
        this.activeElements.set(id, element);
    }

    /**
     * アクティブな要素を取得
     * @param {string} id - 要素ID
     * @returns {HTMLElement|null} - 要素
     */
    getActiveElement(id) {
        return this.activeElements.get(id) || null;
    }

    /**
     * アクティブな要素を削除
     * @param {string} id - 要素ID
     */
    unregisterActiveElement(id) {
        const element = this.activeElements.get(id);
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
        this.activeElements.delete(id);
    }

    /**
     * 全てのアクティブな要素をクリア
     */
    clearAllActiveElements() {
        for (const [id, element] of this.activeElements) {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }
        this.activeElements.clear();
    }
}

// グローバルインスタンス
const uiComponents = new UIComponents();

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.UIComponents = UIComponents;
    window.uiComponents = uiComponents;
} else if (typeof global !== 'undefined') {
    global.UIComponents = UIComponents;
    global.uiComponents = uiComponents;
}
