/**
 * AI Text Simplifier コンテンツスクリプト
 * ページ上でテキスト選択時の処理を担当
 */
import { GeminiAPI } from './api/gemini.js';
import { OpenAIAPI } from './api/openai.js';
import { StorageUtils } from './utils/storage.js';
import { UIUtils } from './utils/ui.js';
import { ErrorHandler } from './utils/errors.js';

// 初期化
console.log('AI Text Simplifier: content script loaded');

// グローバル変数
let activeTooltip = null;
let isSelectionInProgress = false;

// イベントリスナー登録
function initEventListeners() {
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('click', handleDocumentClick);
  
  // メッセージリスナー登録
  chrome.runtime.onMessage.addListener(handleRuntimeMessages);
  
  // 拡張機能の準備完了を通知
  chrome.runtime.sendMessage({ action: 'contentScriptReady' });
}

// マウスダウンイベントハンドラ
function handleMouseDown() {
  isSelectionInProgress = true;
}

// マウスアップイベントハンドラ
function handleMouseUp(event) {
  if (!isSelectionInProgress) return;
  isSelectionInProgress = false;
  
  // 選択テキストの処理
  setTimeout(() => {
    processSelectedText(event);
  }, 100);
}

// 選択テキスト処理
function processSelectedText(event) {
  const selectedText = window.getSelection().toString().trim();
  console.log('選択テキスト:', selectedText);
  
  // 選択テキストをバックグラウンドに通知
  if (selectedText && selectedText.length > 5) {
    chrome.runtime.sendMessage({
      action: 'textSelected',
      text: selectedText
    });
    
    // 既存のツールチップがあれば閉じる
    closeActiveTooltip();
    
    // 新しいツールチップを表示
    showTooltip(event.pageX, event.pageY, selectedText);
  }
}

// ドキュメントクリックイベントハンドラ
function handleDocumentClick(event) {
  if (activeTooltip && !activeTooltip.contains(event.target)) {
    closeActiveTooltip();
  }
}

// アクティブなツールチップを閉じる
function closeActiveTooltip() {
  if (activeTooltip) {
    document.body.removeChild(activeTooltip);
    activeTooltip = null;
  }
}

// ツールチップ表示
function showTooltip(x, y, text) {
  try {
    // シャドウDOM付きのコンテナ作成
    const container = createTooltipContainer(x, y);
    
    // シャドウDOMにスタイルとコンテンツを追加
    const shadowRoot = container.attachShadow({ mode: 'open' });
    addStylesToShadowRoot(shadowRoot);
    
    // ツールチップ要素を作成
    const tooltip = createTooltipElement(text);
    shadowRoot.appendChild(tooltip);
    
    // イベントリスナーを追加
    addTooltipEventListeners(shadowRoot, tooltip, text);
    
    // 表示
    document.body.appendChild(container);
    activeTooltip = container;
    
    console.log('ツールチップ表示完了');
  } catch (error) {
    console.error('ツールチップ作成エラー:', error);
  }
}

// 残りの関数は省略...

// 初期化実行
initEventListeners();