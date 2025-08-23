/**
 * Text-Simpler Content Script (MVP版)
 * ページ上でのテキスト選択とメッセージ処理を担当
 */

console.log('Text-Simpler: Content script loaded');

// グローバル変数
let currentSelectedText = '';
let isProcessing = false;

// 初期化
function initialize() {
  // 選択テキストの監視
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', handleTextSelection);

  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  console.log('Text-Simpler: Content script initialized');
}

/**
 * テキスト選択イベントハンドラ
 */
function handleTextSelection() {
  // 処理中の場合はスキップ
  if (isProcessing) return;

  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // 選択テキストが変更された場合のみ処理
    if (selectedText !== currentSelectedText) {
      currentSelectedText = selectedText;

      // バックグラウンドに選択テキストを通知
      if (selectedText && selectedText.length > 5) {
        chrome.runtime.sendMessage({
          action: 'textSelected',
          text: selectedText
        }).catch(error => {
          console.error('Text-Simpler: Failed to send text selection:', error);
        });
      }
    }
  }, 100);
}

/**
 * ランタイムメッセージハンドラ
 */
function handleRuntimeMessage(request, sender, sendResponse) {
  switch (request.action) {
    case 'getSelectedText':
      sendResponse({
        success: true,
        text: currentSelectedText
      });
      break;

    case 'transformSelectedText':
      handleTransformRequest(request, sendResponse);
      return true; // 非同期レスポンス

    case 'ping':
      sendResponse({ success: true, message: 'Content script is ready' });
      break;

    default:
      sendResponse({
        success: false,
        error: `未対応のアクション: ${request.action}`
      });
  }
}

/**
 * テキスト変換リクエストの処理
 */
async function handleTransformRequest(request, sendResponse) {
  try {
    isProcessing = true;

    const { mode, level, useSelectedText = true } = request;
    let targetText = '';

    if (useSelectedText) {
      targetText = currentSelectedText;
      if (!targetText || targetText.length < 5) {
        throw new Error('変換対象のテキストが選択されていません');
      }
    } else {
      // ページ全体のテキスト取得（MVP版では簡易実装）
      targetText = extractPageText();
      if (!targetText || targetText.length < 5) {
        throw new Error('ページにテキストが見つかりません');
      }
    }

    // テキストが長い場合はチャンク分割
    let transformRequest;
    if (targetText.length > 600) {
      const chunks = splitTextIntoChunks(targetText);
      transformRequest = {
        action: 'transform',
        chunks: chunks,
        mode: mode,
        level: level
      };
    } else {
      transformRequest = {
        action: 'transform',
        text: targetText,
        mode: mode,
        level: level
      };
    }

    // バックグラウンドに変換リクエストを送信
    const response = await chrome.runtime.sendMessage(transformRequest);

    if (response.success) {
      sendResponse({
        success: true,
        originalText: targetText,
        result: response.result || response.results
      });
    } else {
      sendResponse({
        success: false,
        error: response.error,
        errorType: response.errorType,
        canRetry: response.canRetry
      });
    }

  } catch (error) {
    console.error('Text-Simpler: Transform request error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * ページテキストの抽出（簡易版）
 */
function extractPageText() {
  // 主要なコンテンツ要素からテキストを抽出
  const contentSelectors = [
    'main',
    'article',
    '.content',
    '.post',
    '.entry',
    '#content',
    '#main'
  ];

  let content = null;

  // 優先順位順にコンテンツ要素を探す
  for (const selector of contentSelectors) {
    content = document.querySelector(selector);
    if (content) break;
  }

  // 見つからない場合はbody全体を対象
  if (!content) {
    content = document.body;
  }

  // テキストを抽出（スクリプトやスタイルは除外）
  const walker = document.createTreeWalker(
    content,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        // 親要素がscript, style, noscriptの場合は除外
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        // 空白のみのテキストは除外
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textParts = [];
  let node;

  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text) {
      textParts.push(text);
    }
  }

  return textParts.join('\n').trim();
}

/**
 * テキストをチャンクに分割
 */
function splitTextIntoChunks(text, maxChunkSize = 600) {
  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/);

  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    // 段落が最大サイズを超える場合は文単位で分割
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
      const sentences = paragraph.split(/[。！？]/);
      for (const sentence of sentences) {
        if (!sentence.trim()) continue;

        const sentenceWithPunctuation = sentence + '。';

        if (currentChunk.length + sentenceWithPunctuation.length > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push({
              index: chunkIndex++,
              text: currentChunk.trim()
            });
          }
          currentChunk = sentenceWithPunctuation;
        } else {
          currentChunk += sentenceWithPunctuation;
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
 * 変換結果をページに表示（将来の拡張用）
 */
function displayTransformResult(originalText, transformedText, mode) {
  // MVP版では実装しない（ポップアップで表示）
  console.log('Transform result:', {
    mode,
    original: originalText.substring(0, 100) + '...',
    transformed: transformedText.substring(0, 100) + '...'
  });
}

// 初期化実行
initialize();
