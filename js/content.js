/**
 * Text-Simpler Content Script (Modular Version)
 * モジュール化されたコンテンツスクリプト
 */

console.log('Text-Simpler: Modular content script loaded');

// グローバル変数
let currentSelectedText = '';
let currentSelection = null;
let isProcessing = false;

// モジュールインスタンス（グローバル変数から取得）
const modules = {
  eventBus: typeof eventBus !== 'undefined' ? eventBus : null,
  textProcessor: typeof textProcessor !== 'undefined' ? textProcessor : null,
  uiComponents: typeof uiComponents !== 'undefined' ? uiComponents : null,
  domManipulator: typeof domManipulator !== 'undefined' ? domManipulator : null
};

// 初期化
function initialize() {
  // 選択テキストの監視
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', handleTextSelection);
  
  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  
  // イベントバスの設定
  if (modules.eventBus) {
    setupEventListeners();
  }
  
  console.log('Text-Simpler: Modular content script initialized');
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
  // 選択変更イベント
  modules.eventBus.on(modules.eventBus.EVENT_TYPES.SELECTION_CHANGED, (data) => {
    console.log('Selection changed:', data);
  });
  
  // 変換成功イベント
  modules.eventBus.on(modules.eventBus.EVENT_TYPES.TRANSFORM_SUCCESS, (data) => {
    console.log('Transform success:', data);
  });
}

/**
 * テキスト選択イベントハンドラ
 */
function handleTextSelection() {
  if (isProcessing) return;
  
  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 選択テキストが変更された場合のみ処理
    if (selectedText !== currentSelectedText) {
      currentSelectedText = selectedText;
      currentSelection = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
      
      // DOM操作モジュールの選択範囲を更新
      if (modules.domManipulator && modules.domManipulator.selectionManager) {
        modules.domManipulator.selectionManager.updateSelection();
      }
      
      // イベントバスで通知
      if (modules.eventBus) {
        modules.eventBus.emitTyped(modules.eventBus.EVENT_TYPES.SELECTION_CHANGED, {
          text: selectedText,
          length: selectedText.length
        });
      }
      
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
      // ページ全体のテキスト取得
      if (modules.domManipulator) {
        targetText = modules.domManipulator.extractPageText();
      } else {
        targetText = extractPageTextFallback();
      }
      
      if (!targetText || targetText.length < 5) {
        throw new Error('ページにテキストが見つかりません');
      }
    }
    
    // テキストが長い場合はチャンク分割
    let transformRequest;
    if (targetText.length > 600) {
      let chunks;
      if (modules.textProcessor) {
        chunks = modules.textProcessor.splitIntoChunks(targetText);
      } else {
        chunks = splitTextIntoChunksFallback(targetText);
      }
      
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
      let applyResult = { success: false };
      
      if (modules.domManipulator) {
        applyResult = modules.domManipulator.replaceSelectedText(
          targetText, 
          response.result || response.results, 
          mode, 
          currentSelection
        );
      } else {
        applyResult = applyTransformToPageFallback(targetText, response.result || response.results, mode);
      }
      
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
 * 元に戻すリクエストのハンドラ
 */
function handleUndoRequest(request, sendResponse) {
  const { elementId } = request;
  
  if (modules.domManipulator) {
    if (elementId) {
      // 特定の要素を元に戻す
      const success = modules.domManipulator.undoTransform(elementId);
      sendResponse({ success: success });
    } else {
      // 全ての変換を元に戻す
      const undoCount = modules.domManipulator.undoAllTransforms();
      sendResponse({ success: true, undoCount: undoCount });
    }
  } else {
    // フォールバック処理
    const undoCount = undoAllTransformsFallback();
    sendResponse({ success: true, undoCount: undoCount });
  }
}

/**
 * ページテキスト抽出のフォールバック
 */
function extractPageTextFallback() {
  const contentSelectors = [
    'main', 'article', '.content', '.post', '.entry', '#content', '#main'
  ];
  
  let content = null;
  for (const selector of contentSelectors) {
    content = document.querySelector(selector);
    if (content) break;
  }
  
  if (!content) {
    content = document.body;
  }
  
  const walker = document.createTreeWalker(
    content,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript'].includes(tagName)) {
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
 * テキスト分割のフォールバック
 */
function splitTextIntoChunksFallback(text, maxChunkSize = 600) {
  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push({
          index: chunkIndex++,
          text: currentChunk.trim()
        });
        currentChunk = '';
      }
      
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
  
  if (currentChunk.trim()) {
    chunks.push({
      index: chunkIndex++,
      text: currentChunk.trim()
    });
  }
  
  return chunks;
}

/**
 * 変換適用のフォールバック
 */
function applyTransformToPageFallback(originalText, transformResult, mode) {
  // 簡易的なフォールバック実装
  console.log('Applying transform (fallback):', { originalText: originalText.substring(0, 50), mode });
  return { success: false, error: 'DOM操作モジュールが利用できません' };
}

/**
 * 全変換取り消しのフォールバック
 */
function undoAllTransformsFallback() {
  const markers = document.querySelectorAll('[data-text-simpler-id]');
  let undoCount = 0;
  
  markers.forEach(marker => {
    try {
      const textNode = document.createTextNode(marker.textContent);
      marker.parentNode.replaceChild(textNode, marker);
      undoCount++;
    } catch (error) {
      console.error('Undo fallback error:', error);
    }
  });
  
  return undoCount;
}

// 初期化実行
initialize();
