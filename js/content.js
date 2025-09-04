/**
 * ReadEasy. Content Script (シンプル版)
 * コンテンツスクリプトの基本機能
 */

console.log('ReadEasy.: Simple content script loaded');

// グローバル変数
let currentSelectedText = '';
let currentSelection = null;
let isProcessing = false;

// 初期化
function initialize() {
  // マーカー用のスタイルシートを確実に注入
  ensureMarkerStyles();

  // 選択テキストの監視（より包括的に）
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', handleTextSelection);
  document.addEventListener('selectionchange', handleTextSelection);

  // クリックで選択解除される場合にも対応
  document.addEventListener('click', handleTextSelection);

  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  // フローティングUIとの連携を設定
  setupFloatingUIIntegration();

  // ページ読み込み完了後に自動表示
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.dispatchEvent(new CustomEvent('ts-auto-show-popup'));
    });
  } else {
    // すでに読み込み完了している場合は即座に実行
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('ts-auto-show-popup'));
    }, 500);
  }

  console.log('ReadEasy.: Simple content script initialized');
}

// デバウンス用のタイマー
let selectionUpdateTimer = null;

/**
 * テキスト選択イベントハンドラ
 */
function handleTextSelection() {
  if (isProcessing) return;

  // 前のタイマーをクリア（デバウンス）
  if (selectionUpdateTimer) {
    clearTimeout(selectionUpdateTimer);
  }

  selectionUpdateTimer = setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // 選択テキストが変更された場合のみ処理
    if (selectedText !== currentSelectedText) {
      const previousText = currentSelectedText;
      currentSelectedText = selectedText;
      currentSelection = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

      // バックグラウンドに選択テキストを通知
      if (selectedText && selectedText.length > 5) {
        chrome.runtime.sendMessage({
          action: 'textSelected',
          text: selectedText
        }).catch(error => {
          console.error('ReadEasy.: Failed to send text selection:', error);
        });
      }

      // フローティングUIに選択テキストの変更を通知
      if (selectedText !== previousText) {
        document.dispatchEvent(new CustomEvent('ts-update-selected-text', {
          detail: { selectedText }
        }));

        console.log('ReadEasy.: Updated floating popup with selected text:',
          selectedText ? selectedText.substring(0, 50) + '...' : '(no selection)');
      }
    }
  }, 150); // デバウンス時間を150msに調整
}

/**
 * フローティングUIとの連携を設定
 */
function setupFloatingUIIntegration() {
  // 選択テキスト取得リクエストの処理
  document.addEventListener('ts-get-selected-text', () => {
    document.dispatchEvent(new CustomEvent('ts-selected-text-response', {
      detail: { selectedText: currentSelectedText }
    }));
  });

  // 変換リクエストの処理
  document.addEventListener('ts-transform-request', async (event) => {
    const { mode, level } = event.detail;

    if (!currentSelectedText) {
      document.dispatchEvent(new CustomEvent('ts-transform-error', {
        detail: { message: '変換対象のテキストが見つかりません' }
      }));
      return;
    }

    try {
      // バックグラウンドに変換リクエスト
      const response = await chrome.runtime.sendMessage({
        action: 'transform',
        text: currentSelectedText,
        mode: mode || 'lexicon',
        level: level || 'junior'
      });

      if (!response.success) {
        throw new Error(response.error || '変換に失敗しました');
      }

      // 結果をページに適用
      const applyResult = applyTransformToPage(currentSelectedText, response.result);

      document.dispatchEvent(new CustomEvent('ts-transform-complete', {
        detail: {
          result: response.result,
          applied: applyResult.success,
          elementId: applyResult.elementId
        }
      }));

    } catch (error) {
      console.error('Transform error:', error);
      document.dispatchEvent(new CustomEvent('ts-transform-error', {
        detail: { message: error.message }
      }));
    }
  });

  // 取り消しリクエストの処理
  document.addEventListener('ts-undo-all-request', () => {
    handleUndoAllTransforms({}, (response) => {
      if (response.success) {
        document.dispatchEvent(new CustomEvent('ts-undo-all-complete', {
          detail: { message: response.message }
        }));
      }
    });
  });
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

    case 'toggleFloatingPopup':
      handleToggleFloatingPopup(request, sendResponse);
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
    // 選択範囲を使用してマーカーを作成
    if (currentSelection) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = currentSelection;
        return applyMarkerToSelection(range, originalText, transformedText);
      }
    }

    // フォールバック: テキスト検索で適用
    return applyMarkerByTextSearch(originalText, transformedText);

  } catch (error) {
    console.error('Apply transform error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 選択範囲にマーカーを適用
 */
function applyMarkerToSelection(range, originalText, transformedText) {
  try {
    // 選択されたテキストが期待されるテキストと一致するか確認
    const selectedText = range.toString().trim();
    if (selectedText !== originalText.trim()) {
      console.warn('Selected text does not match original text');
    }

    // マーカー要素を作成
    const marker = createMarkerElement(transformedText, originalText, getCurrentMode());

    // 選択範囲を削除してマーカーを挿入
    range.deleteContents();
    range.insertNode(marker);

    // 選択をクリア
    window.getSelection().removeAllRanges();

    return {
      success: true,
      elementId: marker.id,
      marker: marker
    };

  } catch (error) {
    console.error('Apply marker to selection error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * テキスト検索でマーカーを適用（フォールバック）
 */
function applyMarkerByTextSearch(originalText, transformedText) {
  try {
    // TreeWalkerを使用してテキストノードを検索
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          // マーカー内のテキストは除外
          if (node.parentElement && node.parentElement.classList.contains('text-simpler-marker')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent.includes(originalText) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let textNode = walker.nextNode();
    while (textNode) {
      const textContent = textNode.textContent;
      const index = textContent.indexOf(originalText);

      if (index !== -1) {
        // テキストノードを分割してマーカーを挿入
        const beforeText = textContent.substring(0, index);
        const afterText = textContent.substring(index + originalText.length);

        // 新しいテキストノードを作成
        const beforeNode = document.createTextNode(beforeText);
        const afterNode = document.createTextNode(afterText);
        const marker = createMarkerElement(transformedText, originalText, getCurrentMode());

        // 親要素に新しいノードを挿入
        const parent = textNode.parentNode;
        parent.insertBefore(beforeNode, textNode);
        parent.insertBefore(marker, textNode);
        parent.insertBefore(afterNode, textNode);
        parent.removeChild(textNode);

        return {
          success: true,
          elementId: marker.id,
          marker: marker
        };
      }

      textNode = walker.nextNode();
    }

    return {
      success: false,
      error: 'Original text not found in document'
    };

  } catch (error) {
    console.error('Apply marker by text search error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * マーカー要素を作成
 */
function createMarkerElement(transformedText, originalText, mode) {
  // マーカー用のスタイルシートを確実に注入
  ensureMarkerStyles();

  const marker = document.createElement('span');
  marker.className = `text-simpler-marker text-simpler-${mode}`;
  marker.id = 'text-simpler-marker-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

  // 改行表示の改善: <br> を改行文字に戻し、連続する改行を1つにまとめる
  let safeText = String(transformedText).replace(/<br\s*\/?>(\s*)/gi, '\n');
  // 連続する改行を1つにまとめる（3つ以上の改行を2つに）
  safeText = safeText.replace(/\n{3,}/g, '\n\n');
  marker.textContent = safeText;

  // 元のテキストをデータ属性として保存
  marker.setAttribute('data-original-text', originalText);
  marker.setAttribute('data-mode', mode);
  marker.setAttribute('title', 'ダブルクリックで元に戻す');

  // インラインスタイルで絶対的なスタイルを適用
  applyAbsoluteMarkerStyle(marker, mode);

  // ダブルクリックで元に戻すイベントリスナー
  marker.addEventListener('dblclick', function () {
    restoreMarker(this);
  });

  // ホバー時のツールチップ機能
  setupMarkerTooltip(marker);

  return marker;
}

/**
 * マーカー用のスタイルシートを確実に注入
 */
function ensureMarkerStyles() {
  // すでに注入されている場合はスキップ
  if (document.getElementById('text-simpler-marker-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'text-simpler-marker-styles';
  style.textContent = `
    /* ReadEasy. マーカースタイル - 絶対的なスタイル */
    .text-simpler-marker {
      display: inline !important;
      position: relative !important;
      z-index: 1000 !important;
      font-family: inherit !important;
      font-size: inherit !important;
      font-weight: inherit !important;
      line-height: 1.2 !important;
      text-decoration: none !important;
      text-transform: none !important;
      letter-spacing: normal !important;
      word-spacing: normal !important;
      text-shadow: none !important;
      box-shadow: none !important;
      border: none !important;
      outline: none !important;
      margin: 0 !important;
      padding: 2px 4px !important;
      border-radius: 3px !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
      vertical-align: baseline !important;
      white-space: pre-line !important;
      word-wrap: normal !important;
      overflow-wrap: normal !important;
    }

    /* マーカー内の段落間の余白を調整 */
    .text-simpler-marker p {
      margin: 0.1em 0 !important;
      line-height: 1.2 !important;
    }

    .text-simpler-marker p:first-child {
      margin-top: 0 !important;
    }

    .text-simpler-marker p:last-child {
      margin-bottom: 0 !important;
    }

    /* モード別の色設定 */
    .text-simpler-lexicon {
      background-color: rgba(255, 235, 59, 0.3) !important; /* 黄色系 - 語・記号の意味 */
      color: inherit !important;
    }

    .text-simpler-load {
      background-color: rgba(76, 175, 80, 0.3) !important; /* 緑色系 - 情報量削減 */
      color: inherit !important;
    }

    .text-simpler-cohesion {
      background-color: rgba(33, 150, 243, 0.3) !important; /* 青色系 - つながり補強 */
      color: inherit !important;
    }

    /* 後方互換性 */
    .text-simpler-simplify {
      background-color: rgba(255, 193, 7, 0.3) !important;
      color: inherit !important;
    }

    .text-simpler-concretize {
      background-color: rgba(156, 39, 176, 0.3) !important;
      color: inherit !important;
    }

    .text-simpler-abstract {
      background-color: rgba(255, 87, 34, 0.3) !important;
      color: inherit !important;
    }

    .text-simpler-grade {
      background-color: rgba(96, 125, 139, 0.3) !important;
      color: inherit !important;
    }

    /* ホバー効果 */
    .text-simpler-marker:hover {
      background-color: rgba(0, 0, 0, 0.1) !important;
      transform: none !important;
      filter: brightness(0.9) !important;
    }

    /* フォーカス状態 */
    .text-simpler-marker:focus {
      outline: 2px solid rgba(0, 123, 255, 0.5) !important;
      outline-offset: 1px !important;
    }

    /* ツールチップスタイル */
    .text-simpler-tooltip {
      position: absolute !important;
      z-index: 10001 !important;
      background-color: rgba(0, 0, 0, 0.9) !important;
      color: white !important;
      padding: 6px 10px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
      pointer-events: none !important;
      opacity: 0 !important;
      transform: translateY(-5px) !important;
      transition: opacity 0.2s ease, transform 0.2s ease !important;
      border: none !important;
      margin: 0 !important;
      text-decoration: none !important;
      text-transform: none !important;
      letter-spacing: normal !important;
      word-spacing: normal !important;
      text-shadow: none !important;
      text-align: center !important;
    }

    .text-simpler-tooltip.show {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    /* ツールチップの矢印 */
    .text-simpler-tooltip::after {
      content: '' !important;
      position: absolute !important;
      top: 100% !important;
      left: 50% !important;
      margin-left: -5px !important;
      border: 5px solid transparent !important;
      border-top-color: rgba(0, 0, 0, 0.9) !important;
      border-bottom: none !important;
    }
  `;

  // headまたはbodyに追加
  const target = document.head || document.body || document.documentElement;
  if (target) {
    target.appendChild(style);
  }
}

/**
 * 絶対的なインラインスタイルを適用
 */
function applyAbsoluteMarkerStyle(marker, mode) {
  // モード別の背景色
  const modeColors = {
    'lexicon': 'rgba(255, 235, 59, 0.3)', // 黄色系 - 語・記号の意味
    'load': 'rgba(76, 175, 80, 0.3)',     // 緑色系 - 情報量削減
    'cohesion': 'rgba(33, 150, 243, 0.3)', // 青色系 - つながり補強
    // 後方互換性
    'simplify': 'rgba(255, 193, 7, 0.3)',
    'concretize': 'rgba(156, 39, 176, 0.3)',
    'abstract': 'rgba(255, 87, 34, 0.3)',
    'grade': 'rgba(96, 125, 139, 0.3)'
  };

  const backgroundColor = modeColors[mode] || modeColors['lexicon'];

  // 絶対的なインラインスタイル
  marker.style.cssText = `
    display: inline !important;
    position: relative !important;
    z-index: 1000 !important;
    background-color: ${backgroundColor} !important;
    color: inherit !important;
    font-family: inherit !important;
    font-size: inherit !important;
    font-weight: inherit !important;
    line-height: 1.2 !important;
    text-decoration: none !important;
    text-transform: none !important;
    letter-spacing: normal !important;
    word-spacing: normal !important;
    text-shadow: none !important;
    box-shadow: none !important;
    border: none !important;
    outline: none !important;
    margin: 0 !important;
    padding: 2px 4px !important;
    border-radius: 3px !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    vertical-align: baseline !important;
    white-space: pre-line !important;
    word-wrap: normal !important;
    overflow-wrap: normal !important;
  `;
}

/**
 * マーカーにツールチップ機能を設定
 */
function setupMarkerTooltip(marker) {
  let tooltip = null;
  let showTimeout = null;
  let hideTimeout = null;

  // マウスオーバー時
  marker.addEventListener('mouseenter', function (e) {
    // 既存のタイムアウトをクリア
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    // 少し遅延してツールチップを表示
    showTimeout = setTimeout(() => {
      tooltip = createTooltip('ダブルクリックで元に戻す');
      document.body.appendChild(tooltip);
      positionTooltip(tooltip, marker);

      // 少し遅延してアニメーション開始
      setTimeout(() => {
        tooltip.classList.add('show');
      }, 10);
    }, 300); // 300ms遅延
  });

  // マウスアウト時
  marker.addEventListener('mouseleave', function (e) {
    // 表示タイムアウトをクリア
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }

    // ツールチップが存在する場合は非表示にする
    if (tooltip) {
      tooltip.classList.remove('show');

      hideTimeout = setTimeout(() => {
        if (tooltip && tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
        tooltip = null;
        hideTimeout = null;
      }, 200); // アニメーション時間に合わせて遅延
    }
  });

  // ダブルクリック時はツールチップを即座に非表示
  marker.addEventListener('dblclick', function (e) {
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
      tooltip = null;
    }
  });
}

/**
 * ツールチップ要素を作成
 */
function createTooltip(text) {
  const tooltip = document.createElement('div');
  tooltip.className = 'text-simpler-tooltip';
  tooltip.textContent = text;

  // 絶対的なスタイルを適用
  tooltip.style.cssText = `
    position: absolute !important;
    z-index: 10001 !important;
    background-color: rgba(0, 0, 0, 0.9) !important;
    color: white !important;
    padding: 6px 10px !important;
    border-radius: 4px !important;
    font-size: 12px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    font-weight: 500 !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
    pointer-events: none !important;
    opacity: 0 !important;
    transform: translateY(-5px) !important;
    transition: opacity 0.2s ease, transform 0.2s ease !important;
    border: none !important;
    margin: 0 !important;
    text-decoration: none !important;
    text-transform: none !important;
    letter-spacing: normal !important;
    word-spacing: normal !important;
    text-shadow: none !important;
    text-align: center !important;
  `;

  return tooltip;
}

/**
 * ツールチップの位置を調整
 */
function positionTooltip(tooltip, marker) {
  const markerRect = marker.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  // マーカーの上部中央に配置
  let left = markerRect.left + (markerRect.width / 2) - (tooltipRect.width / 2);
  let top = markerRect.top - tooltipRect.height - 8; // 8pxの余白

  // 画面外に出ないように調整
  const padding = 10;
  if (left < padding) {
    left = padding;
  } else if (left + tooltipRect.width > window.innerWidth - padding) {
    left = window.innerWidth - tooltipRect.width - padding;
  }

  if (top < padding) {
    // 上に表示できない場合は下に表示
    top = markerRect.bottom + 8;
  }

  // スクロール位置を考慮
  left += window.scrollX;
  top += window.scrollY;

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

/**
 * 現在のモードを取得
 */
function getCurrentMode() {
  // フローティングUIから取得を試行
  if (window.FloatingUI && window.FloatingUI.getMode) {
    return window.FloatingUI.getMode();
  }
  return 'lexicon'; // デフォルト
}

/**
 * マーカーを元のテキストに戻す
 */
function restoreMarker(marker) {
  try {
    const originalText = marker.getAttribute('data-original-text');
    const textNode = document.createTextNode(originalText);

    marker.parentNode.replaceChild(textNode, marker);

    console.log('Marker restored to original text:', originalText);
  } catch (error) {
    console.error('Restore marker error:', error);
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
    // text-simpler-markerクラスを持つ要素をすべて元に戻す
    const markers = document.querySelectorAll('.text-simpler-marker');
    let count = 0;

    markers.forEach(marker => {
      restoreMarker(marker);
      count++;
    });

    // 古いシステムの要素も削除（後方互換性）
    const oldElements = document.querySelectorAll('.text-simpler-result');
    oldElements.forEach(element => {
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

/**
 * フローティングポップアップの切り替え
 */
async function handleToggleFloatingPopup(request, sendResponse) {
  try {
    const isVisible = window.FloatingUI && window.FloatingUI.isVisible();

    if (isVisible) {
      document.dispatchEvent(new CustomEvent('ts-hide-popup'));
    } else {
      // ユーザーが意図的に表示したのでフラグをリセット
      await setStorageValue('popupUserClosed', false);
      document.dispatchEvent(new CustomEvent('ts-show-popup'));
    }

    sendResponse({
      success: true,
      visible: !isVisible
    });
  } catch (error) {
    console.error('Toggle floating popup error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * ストレージから値を取得
 */
async function getStorageValue(key, defaultValue) {
  try {
    const result = await chrome.storage.local.get([key]);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error('Storage get error:', error);
    return defaultValue;
  }
}

/**
 * ストレージに値を保存
 */
async function setStorageValue(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error('Storage set error:', error);
  }
}

// 初期化を実行
initialize();
