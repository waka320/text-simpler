/**
 * Text-Simpler Content Script (シンプル版)
 * コンテンツスクリプトの基本機能
 */

console.log('Text-Simpler: Simple content script loaded');

// グローバル変数
let currentSelectedText = '';
let currentSelection = null;
let isProcessing = false;
let floatingPopup = null;
let isPopupVisible = false;

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

  // ページ読み込み完了後に最小化状態で自動表示
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showMinimizedPopupAutomatically);
  } else {
    // すでに読み込み完了している場合は即座に実行
    setTimeout(showMinimizedPopupAutomatically, 500); // 少し遅延させて安定化
  }

  console.log('Text-Simpler: Simple content script initialized');
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
          console.error('Text-Simpler: Failed to send text selection:', error);
        });
      }

      // フローティングポップアップが表示されている場合はリアルタイム更新
      if (isPopupVisible && floatingPopup) {
        updateFloatingSelectedTextPreview();
        updateFloatingTransformButton();

        // 最小化状態の場合はタイトルも更新
        if (floatingState.isMinimized) {
          updateMinimizedTitle();
        }

        // デバッグログ（選択が変更された場合のみ）
        if (selectedText !== previousText) {
          console.log('Text-Simpler: Updated floating popup with selected text:',
            selectedText ? selectedText.substring(0, 50) + '...' : '(no selection)');
        }
      }
    }
  }, 150); // デバウンス時間を150msに調整
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
    /* Text-Simpler マーカースタイル - 絶対的なスタイル */
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
  if (floatingState && floatingState.mode) {
    return floatingState.mode;
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

    // フローティングポップアップの「全て元に戻す」ボタンの状態を更新
    if (isPopupVisible) {
      updateUndoAllButtonVisibility();
    }

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
    if (isPopupVisible) {
      await hideFloatingPopup();
    } else {
      // ユーザーが意図的に表示したのでフラグをリセット
      await setStorageValue('popupUserClosed', false);
      showFloatingPopup();
    }

    sendResponse({
      success: true,
      visible: isPopupVisible
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
 * フローティングポップアップを表示
 */
function showFloatingPopup() {
  if (floatingPopup) {
    floatingPopup.style.display = 'block';
    isPopupVisible = true;
    return;
  }

  // フローティングポップアップを作成
  floatingPopup = createFloatingPopup();
  document.body.appendChild(floatingPopup);

  // ポップアップの初期化
  initializeFloatingPopup();

  isPopupVisible = true;
}

/**
 * フローティングポップアップを非表示
 */
async function hideFloatingPopup() {
  if (floatingPopup) {
    floatingPopup.style.display = 'none';
    isPopupVisible = false;

    // ユーザーが閉じたことを記録（次回自動表示しない）
    await setStorageValue('popupUserClosed', true);
    console.log('Text-Simpler: Popup closed by user, auto-display disabled');
  }
}

/**
 * フローティングポップアップのHTML要素を作成
 */
function createFloatingPopup() {
  const popup = document.createElement('div');
  popup.id = 'text-simpler-floating-popup';
  popup.innerHTML = `
    <style>
      .ts-mode-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 4px;
        margin-bottom: 8px;
      }
      .ts-mode-tab {
        padding: 8px 6px;
        border: 1px solid #ccc;
        background: #fff;
        color: #333;
        font-size: 11px;
        cursor: pointer;
        border-radius: 3px;
        transition: all 0.2s;
        text-align: center;
        line-height: 1.2;
      }
      .ts-mode-tab:hover {
        background: #f5f5f5;
        border-color: #999;
      }
      .ts-mode-tab.ts-active {
        background: #333;
        color: white;
        border-color: #333;
      }
      .ts-grade-dropdown select {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #ccc;
        border-radius: 3px;
        background: white;
        font-size: 12px;
        color: #333;
        cursor: pointer;
      }
      .ts-grade-dropdown select:focus {
        outline: none;
        border-color: #333;
      }
      .ts-settings-btn {
        background: none;
        border: none;
        color: #333;
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        min-height: 24px;
      }
      .ts-settings-btn:hover {
        background-color: rgba(0, 0, 0, 0.1);
        transform: scale(1.1);
      }
      .ts-settings-icon {
        font-size: 16px;
        line-height: 1;
      }
      .ts-header-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .ts-control-btn {
        background: none;
        border: none;
        color: #333;
        font-size: 14px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        min-height: 24px;
      }
      .ts-control-btn:hover {
        background-color: rgba(0, 0, 0, 0.1);
        transform: scale(1.05);
      }
      .ts-control-btn#ts-minimize-btn {
        background: #007bff;
        color: white;
        border: 1px solid #007bff;
        font-weight: 600;
        font-size: 16px;
        min-width: 28px;
        min-height: 28px;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
      }
      .ts-control-btn#ts-minimize-btn:hover {
        background: #0056b3;
        border-color: #0056b3;
        transform: scale(1.1);
        box-shadow: 0 4px 8px rgba(0, 123, 255, 0.4);
      }
      /* 最小化状態の「＋」ボタンを特別に目立たせる */
      .ts-control-btn#ts-minimize-btn[title="展開"] {
        background: #28a745;
        border-color: #28a745;
        box-shadow: 0 2px 6px rgba(40, 167, 69, 0.4);
        animation: pulse 2s infinite;
      }
      .ts-control-btn#ts-minimize-btn[title="展開"]:hover {
        background: #218838;
        border-color: #218838;
        box-shadow: 0 4px 10px rgba(40, 167, 69, 0.6);
        animation: none;
      }
      @keyframes pulse {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
        100% {
          transform: scale(1);
        }
      }
      .ts-api-key-guide {
        background: #fff3cd;
        color: #856404;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 12px;
        border: 1px solid #ffeaa7;
        box-shadow: 0 2px 4px rgba(255, 193, 7, 0.1);
      }
      .ts-guide-content {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .ts-guide-icon {
        font-size: 18px;
        flex-shrink: 0;
        color: #856404;
      }
      .ts-guide-text {
        flex: 1;
      }
      .ts-guide-text h4 {
        margin: 0 0 2px 0;
        font-size: 13px;
        font-weight: 600;
        color: #856404;
      }
      .ts-guide-text p {
        margin: 0;
        font-size: 11px;
        color: #856404;
        line-height: 1.2;
        opacity: 0.8;
      }
      .ts-setup-btn {
        background: #856404;
        border: 1px solid #856404;
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
      }
      .ts-setup-btn:hover {
        background: #6d5204;
        border-color: #6d5204;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(133, 100, 4, 0.3);
      }
      .ts-popup-main {
        padding: 8px;
      }
      .ts-popup-main section {
        margin-bottom: 12px;
      }
      .ts-grade-section {
        background: #f9f9f9;
        padding: 8px;
        border-radius: 3px;
        border: 1px solid #ddd;
      }
    </style>
    <div class="ts-popup-container">
      <!-- ヘッダー（ドラッグハンドル） -->
      <header class="ts-popup-header" id="ts-popup-header">
        <h1>Text-Simpler</h1>
        <div class="ts-header-controls">
          <button id="ts-settings-btn" class="ts-control-btn ts-settings-btn" title="設定" aria-label="設定">
            <span class="ts-settings-icon">⚙️</span>
          </button>
          <button id="ts-minimize-btn" class="ts-control-btn" title="最小化">−</button>
          <button id="ts-close-btn" class="ts-control-btn" title="閉じる">×</button>
        </div>
      </header>

      <!-- メインコンテンツ -->
      <main class="ts-popup-main" id="ts-popup-main">
        <!-- モード選択 -->
        <section class="ts-mode-section">
          <div class="ts-mode-tabs">
            <button class="ts-mode-tab ts-active" data-mode="lexicon">語・記号の意味がわからない</button>
            <button class="ts-mode-tab" data-mode="load">情報量が多すぎる</button>
            <button class="ts-mode-tab" data-mode="cohesion">文と文の関係がわからない</button>
          </div>
        </section>

        <!-- 学年レベル選択 -->
        <section class="ts-grade-section" id="ts-grade-section">
          <div class="ts-grade-dropdown">
            <select id="ts-grade-level-select" name="ts-grade-level">
              <option value="none">学年レベル: なし</option>
              <option value="university">学年レベル: 大学生</option>
              <option value="senior">学年レベル: 高校生</option>
              <option value="junior" selected>学年レベル: 中学生</option>
              <option value="elementary">学年レベル: 小学生</option>
              <option value="kindergarten">学年レベル: 幼稚園児</option>
            </select>
          </div>
        </section>


        <!-- APIキー設定案内 -->
        <section class="ts-api-key-guide" id="ts-api-key-guide" style="display: none;">
          <div class="ts-guide-content">
            <div class="ts-guide-icon">🔑</div>
            <div class="ts-guide-text">
              <h4>APIキーを設定してください</h4>
              <p>Gemini APIキーを設定すると、テキスト変換機能が利用できます</p>
            </div>
            <button id="ts-setup-api-btn" class="ts-setup-btn">設定</button>
          </div>
        </section>

        <!-- 選択テキスト表示 -->
        <section class="ts-selected-text-section">
          <div class="ts-selected-text-preview" id="ts-selected-text-preview">
            テキストを選択してください
          </div>
        </section>

        <!-- 実行ボタン -->
        <section class="ts-action-section">
          <button id="ts-transform-btn" class="ts-transform-btn" disabled>
            変換実行
          </button>
          <button id="ts-undo-all-btn" class="ts-undo-all-btn" style="display: none;">
            全て元に戻す
          </button>
        </section>



        <!-- エラー表示 -->
        <section class="ts-error-section" id="ts-error-section" style="display: none;">
          <div class="ts-error-content">
            <div class="ts-error-message" id="ts-error-message"></div>
            <div class="ts-error-actions">
              <button id="ts-retry-btn" class="ts-retry-btn" style="display: none;">再試行</button>
              <button id="ts-close-error-btn" class="ts-close-error-btn">閉じる</button>
            </div>
          </div>
        </section>

        <!-- ローディング表示 -->
        <section class="ts-loading-section" id="ts-loading-section" style="display: none;">
          <div class="ts-loading-content">
            <div class="ts-spinner"></div>
            <div class="ts-loading-message">変換中...</div>
          </div>
        </section>
      </main>
    </div>
  `;

  // スタイルを適用
  applyFloatingPopupStyles(popup);

  return popup;
}

/**
 * フローティングポップアップにスタイルを適用
 */
function applyFloatingPopupStyles(popup) {
  popup.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    width: 420px;
    max-height: 500px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: #333;
    overflow: hidden;
  `;
}

/**
 * フローティングポップアップの初期化
 */
function initializeFloatingPopup() {
  if (!floatingPopup) return;

  // ドラッグ機能の初期化
  initializeDragFunctionality();

  // イベントリスナーの設定
  setupFloatingPopupEventListeners();

  // 初期状態の更新
  updateFloatingPopupUI();

  // APIキーの状態をチェックして案内を表示
  setTimeout(() => {
    updateApiKeyGuideVisibility();
  }, 100);
}

/**
 * ドラッグ機能の初期化
 */
function initializeDragFunctionality() {
  const header = floatingPopup.querySelector('#ts-popup-header');
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  header.style.cursor = 'move';

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = floatingPopup.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    // ドラッグ中のスタイル
    floatingPopup.style.opacity = '0.8';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    // 画面外に出ないように制限
    const maxX = window.innerWidth - floatingPopup.offsetWidth;
    const maxY = window.innerHeight - floatingPopup.offsetHeight;

    floatingPopup.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    floatingPopup.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    floatingPopup.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      floatingPopup.style.opacity = '1';
      document.body.style.userSelect = '';
    }
  });
}

/**
 * フローティングポップアップのイベントリスナー設定
 */
function setupFloatingPopupEventListeners() {
  // 設定ボタン
  const settingsBtn = floatingPopup.querySelector('#ts-settings-btn');
  settingsBtn.addEventListener('click', handleFloatingSettings);

  // 最小化ボタン
  const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');
  minimizeBtn.addEventListener('click', toggleMinimize);

  // 閉じるボタン
  const closeBtn = floatingPopup.querySelector('#ts-close-btn');
  closeBtn.addEventListener('click', hideFloatingPopup);

  // モードタブ
  const modeTabs = floatingPopup.querySelectorAll('.ts-mode-tab');
  modeTabs.forEach(tab => {
    tab.addEventListener('click', handleFloatingModeChange);
  });

  // 学年レベル
  const gradeLevelSelect = floatingPopup.querySelector('#ts-grade-level-select');
  gradeLevelSelect.addEventListener('change', handleFloatingGradeLevelChange);

  // APIキー設定ボタン
  const setupApiBtn = floatingPopup.querySelector('#ts-setup-api-btn');
  setupApiBtn.addEventListener('click', handleFloatingSettings);

  // 変換ボタン
  const transformBtn = floatingPopup.querySelector('#ts-transform-btn');
  transformBtn.addEventListener('click', handleFloatingTransform);

  // その他のボタン
  const undoAllBtn = floatingPopup.querySelector('#ts-undo-all-btn');
  undoAllBtn.addEventListener('click', handleFloatingUndoAll);



  const retryBtn = floatingPopup.querySelector('#ts-retry-btn');
  retryBtn.addEventListener('click', handleFloatingRetry);

  const closeErrorBtn = floatingPopup.querySelector('#ts-close-error-btn');
  closeErrorBtn.addEventListener('click', handleFloatingCloseError);
}

// フローティングポップアップの状態管理
let floatingState = {
  mode: 'lexicon',
  gradeLevel: 'junior',
  isMinimized: false,
  isProcessing: false,
  lastResult: null
};

/**
 * 最小化の切り替え
 */
function toggleMinimize() {
  const main = floatingPopup.querySelector('#ts-popup-main');
  const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');
  const settingsBtn = floatingPopup.querySelector('#ts-settings-btn');

  floatingState.isMinimized = !floatingState.isMinimized;

  if (floatingState.isMinimized) {
    // 最小化状態
    if (main) main.style.display = 'none';
    minimizeBtn.textContent = '+';
    minimizeBtn.title = '展開';
    floatingPopup.style.height = 'auto';
    floatingPopup.style.width = '250px'; // 最小化時は幅を狭く

    // 設定ボタンを非表示
    if (settingsBtn) {
      settingsBtn.style.display = 'none';
    }

    // 最小化状態でのタイトル更新
    updateMinimizedTitle();
  } else {
    // 展開状態
    if (main) main.style.display = 'block';
    minimizeBtn.textContent = '−';
    minimizeBtn.title = '最小化';
    floatingPopup.style.width = '420px'; // 元の幅に戻す

    // 設定ボタンを表示
    if (settingsBtn) {
      settingsBtn.style.display = 'flex';
    }

    // 元のタイトルに戻す
    const title = floatingPopup.querySelector('.ts-popup-header h1');
    if (title) {
      title.textContent = 'Text-Simpler';
    }
  }
}

/**
 * 最小化状態でのタイトル更新
 */
function updateMinimizedTitle() {
  const title = floatingPopup.querySelector('.ts-popup-header h1');
  if (!title) return;

  if (currentSelectedText && currentSelectedText.length > 0) {
    // 選択テキストがある場合
    const truncated = currentSelectedText.length > 15
      ? currentSelectedText.substring(0, 15) + '...'
      : currentSelectedText;
    title.textContent = `📝 ${truncated}`;
    title.style.fontSize = '13px'; // 少し小さく
  } else {
    // 選択テキストがない場合
    title.textContent = '📝 テキストを選択';
    title.style.fontSize = '13px';
  }
}

/**
 * フローティングポップアップのUI更新
 */
function updateFloatingPopupUI() {
  if (!floatingPopup) return;

  // モードタブの更新
  const modeTabs = floatingPopup.querySelectorAll('.ts-mode-tab');
  modeTabs.forEach(tab => {
    tab.classList.toggle('ts-active', tab.dataset.mode === floatingState.mode);
  });

  // 学年レベルの更新
  const gradeLevelSelect = floatingPopup.querySelector('#ts-grade-level-select');
  if (gradeLevelSelect) {
    gradeLevelSelect.value = floatingState.gradeLevel;
  }

  // APIキー設定案内の表示/非表示
  updateApiKeyGuideVisibility();

  // 選択テキストプレビューの更新
  updateFloatingSelectedTextPreview();

  // 変換ボタンの状態更新
  updateFloatingTransformButton();

  // 「全て元に戻す」ボタンの状態更新
  updateUndoAllButtonVisibility();
}

/**
 * 選択テキストプレビューの更新
 */
function updateFloatingSelectedTextPreview() {
  const preview = floatingPopup.querySelector('#ts-selected-text-preview');

  if (currentSelectedText) {
    const truncated = currentSelectedText.length > 120
      ? currentSelectedText.substring(0, 120) + '...'
      : currentSelectedText;
    preview.textContent = truncated;
    preview.className = 'ts-selected-text-preview ts-has-text';
  } else {
    preview.textContent = 'テキストを選択してください';
    preview.className = 'ts-selected-text-preview ts-no-text';
  }
}

/**
 * 変換ボタンの状態更新
 */
function updateFloatingTransformButton() {
  const transformBtn = floatingPopup.querySelector('#ts-transform-btn');

  // APIキーの状態をチェック
  chrome.runtime.sendMessage({
    action: 'getSettings',
    keys: ['geminiApiKey']
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to check API key status:', chrome.runtime.lastError);
      return;
    }

    const hasApiKey = response && response.success &&
      response.settings &&
      response.settings.geminiApiKey &&
      response.settings.geminiApiKey.trim().length > 0;

    const canTransform = !floatingState.isProcessing &&
      hasApiKey &&
      currentSelectedText &&
      currentSelectedText.length > 5;

    transformBtn.disabled = !canTransform;
    transformBtn.textContent = floatingState.isProcessing ? '変換中...' : '変換実行';

    if (!hasApiKey) {
      transformBtn.title = 'APIキーを設定してください';
    } else {
      transformBtn.title = '';
    }
  });
}

// イベントハンドラー関数群
function handleFloatingModeChange(event) {
  floatingState.mode = event.target.dataset.mode;
  updateFloatingPopupUI();
}

function handleFloatingGradeLevelChange(event) {
  floatingState.gradeLevel = event.target.value;
}

async function handleFloatingTransform() {
  if (floatingState.isProcessing || !currentSelectedText) return;

  try {
    floatingState.isProcessing = true;
    hideFloatingError();
    showFloatingLoading();
    updateFloatingPopupUI();

    // 変換リクエストを送信（既存のhandleTransformText関数を利用）
    const request = {
      text: currentSelectedText,
      mode: floatingState.mode,
      level: floatingState.gradeLevel
    };

    await new Promise((resolve, reject) => {
      handleTransformText(request, (response) => {
        if (response.success) {
          floatingState.lastResult = response.result;

          // 「全て元に戻す」ボタンの表示を更新
          updateUndoAllButtonVisibility();

          // ステータスメッセージを更新（フッターが存在する場合のみ）
          const statusText = floatingPopup.querySelector('#ts-status-text');
          if (statusText) {
            statusText.textContent = '変換完了';
          }

          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });

  } catch (error) {
    console.error('Floating transform error:', error);
    showFloatingError(error.message, true);
  } finally {
    floatingState.isProcessing = false;
    hideFloatingLoading();
    updateFloatingPopupUI();
  }
}

async function handleFloatingUndoAll() {
  try {
    await new Promise((resolve, reject) => {
      handleUndoAllTransforms({}, (response) => {
        if (response.success) {
          // 「全て元に戻す」ボタンを非表示
          updateUndoAllButtonVisibility();

          const statusText = floatingPopup.querySelector('#ts-status-text');
          if (statusText) {
            statusText.textContent = response.message || '変換を元に戻しました';
          }

          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  } catch (error) {
    console.error('Floating undo all error:', error);
  }
}

/**
 * APIキー設定案内の表示/非表示を更新
 */
function updateApiKeyGuideVisibility() {
  if (!floatingPopup) return;

  const apiKeyGuide = floatingPopup.querySelector('#ts-api-key-guide');
  const transformBtn = floatingPopup.querySelector('#ts-transform-btn');
  const modeSection = floatingPopup.querySelector('.ts-mode-section');
  const selectedTextSection = floatingPopup.querySelector('.ts-selected-text-section');
  const actionSection = floatingPopup.querySelector('.ts-action-section');
  const gradeSection = floatingPopup.querySelector('.ts-grade-section');

  // APIキーの状態をチェック
  chrome.runtime.sendMessage({
    action: 'getSettings',
    keys: ['geminiApiKey']
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to check API key status:', chrome.runtime.lastError);
      return;
    }

    const hasApiKey = response && response.success &&
      response.settings &&
      response.settings.geminiApiKey &&
      response.settings.geminiApiKey.trim().length > 0;

    if (apiKeyGuide) {
      apiKeyGuide.style.display = hasApiKey ? 'none' : 'block';
    }

    // APIキーがない場合は不要なセクションを非表示
    if (modeSection) {
      modeSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (selectedTextSection) {
      selectedTextSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (actionSection) {
      actionSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (gradeSection) {
      gradeSection.style.display = hasApiKey ? 'block' : 'none';
    }

    if (transformBtn) {
      // APIキーがない場合は変換ボタンを無効化
      transformBtn.disabled = !hasApiKey || !currentSelectedText || currentSelectedText.length <= 5;
      if (!hasApiKey) {
        transformBtn.title = 'APIキーを設定してください';
      } else {
        transformBtn.title = '';
      }
    }
  });
}

/**
 * 「全て元に戻す」ボタンの表示/非表示を更新
 */
function updateUndoAllButtonVisibility() {
  if (!floatingPopup) return;

  const undoAllBtn = floatingPopup.querySelector('#ts-undo-all-btn');
  const markers = document.querySelectorAll('.text-simpler-marker');

  // マーカーが存在する場合のみボタンを表示
  undoAllBtn.style.display = markers.length > 0 ? 'inline-block' : 'none';
}



function handleFloatingRetry() {
  hideFloatingError();
  handleFloatingTransform();
}

function handleFloatingCloseError() {
  hideFloatingError();
  const statusText = floatingPopup.querySelector('#ts-status-text');
  if (statusText) {
    statusText.textContent = '準備完了';
  }
}

/**
 * フローティングポップアップの設定ボタンハンドラー
 */
function handleFloatingSettings() {
  console.log('Settings button clicked, attempting to open options page...');

  try {
    // 方法1: background.jsを経由してオプションページを開く
    chrome.runtime.sendMessage({
      action: 'openOptionsPage'
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        // フォールバック: 直接URLを開く
        openOptionsPageDirectly();
      } else if (response && response.success) {
        console.log('Options page opened successfully via background');
      } else {
        console.error('Failed to open options page via background:', response);
        openOptionsPageDirectly();
      }
    });
  } catch (error) {
    console.error('Error sending message to background:', error);
    // フォールバック: 直接URLを開く
    openOptionsPageDirectly();
  }
}

/**
 * 直接オプションページを開く（フォールバック）
 */
function openOptionsPageDirectly() {
  try {
    console.log('Opening options page directly...');
    const optionsUrl = chrome.runtime.getURL('html/options.html');
    console.log('Options URL:', optionsUrl);

    // 新しいタブで開く
    window.open(optionsUrl, '_blank');
  } catch (error) {
    console.error('Failed to open options page directly:', error);
    // 最後の手段: ユーザーに手動で開くよう指示
    alert('設定ページを開けませんでした。拡張機能の管理ページから手動で設定を開いてください。');
  }
}

// UI表示制御関数群
function showFloatingLoading() {
  const loadingSection = floatingPopup.querySelector('#ts-loading-section');
  loadingSection.style.display = 'block';
}

function hideFloatingLoading() {
  const loadingSection = floatingPopup.querySelector('#ts-loading-section');
  loadingSection.style.display = 'none';
}



function showFloatingError(message, canRetry = false) {
  const errorSection = floatingPopup.querySelector('#ts-error-section');
  const errorMessage = floatingPopup.querySelector('#ts-error-message');
  const retryBtn = floatingPopup.querySelector('#ts-retry-btn');

  errorMessage.textContent = message;
  retryBtn.style.display = canRetry ? 'inline-block' : 'none';
  errorSection.style.display = 'block';
}

function hideFloatingError() {
  const errorSection = floatingPopup.querySelector('#ts-error-section');
  errorSection.style.display = 'none';
}



/**
 * 最小化状態でポップアップを自動表示
 */
async function showMinimizedPopupAutomatically() {
  try {
    // すでに表示されている場合はスキップ
    if (isPopupVisible && floatingPopup) {
      return;
    }

    // ユーザーが明示的に閉じた場合は表示しない
    const userClosed = await getStorageValue('popupUserClosed', false);
    if (userClosed) {
      console.log('Text-Simpler: Popup auto-display skipped (user closed)');
      return;
    }

    // フローティングポップアップを作成・表示
    showFloatingPopup();

    // 展開状態のままにする（デフォルトで展開）
    if (floatingPopup) {
      floatingState.isMinimized = false;
      const main = floatingPopup.querySelector('#ts-popup-main');
      const minimizeBtn = floatingPopup.querySelector('#ts-minimize-btn');

      if (main) {
        main.style.display = 'block';
      }
      if (minimizeBtn) {
        minimizeBtn.textContent = '−';
        minimizeBtn.title = '最小化';
      }

      // 展開状態用のスタイル調整
      floatingPopup.style.width = '420px'; // 通常の幅

      // 設定ボタンを表示
      const settingsBtn = floatingPopup.querySelector('#ts-settings-btn');
      if (settingsBtn) {
        settingsBtn.style.display = 'flex';
      }

      // 通常のタイトル
      const title = floatingPopup.querySelector('.ts-popup-header h1');
      if (title) {
        title.textContent = 'Text-Simpler';
      }

      console.log('Text-Simpler: Auto-displayed expanded popup');
    }
  } catch (error) {
    console.error('Text-Simpler: Auto-display error:', error);
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
