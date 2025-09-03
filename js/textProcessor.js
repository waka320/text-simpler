/**
 * Text-Simpler Text Processor Module
 * テキストの分割処理と長文対応
 */

/**
 * 長いテキストを適切なサイズのチャンクに分割
 */
function splitTextIntoChunks(text, maxChunkSize = 800) {
    const chunks = [];

    // テキストが短い場合は分割不要
    if (text.length <= maxChunkSize) {
        return [text];
    }

    // 文単位で分割（句点、感嘆符、疑問符で区切る）
    const sentences = text.split(/[。！？]/).filter(s => s.trim().length > 0);

    let currentChunk = '';

    for (const sentence of sentences) {
        const sentenceWithPunctuation = sentence + '。';

        // 現在のチャンクに文を追加した場合の長さをチェック
        if ((currentChunk + sentenceWithPunctuation).length > maxChunkSize && currentChunk.length > 0) {
            // チャンクが満杯になったら保存して新しいチャンクを開始
            chunks.push(currentChunk.trim());
            currentChunk = sentenceWithPunctuation;
        } else {
            // チャンクに文を追加
            currentChunk += sentenceWithPunctuation;
        }
    }

    // 最後のチャンクを追加
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    // チャンクが空の場合は元のテキストをそのまま返す
    if (chunks.length === 0) {
        return [text];
    }

    return chunks;
}

/**
 * 複数のチャンクを段階的に処理
 */
async function processLongText({ text, mode, level, apiKey, temperature, model, transformFunction }) {
    console.log('📏 長文処理開始、テキスト長:', text.length);

    // テキストをチャンクに分割
    const chunks = splitTextIntoChunks(text);
    console.log('🔀 チャンク数:', chunks.length);

    if (chunks.length === 1) {
        // 単一チャンクの場合は通常処理
        console.log('📝 単一チャンク、通常処理を実行');
        return await transformFunction({ text, mode, level, apiKey, temperature, model });
    }

    // 複数チャンクの場合は段階的処理
    console.log('🔄 複数チャンク、段階的処理を実行');
    const results = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`📋 チャンク ${i + 1}/${chunks.length} 処理中 (${chunk.length}文字)`);

        try {
            const result = await transformFunction({
                text: chunk,
                mode,
                level,
                apiKey,
                temperature,
                model
            });

            results.push({
                chunkIndex: i,
                originalText: chunk,
                transformedText: result,
                success: true
            });

            console.log(`✅ チャンク ${i + 1} 処理完了`);

        } catch (error) {
            console.error(`❌ チャンク ${i + 1} 処理エラー:`, error);
            results.push({
                chunkIndex: i,
                originalText: chunk,
                error: error.message,
                success: false
            });
        }

        // チャンク間で少し待機（API制限を考慮）
        if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // 結果を統合
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) {
        throw new Error('すべてのチャンクの処理に失敗しました');
    }

    // 変換されたテキストを結合
    const combinedText = successfulResults
        .map(r => r.transformedText)
        .join('\n\n');

    console.log('🎯 長文処理完了、統合テキスト長:', combinedText.length);

    return {
        text: combinedText,
        chunks: results,
        totalChunks: chunks.length,
        successfulChunks: successfulResults.length
    };
}

// ES6モジュールとしてエクスポート
export {
    splitTextIntoChunks,
    processLongText
};
