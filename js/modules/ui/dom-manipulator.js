/**
 * Text-Simpler DOM Manipulator
 * DOM操作とテキスト置換の専用モジュール
 */

class DOMManipulator {
    constructor() {
        this.transformedElements = new Map();
        this.selectionManager = new SelectionManager();
    }

    /**
     * 選択されたテキストを変換テキストで置換
     * @param {string} originalText - 元のテキスト
     * @param {string} transformedText - 変換後のテキスト
     * @param {string} mode - 変換モード
     * @param {Range} range - 選択範囲
     * @returns {Object} - {success, elementId, error}
     */
    replaceSelectedText(originalText, transformedText, mode, range = null) {
        try {
            const targetRange = range || this.selectionManager.getCurrentRange();
            if (!targetRange) {
                return { success: false, error: '選択範囲が見つかりません' };
            }

            const elementId = this._generateUniqueId();
            const transformData = {
                id: elementId,
                originalText: originalText,
                transformedText: transformedText,
                mode: mode,
                range: this._cloneRange(targetRange),
                timestamp: Date.now()
            };

            // DOM操作を実行
            const markerElement = this._createMarkerElement(transformedText, elementId, mode);
            const success = this._replaceRangeWithElement(targetRange, markerElement);

            if (success) {
                this.transformedElements.set(elementId, transformData);
                return { success: true, elementId: elementId };
            } else {
                return { success: false, error: 'DOM操作に失敗しました' };
            }

        } catch (error) {
            console.error('Text replacement error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 変換を元に戻す
     * @param {string} elementId - 要素ID
     * @returns {boolean} - 成功したかどうか
     */
    undoTransform(elementId) {
        const transformData = this.transformedElements.get(elementId);
        if (!transformData) {
            console.error('Transform data not found:', elementId);
            return false;
        }

        try {
            const markerElement = document.querySelector(`[data-text-simpler-id="${elementId}"]`);
            if (!markerElement) {
                console.error('Marker element not found:', elementId);
                return false;
            }

            // マーカー要素を元のテキストで置換
            const textNode = document.createTextNode(transformData.originalText);
            markerElement.parentNode.replaceChild(textNode, markerElement);

            // 変換データを削除
            this.transformedElements.delete(elementId);

            return true;

        } catch (error) {
            console.error('Undo transform error:', error);
            return false;
        }
    }

    /**
     * 全ての変換を元に戻す
     * @returns {number} - 元に戻した数
     */
    undoAllTransforms() {
        let undoCount = 0;

        for (const [elementId] of this.transformedElements) {
            if (this.undoTransform(elementId)) {
                undoCount++;
            }
        }

        return undoCount;
    }

    /**
     * 変換された要素の情報を取得
     * @param {string} elementId - 要素ID
     * @returns {Object|null} - 変換データ
     */
    getTransformData(elementId) {
        return this.transformedElements.get(elementId) || null;
    }

    /**
     * 全ての変換された要素の情報を取得
     * @returns {Array} - 変換データの配列
     */
    getAllTransformData() {
        return Array.from(this.transformedElements.values());
    }

    /**
     * ページからテキストを抽出
     * @param {Object} options - 抽出オプション
     * @returns {string} - 抽出されたテキスト
     */
    extractPageText(options = {}) {
        const {
            selectors = ['main', 'article', '.content', '.post', '.entry', '#content', '#main'],
            excludeSelectors = ['script', 'style', 'noscript', 'nav', 'header', 'footer'],
            maxLength = 10000
        } = options;

        let content = null;

        // 優先順位順にコンテンツ要素を探す
        for (const selector of selectors) {
            content = document.querySelector(selector);
            if (content) break;
        }

        // 見つからない場合はbody全体を対象
        if (!content) {
            content = document.body;
        }

        return this._extractTextFromElement(content, excludeSelectors, maxLength);
    }

    /**
     * テキストをチャンクに分割
     * @param {string} text - 分割するテキスト
     * @param {number} maxChunkSize - 最大チャンクサイズ
     * @returns {Array} - チャンクの配列
     */
    splitTextIntoChunks(text, maxChunkSize = 600) {
        const chunks = [];
        const paragraphs = text.split(/\n\s*\n/);

        let currentChunk = '';
        let chunkIndex = 0;

        for (const paragraph of paragraphs) {
            if (paragraph.length > maxChunkSize) {
                // 現在のチャンクを保存
                if (currentChunk.trim()) {
                    chunks.push({
                        index: chunkIndex++,
                        text: currentChunk.trim()
                    });
                    currentChunk = '';
                }

                // 長い段落を文単位で分割
                const sentences = this._splitIntoSentences(paragraph);
                for (const sentence of sentences) {
                    if (currentChunk.length + sentence.length > maxChunkSize) {
                        if (currentChunk.trim()) {
                            chunks.push({
                                index: chunkIndex++,
                                text: currentChunk.trim()
                            });
                        }
                        currentChunk = sentence;
                    } else {
                        currentChunk += sentence;
                    }
                }
            } else {
                // 通常の段落処理
                if (currentChunk.length + paragraph.length > maxChunkSize) {
                    if (currentChunk.trim()) {
                        chunks.push({
                            index: chunkIndex++,
                            text: currentChunk.trim()
                        });
                    }
                    currentChunk = paragraph;
                } else {
                    currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
                }
            }
        }

        // 最後のチャンクを追加
        if (currentChunk.trim()) {
            chunks.push({
                index: chunkIndex++,
                text: currentChunk.trim()
            });
        }

        return chunks;
    }

    /**
     * マーカー要素を作成
     * @private
     */
    _createMarkerElement(text, elementId, mode) {
        const marker = document.createElement('span');
        marker.className = `text-simpler-marker text-simpler-${mode}`;
        marker.setAttribute('data-text-simpler-id', elementId);
        marker.setAttribute('data-text-simpler-mode', mode);
        marker.textContent = text;

        // ダブルクリックで元に戻す
        marker.addEventListener('dblclick', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.undoTransform(elementId);
        });

        // ホバー時のツールチップ
        marker.title = `変換済み (${this._getModeDisplayName(mode)}) - ダブルクリックで元に戻す`;

        return marker;
    }

    /**
     * 範囲を要素で置換
     * @private
     */
    _replaceRangeWithElement(range, element) {
        try {
            if (range.startContainer === range.endContainer &&
                range.startContainer.nodeType === Node.TEXT_NODE) {
                // 単一のテキストノード内の場合
                return this._replaceInSingleTextNode(range, element);
            } else {
                // 複数ノードにまたがる場合
                return this._replaceInMultipleNodes(range, element);
            }
        } catch (error) {
            console.error('Range replacement error:', error);
            return false;
        }
    }

    /**
     * 単一テキストノード内での置換
     * @private
     */
    _replaceInSingleTextNode(range, element) {
        const textNode = range.startContainer;
        const beforeText = textNode.textContent.substring(0, range.startOffset);
        const afterText = textNode.textContent.substring(range.endOffset);

        const parentElement = textNode.parentNode;
        const beforeNode = document.createTextNode(beforeText);
        const afterNode = document.createTextNode(afterText);

        parentElement.insertBefore(beforeNode, textNode);
        parentElement.insertBefore(element, textNode);
        parentElement.insertBefore(afterNode, textNode);
        parentElement.removeChild(textNode);

        return true;
    }

    /**
     * 複数ノードにまたがる置換
     * @private
     */
    _replaceInMultipleNodes(range, element) {
        range.deleteContents();
        range.insertNode(element);
        return true;
    }

    /**
     * 要素からテキストを抽出
     * @private
     */
    _extractTextFromElement(element, excludeSelectors, maxLength) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    const tagName = parent.tagName.toLowerCase();
                    if (excludeSelectors.includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (!node.textContent.trim()) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textParts = [];
        let totalLength = 0;
        let node;

        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text) {
                textParts.push(text);
                totalLength += text.length;

                if (totalLength > maxLength) {
                    break;
                }
            }
        }

        return textParts.join('\n').trim();
    }

    /**
     * 文を分割
     * @private
     */
    _splitIntoSentences(text) {
        const sentences = [];
        const parts = text.split(/([。！？])/);

        for (let i = 0; i < parts.length; i += 2) {
            const sentence = parts[i];
            const punctuation = parts[i + 1] || '';

            if (sentence && sentence.trim()) {
                sentences.push(sentence + punctuation);
            }
        }

        return sentences;
    }

    /**
     * 範囲をクローン
     * @private
     */
    _cloneRange(range) {
        return {
            startContainer: range.startContainer,
            endContainer: range.endContainer,
            startOffset: range.startOffset,
            endOffset: range.endOffset
        };
    }

    /**
     * ユニークIDを生成
     * @private
     */
    _generateUniqueId() {
        return 'text-simpler-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * モード表示名を取得
     * @private
     */
    _getModeDisplayName(mode) {
        const modeNames = {
            'simplify': 'わかりやすく',
            'concretize': '具体化',
            'abstract': '抽象化',
            'grade': '学年レベル'
        };
        return modeNames[mode] || mode;
    }
}

/**
 * 選択範囲管理クラス
 */
class SelectionManager {
    constructor() {
        this.currentRange = null;
        this.currentText = '';
    }

    /**
     * 現在の選択範囲を更新
     */
    updateSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            this.currentRange = selection.getRangeAt(0).cloneRange();
            this.currentText = selection.toString().trim();
        } else {
            this.currentRange = null;
            this.currentText = '';
        }
    }

    /**
     * 現在の選択範囲を取得
     * @returns {Range|null}
     */
    getCurrentRange() {
        return this.currentRange;
    }

    /**
     * 現在の選択テキストを取得
     * @returns {string}
     */
    getCurrentText() {
        return this.currentText;
    }

    /**
     * 選択範囲をクリア
     */
    clearSelection() {
        this.currentRange = null;
        this.currentText = '';

        const selection = window.getSelection();
        selection.removeAllRanges();
    }

    /**
     * 選択範囲を復元
     * @param {Range} range - 復元する範囲
     */
    restoreSelection(range) {
        if (!range) return;

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

// グローバルインスタンス
const domManipulator = new DOMManipulator();

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.DOMManipulator = DOMManipulator;
    window.SelectionManager = SelectionManager;
    window.domManipulator = domManipulator;
} else if (typeof global !== 'undefined') {
    global.DOMManipulator = DOMManipulator;
    global.SelectionManager = SelectionManager;
    global.domManipulator = domManipulator;
}
