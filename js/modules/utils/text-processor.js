/**
 * Text-Simpler Text Processor
 * テキスト処理とチャンク分割のユーティリティ
 */

class TextProcessor {
    constructor() {
        this.defaultChunkSize = 600;
        this.sentenceEnders = /[。！？]/g;
        this.paragraphSeparator = /\n\s*\n/;
    }

    /**
     * テキストをチャンクに分割
     * @param {string} text - 分割するテキスト
     * @param {Object} options - オプション
     * @returns {Array} - チャンクの配列
     */
    splitIntoChunks(text, options = {}) {
        const {
            maxChunkSize = this.defaultChunkSize,
            preserveParagraphs = true,
            preserveSentences = true,
            overlap = 0
        } = options;

        if (!text || text.trim().length === 0) {
            return [];
        }

        const cleanText = this.normalizeText(text);

        if (preserveParagraphs) {
            return this._splitByParagraphs(cleanText, maxChunkSize, preserveSentences, overlap);
        } else if (preserveSentences) {
            return this._splitBySentences(cleanText, maxChunkSize, overlap);
        } else {
            return this._splitByCharacters(cleanText, maxChunkSize, overlap);
        }
    }

    /**
     * テキストを正規化
     * @param {string} text - 正規化するテキスト
     * @param {Object} options - オプション
     * @returns {string} - 正規化されたテキスト
     */
    normalizeText(text, options = {}) {
        const {
            normalizeWhitespace = true,
            normalizeLineBreaks = true,
            removeExtraSpaces = true,
            trimText = true
        } = options;

        let normalized = text;

        // 改行の正規化
        if (normalizeLineBreaks) {
            normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        }

        // 空白の正規化
        if (normalizeWhitespace) {
            normalized = normalized.replace(/[\t\f\v]/g, ' ');
        }

        // 余分な空白の除去
        if (removeExtraSpaces) {
            normalized = normalized.replace(/[ ]+/g, ' ');
        }

        // トリム
        if (trimText) {
            normalized = normalized.trim();
        }

        return normalized;
    }

    /**
     * テキストから文を抽出
     * @param {string} text - 対象テキスト
     * @returns {Array} - 文の配列
     */
    extractSentences(text) {
        const sentences = [];
        const parts = text.split(this.sentenceEnders);

        for (let i = 0; i < parts.length - 1; i++) {
            const sentence = parts[i].trim();
            if (sentence) {
                // 句読点を復元
                const nextChar = text[text.indexOf(sentence) + sentence.length];
                sentences.push(sentence + (nextChar || ''));
            }
        }

        // 最後の部分（句読点で終わらない場合）
        const lastPart = parts[parts.length - 1].trim();
        if (lastPart) {
            sentences.push(lastPart);
        }

        return sentences;
    }

    /**
     * テキストから段落を抽出
     * @param {string} text - 対象テキスト
     * @returns {Array} - 段落の配列
     */
    extractParagraphs(text) {
        return text.split(this.paragraphSeparator)
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }

    /**
     * テキストの統計情報を取得
     * @param {string} text - 対象テキスト
     * @returns {Object} - 統計情報
     */
    getTextStats(text) {
        const normalized = this.normalizeText(text);
        const sentences = this.extractSentences(normalized);
        const paragraphs = this.extractParagraphs(normalized);
        const words = normalized.split(/\s+/).filter(w => w.length > 0);

        return {
            characters: normalized.length,
            charactersNoSpaces: normalized.replace(/\s/g, '').length,
            words: words.length,
            sentences: sentences.length,
            paragraphs: paragraphs.length,
            averageWordsPerSentence: sentences.length > 0 ? Math.round(words.length / sentences.length) : 0,
            averageSentencesPerParagraph: paragraphs.length > 0 ? Math.round(sentences.length / paragraphs.length) : 0,
            estimatedReadingTime: Math.ceil(words.length / 200) // 200語/分で計算
        };
    }

    /**
     * テキストの複雑さを評価
     * @param {string} text - 対象テキスト
     * @returns {Object} - 複雑さ評価
     */
    assessComplexity(text) {
        const stats = this.getTextStats(text);
        const words = text.split(/\s+/).filter(w => w.length > 0);

        // 平均語長
        const averageWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

        // 長い語の割合（6文字以上）
        const longWordsRatio = words.filter(word => word.length >= 6).length / words.length;

        // 平均文長
        const averageSentenceLength = stats.averageWordsPerSentence;

        // 複雑さスコア（0-100）
        let complexityScore = 0;
        complexityScore += Math.min(averageWordLength * 10, 30); // 語長の影響
        complexityScore += Math.min(longWordsRatio * 40, 40); // 長い語の影響
        complexityScore += Math.min(averageSentenceLength * 2, 30); // 文長の影響

        let level = 'elementary';
        if (complexityScore > 70) {
            level = 'senior';
        } else if (complexityScore > 40) {
            level = 'junior';
        }

        return {
            score: Math.round(complexityScore),
            level: level,
            averageWordLength: Math.round(averageWordLength * 10) / 10,
            longWordsRatio: Math.round(longWordsRatio * 100),
            averageSentenceLength: averageSentenceLength
        };
    }

    /**
     * 段落による分割
     * @private
     */
    _splitByParagraphs(text, maxChunkSize, preserveSentences, overlap) {
        const chunks = [];
        const paragraphs = this.extractParagraphs(text);

        let currentChunk = '';
        let chunkIndex = 0;

        for (const paragraph of paragraphs) {
            if (paragraph.length > maxChunkSize) {
                // 現在のチャンクを保存
                if (currentChunk.trim()) {
                    chunks.push(this._createChunk(currentChunk.trim(), chunkIndex++));
                    currentChunk = '';
                }

                // 長い段落を処理
                if (preserveSentences) {
                    const subChunks = this._splitBySentences(paragraph, maxChunkSize, overlap);
                    for (const subChunk of subChunks) {
                        chunks.push({ ...subChunk, index: chunkIndex++ });
                    }
                } else {
                    const subChunks = this._splitByCharacters(paragraph, maxChunkSize, overlap);
                    for (const subChunk of subChunks) {
                        chunks.push({ ...subChunk, index: chunkIndex++ });
                    }
                }
            } else {
                // 通常の段落処理
                if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
                    if (currentChunk.trim()) {
                        chunks.push(this._createChunk(currentChunk.trim(), chunkIndex++));
                    }
                    currentChunk = paragraph;
                } else {
                    currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
                }
            }
        }

        // 最後のチャンクを追加
        if (currentChunk.trim()) {
            chunks.push(this._createChunk(currentChunk.trim(), chunkIndex++));
        }

        return this._applyOverlap(chunks, overlap);
    }

    /**
     * 文による分割
     * @private
     */
    _splitBySentences(text, maxChunkSize, overlap) {
        const chunks = [];
        const sentences = this.extractSentences(text);

        let currentChunk = '';
        let chunkIndex = 0;

        for (const sentence of sentences) {
            if (sentence.length > maxChunkSize) {
                // 現在のチャンクを保存
                if (currentChunk.trim()) {
                    chunks.push(this._createChunk(currentChunk.trim(), chunkIndex++));
                    currentChunk = '';
                }

                // 長い文を文字単位で分割
                const subChunks = this._splitByCharacters(sentence, maxChunkSize, overlap);
                for (const subChunk of subChunks) {
                    chunks.push({ ...subChunk, index: chunkIndex++ });
                }
            } else {
                if (currentChunk.length + sentence.length > maxChunkSize) {
                    if (currentChunk.trim()) {
                        chunks.push(this._createChunk(currentChunk.trim(), chunkIndex++));
                    }
                    currentChunk = sentence;
                } else {
                    currentChunk += sentence;
                }
            }
        }

        // 最後のチャンクを追加
        if (currentChunk.trim()) {
            chunks.push(this._createChunk(currentChunk.trim(), chunkIndex++));
        }

        return this._applyOverlap(chunks, overlap);
    }

    /**
     * 文字による分割
     * @private
     */
    _splitByCharacters(text, maxChunkSize, overlap) {
        const chunks = [];
        let chunkIndex = 0;

        for (let i = 0; i < text.length; i += maxChunkSize) {
            const chunk = text.substring(i, i + maxChunkSize);
            chunks.push(this._createChunk(chunk, chunkIndex++));
        }

        return this._applyOverlap(chunks, overlap);
    }

    /**
     * チャンクオブジェクトを作成
     * @private
     */
    _createChunk(text, index) {
        return {
            index: index,
            text: text,
            length: text.length,
            stats: this.getTextStats(text)
        };
    }

    /**
     * オーバーラップを適用
     * @private
     */
    _applyOverlap(chunks, overlap) {
        if (overlap <= 0 || chunks.length <= 1) {
            return chunks;
        }

        const overlappedChunks = [];

        for (let i = 0; i < chunks.length; i++) {
            let chunkText = chunks[i].text;

            // 前のチャンクからのオーバーラップ
            if (i > 0) {
                const prevChunk = chunks[i - 1];
                const overlapText = prevChunk.text.substring(Math.max(0, prevChunk.text.length - overlap));
                chunkText = overlapText + ' ' + chunkText;
            }

            overlappedChunks.push({
                ...chunks[i],
                text: chunkText,
                length: chunkText.length
            });
        }

        return overlappedChunks;
    }
}

// グローバルインスタンス
const textProcessor = new TextProcessor();

// エクスポート（グローバル変数として）
if (typeof window !== 'undefined') {
    window.TextProcessor = TextProcessor;
    window.textProcessor = textProcessor;
} else if (typeof global !== 'undefined') {
    global.TextProcessor = TextProcessor;
    global.textProcessor = textProcessor;
}
