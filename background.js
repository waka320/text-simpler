// サービスワーカーとして動作するバックグラウンドスクリプト
chrome.runtime.onInstalled.addListener(() => {
  // 初回インストール時のデフォルト設定
  chrome.storage.sync.get(['gemini-api-key', 'selected-model'], (result) => {
    if (!result['selected-model']) {
      chrome.storage.sync.set({ 'selected-model': 'gemini' });
    }
  });
  
  // オプションページへのリンクをコンテキストメニューに追加
  chrome.contextMenus.create({
    id: 'simplify-text',
    title: '選択したテキストを簡略化',
    contexts: ['selection']
  });
});

// コンテキストメニューのクリックハンドラー
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'simplify-text') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'simplifySelectedText',
      text: info.selectionText
    });
  }
});

// コンテンツスクリプトとの通信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkApiKey') {
    chrome.storage.sync.get(['gemini-api-key'], (result) => {
      sendResponse({ hasApiKey: !!result['gemini-api-key'] });
    });
    return true; // 非同期レスポンスのために必要
  }
});