/**
 * Text-Simpler Content Script (MVP版)
 * ページ上でのテキスト選択とメッセージ処理を担当
 */

console.log('Text-Simpler: Content script loaded');

// グローバル変数
let currentSelectedText = '';
let currentSelection = null;
let isProcessing = false;
let transformedElements = new Map(); // 変換された要素の履歴を保持

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
      currentSelection = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

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

    case 'undoTransform':
      handleUndoRequest(request, sendResponse);
      break;

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
      // 変換結果を直接ページに適用
      const applyResult = applyTransformToPage(targetText, response.result || response.results, request.mode);

      sendResponse({
        success: true,
        originalText: targetText,
        result: response.result || response.results,
        applied: applyResult.success,
        elementId: applyResult.elementId
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
 * 変換結果をページに直接適用
 */
function applyTransformToPage(originalText, transformResult, mode) {
  try {
    if (!currentSelection) {
      return { success: false, error: '選択範囲が見つかりません' };
    }

    // 変換結果のテキストを取得
    let transformedText = '';
    if (typeof transformResult === 'string') {
      transformedText = transformResult;
    } else if (Array.isArray(transformResult)) {
      // チャンク結果の場合
      transformedText = transformResult
        .filter(chunk => chunk.success)
        .map(chunk => chunk.transformedText)
        .join('\n\n');
    }

    if (!transformedText) {
      return { success: false, error: '変換結果が空です' };
    }

    // 選択範囲を復元
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(currentSelection);

    // 選択範囲の情報を保存
    const range = currentSelection.cloneRange();
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    // 元のテキストと変換後テキストを保存
    const elementId = generateUniqueId();
    const transformData = {
      id: elementId,
      originalText: originalText,
      transformedText: transformedText,
      mode: mode,
      range: {
        startContainer: startContainer,
        endContainer: endContainer,
        startOffset: startOffset,
        endOffset: endOffset
      },
      timestamp: Date.now()
    };

    // 選択範囲のテキストを変換後テキストで置換
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
      // 単一のテキストノード内の場合
      const textNode = range.startContainer;
      const beforeText = textNode.textContent.substring(0, startOffset);
      const afterText = textNode.textContent.substring(endOffset);

      // 新しいマーカー要素を作成
      const markerElement = createMarkerElement(transformedText, elementId, mode);

      // テキストノードを分割して置換
      const parentElement = textNode.parentNode;
      const beforeNode = document.createTextNode(beforeText);
      const afterNode = document.createTextNode(afterText);

      parentElement.insertBefore(beforeNode, textNode);
      parentElement.insertBefore(markerElement, textNode);
      parentElement.insertBefore(afterNode, textNode);
      parentElement.removeChild(textNode);

      // 変換データを保存
      transformedElements.set(elementId, transformData);

      return { success: true, elementId: elementId };
    } else {
      // 複数ノードにまたがる場合（簡易実装）
      const markerElement = createMarkerElement(transformedText, elementId, mode);
      range.deleteContents();
      range.insertNode(markerElement);

      // 変換データを保存
      transformedElements.set(elementId, transformData);

      return { success: true, elementId: elementId };
    }

  } catch (error) {
    console.error('Text-Simpler: Apply transform error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * マーカー要素を作成
 */
function createMarkerElement(text, elementId, mode) {
  const marker = document.createElement('span');
  marker.className = `text-simpler-marker text-simpler-${mode}`;
  marker.setAttribute('data-text-simpler-id', elementId);
  marker.setAttribute('data-text-simpler-mode', mode);
  marker.textContent = text;

  // ダブルクリックで元に戻す
  marker.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    undoTransform(elementId);
  });

  // ホバー時のツールチップ
  marker.title = `変換済み (${getModeDisplayName(mode)}) - ダブルクリックで元に戻す`;

  return marker;
}

/**
 * モード表示名を取得
 */
function getModeDisplayName(mode) {
  const modeNames = {
    'simplify': 'わかりやすく',
    'concretize': '具体化',
    'abstract': '抽象化',
    'grade': '学年レベル'
  };
  return modeNames[mode] || mode;
}

/**
 * ユニークIDを生成
 */
function generateUniqueId() {
  return 'text-simpler-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * 変換を元に戻す
 */
function undoTransform(elementId) {
  const transformData = transformedElements.get(elementId);
  if (!transformData) {
    console.error('Text-Simpler: Transform data not found:', elementId);
    return false;
  }

  try {
    const markerElement = document.querySelector(`[data-text-simpler-id="${elementId}"]`);
    if (!markerElement) {
      console.error('Text-Simpler: Marker element not found:', elementId);
      return false;
    }

    // マーカー要素を元のテキストで置換
    const textNode = document.createTextNode(transformData.originalText);
    markerElement.parentNode.replaceChild(textNode, markerElement);

    // 変換データを削除
    transformedElements.delete(elementId);

    console.log('Text-Simpler: Transform undone:', elementId);
    return true;

  } catch (error) {
    console.error('Text-Simpler: Undo transform error:', error);
    return false;
  }
}

/**
 * 元に戻すリクエストのハンドラ
 */
function handleUndoRequest(request, sendResponse) {
  const { elementId } = request;

  if (elementId) {
    // 特定の要素を元に戻す
    const success = undoTransform(elementId);
    sendResponse({ success: success });
  } else {
    // 全ての変換を元に戻す
    let undoCount = 0;
    for (const [id] of transformedElements) {
      if (undoTransform(id)) {
        undoCount++;
      }
    }
    sendResponse({ success: true, undoCount: undoCount });
  }
}

/**
 * 変換結果をページに表示（レガシー関数）
 */
function displayTransformResult(originalText, transformedText, mode) {
  console.log('Transform result:', {
    mode,
    original: originalText.substring(0, 100) + '...',
    transformed: transformedText.substring(0, 100) + '...'
  });
}

// 初期化実行
initialize();
