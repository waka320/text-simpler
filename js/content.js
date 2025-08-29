/**
 * Text-Simpler Content Script (シンプル版)
 * コンテンツスクリプトの基本機能
 */

console.log('Text-Simpler: Simple content script loaded');

// グローバル変数
let currentSelectedText = '';
let currentSelection = null;
let isProcessing = false;

// 初期化
function initialize() {
  // 選択テキストの監視
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', handleTextSelection);

  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  console.log('Text-Simpler: Simple content script initialized');
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
        text: currentSelectedText,
        selection: currentSelection
      });
      break;

    case 'transformText':
      handleTransformText(request, sendResponse);
      break;

    case 'undoTransform':
      handleUndoTransform(request, sendResponse);
      break;

    case 'undoAllTransforms':
      handleUndoAllTransforms(request, sendResponse);
      break;

    default:
      sendResponse({
        success: false,
        error: `未対応のアクション: ${request.action}`
      });
  }
  return true;
}

/**
 * テキスト変換処理
 */
async function handleTransformText(request, sendResponse) {
  try {
    isProcessing = true;

    const { text, mode, level, elementId } = request;

    // 変換対象テキストの決定
    let targetText = text;
    if (!targetText && currentSelectedText) {
      targetText = currentSelectedText;
    }

    if (!targetText) {
      throw new Error('変換対象のテキストが見つかりません');
    }

    // バックグラウンドに変換リクエスト
    const response = await chrome.runtime.sendMessage({
      action: 'transform',
      text: targetText,
      mode: mode || 'simplify',
      level: level || 'junior'
    });

    if (!response.success) {
      throw new Error(response.error || '変換に失敗しました');
    }

    // 結果をページに適用
    const applyResult = applyTransformToPage(targetText, response.result, elementId);

    sendResponse({
      success: true,
      result: response.result,
      applied: applyResult.success,
      elementId: applyResult.elementId
    });

  } catch (error) {
    console.error('Transform error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * ページに変換結果を適用
 */
function applyTransformToPage(originalText, transformedText, elementId = null) {
  try {
    let targetElement = null;

    // 特定の要素IDが指定されている場合
    if (elementId) {
      targetElement = document.getElementById(elementId);
    }

    // 選択範囲がある場合
    if (!targetElement && currentSelection) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        targetElement = range.commonAncestorContainer;
      }
    }

    // 要素が見つからない場合は新しく作成
    if (!targetElement) {
      targetElement = document.createElement('div');
      targetElement.className = 'text-simpler-result';
      targetElement.style.cssText = `
        background: #f0f8ff;
        border: 1px solid #ccc;
        padding: 10px;
        margin: 10px 0;
        border-radius: 4px;
      `;
      document.body.appendChild(targetElement);
    }

    // テキストを置換
    if (targetElement.nodeType === Node.TEXT_NODE) {
      targetElement.textContent = targetElement.textContent.replace(originalText, transformedText);
    } else {
      targetElement.textContent = transformedText;
    }

    // 要素IDを生成（存在しない場合）
    if (!targetElement.id) {
      targetElement.id = 'text-simpler-' + Date.now();
    }

    return {
      success: true,
      elementId: targetElement.id
    };

  } catch (error) {
    console.error('Apply transform error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 変換の取り消し
 */
function handleUndoTransform(request, sendResponse) {
  try {
    const { elementId } = request;

    if (!elementId) {
      throw new Error('要素IDが指定されていません');
    }

    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error('指定された要素が見つかりません');
    }

    // 要素を削除
    element.remove();

    sendResponse({
      success: true,
      message: '変換を取り消しました'
    });

  } catch (error) {
    console.error('Undo transform error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * すべての変換を取り消し
 */
function handleUndoAllTransforms(request, sendResponse) {
  try {
    // text-simpler-resultクラスを持つ要素をすべて削除
    const elements = document.querySelectorAll('.text-simpler-result');
    let count = 0;

    elements.forEach(element => {
      element.remove();
      count++;
    });

    sendResponse({
      success: true,
      message: `${count}個の変換を取り消しました`
    });

  } catch (error) {
    console.error('Undo all transforms error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// 初期化を実行
initialize();
