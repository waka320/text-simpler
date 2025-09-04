/**
 * ReadEasy. Text Processor Module
 * テキストの分割処理と長文対応
 */

/**
 * 長いテキストを適切なサイズのチャンクに分割
 */
function splitTextIntoChunks(text, maxChunkSize = 800) {
    console.log('🔍 チャンク分割開始:', { textLength: text.length, maxChunkSize });

    const chunks = [];

    // テキストが短い場合は分割不要
    if (text.length <= maxChunkSize) {
        console.log('📏 テキストが短いため分割不要');
        return [text];
    }

    // 文単位で分割（英語と日本語の句点、感嘆符、疑問符で区切る）
    // 英語: . ! ? 日本語: 。！？
    const sentences = text.split(/[.!?。！？]/).filter(s => s.trim().length > 0);
    console.log('📝 分割された文の数:', sentences.length);

    let currentChunk = '';

    for (const sentence of sentences) {
        // 元のテキストから句読点を復元（英語の場合は . を追加）
        let sentenceWithPunctuation = sentence.trim();
        if (sentenceWithPunctuation.length > 0) {
            // 元のテキストで句読点の直後にある文字を確認
            const sentenceEnd = text.indexOf(sentence) + sentence.length;
            if (sentenceEnd < text.length) {
                const nextChar = text[sentenceEnd];
                if (nextChar.match(/[.!?。！？]/)) {
                    sentenceWithPunctuation += nextChar;
                } else {
                    // 句読点が見つからない場合は英語の場合は . を追加
                    sentenceWithPunctuation += '.';
                }
            } else {
                // 文の最後の場合は英語の場合は . を追加
                sentenceWithPunctuation += '.';
            }
        }

        // 現在のチャンクに文を追加した場合の長さをチェック
        if ((currentChunk + sentenceWithPunctuation).length > maxChunkSize && currentChunk.length > 0) {
            // チャンクが満杯になったら保存して新しいチャンクを開始
            console.log('📦 チャンク保存:', { length: currentChunk.length, text: currentChunk.substring(0, 50) + '...' });
            chunks.push(currentChunk.trim());
            currentChunk = sentenceWithPunctuation;
        } else {
            // チャンクに文を追加
            currentChunk += sentenceWithPunctuation;
        }
    }

    // 最後のチャンクを追加
    if (currentChunk.trim()) {
        console.log('📦 最後のチャンク保存:', { length: currentChunk.length, text: currentChunk.substring(0, 50) + '...' });
        chunks.push(currentChunk.trim());
    }

    // チャンクが空の場合は元のテキストをそのまま返す
    if (chunks.length === 0) {
        console.log('⚠️ チャンクが空のため元のテキストを返す');
        return [text];
    }

    console.log('✅ チャンク分割完了:', { totalChunks: chunks.length, chunkSizes: chunks.map(c => c.length) });
    return chunks;
}

/**
 * 複数のチャンクを段階的に処理
 */
async function processLongText({ text, modes, level, apiKey, temperature, model, transformFunction }) {
    console.log('📏 長文処理開始、テキスト長:', text.length);

    // テキストをチャンクに分割
    const chunks = splitTextIntoChunks(text);
    console.log('🔀 チャンク数:', chunks.length);

    if (chunks.length === 1) {
        // 単一チャンクの場合は通常処理
        console.log('📝 単一チャンク、通常処理を実行');
        const result = await transformFunction({
            text,
            modes,
            level,
            apiKey,
            temperature,
            model
        });

        // 単一チャンクでもチャンク処理が行われたことを明示
        const chunkHeader = `📋 1/1\n`;
        // 改行文字を<br>タグに変換
        const htmlText = result.replace(/\n/g, '<br>');
        const formattedResult = chunkHeader + htmlText;

        return {
            text: formattedResult,
            chunks: [{
                chunkIndex: 0,
                originalText: text,
                transformedText: result,
                success: true
            }],
            totalChunks: 1,
            successfulChunks: 1
        };
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
                modes,
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

    // 変換されたテキストを結合（チャンク区切りを明示）
    const combinedText = successfulResults
        .map((r, index) => {
            const chunkHeader = `\n📋 ${r.chunkIndex + 1}/${chunks.length}\n`;
            // 改行文字を<br>タグに変換（フォールバック：スペースに変換）
            const htmlText = r.transformedText.replace(/\n/g, '<br>').replace(/\r/g, '');
            return chunkHeader + htmlText;
        })
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
