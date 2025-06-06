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
    }, (response) => {
      // エラーハンドリング
      if (chrome.runtime.lastError) {
        console.error('メッセージ送信エラー:', chrome.runtime.lastError.message);
        
        // タブのステータス確認
        chrome.tabs.get(tab.id, (tabInfo) => {
          if (chrome.runtime.lastError) {
            console.error('タブ取得エラー:', chrome.runtime.lastError.message);
            return;
          }
          
          // タブが読み込まれていない場合は、読み込み完了後にコンテンツスクリプトを挿入
          if (tabInfo.status !== 'complete') {
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                
                // コンテンツスクリプトを実行
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['content.js']
                }, () => {
                  // 再試行
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tab.id, {
                      action: 'simplifySelectedText',
                      text: info.selectionText
                    });
                  }, 500);
                });
              }
            });
          }
        });
      }
    });
  }
});

// アクションクリックハンドラーを修正
chrome.action.onClicked.addListener((tab) => {
  // ポップアップがあるのでこの処理は実行されないが念のため残しておく
  console.log('アクションクリック検出');
  
  // アクティブなタブにスクリプトを実行して選択テキストを取得
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      return window.getSelection().toString().trim();
    }
  }, (results) => {
    if (chrome.runtime.lastError) {
      console.error('スクリプト実行エラー:', chrome.runtime.lastError.message);
      return;
    }
    
    const selectedText = results && results[0] && results[0].result;
    if (selectedText && selectedText.length > 5) {
      // 選択テキストがあればコンテンツスクリプトにメッセージ送信
      chrome.tabs.sendMessage(tab.id, {
        action: 'simplifySelectedText',
        text: selectedText
      }).catch(err => {
        console.error('メッセージ送信エラー:', err);
      });
    } else {
      console.log('テキストが選択されていません');
    }
  });
});

// テキスト選択時の処理を追加

// 現在選択中のテキストを保持する変数
let currentSelectedText = '';

// テキスト選択時のメッセージ受信処理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'textSelected') {
    // 選択されたテキストを保存
    currentSelectedText = request.text;
    
    // 拡張機能アイコンを有効化（選択テキストがある場合）
    if (currentSelectedText && currentSelectedText.length > 5) {
      chrome.action.setIcon({
        path: {
          "16": "icons/icon16_active.png",
          "32": "icons/icon32_active.png",
          "48": "icons/icon48_active.png",
          "128": "icons/icon128_active.png"
        },
        tabId: sender.tab.id
      });
    } else {
      // テキストが短い/ない場合は非アクティブアイコンに戻す
      chrome.action.setIcon({
        path: {
          "16": "icons/icon16.png",
          "32": "icons/icon32.png",
          "48": "icons/icon48.png",
          "128": "icons/icon128.png"
        },
        tabId: sender.tab.id
      });
    }
  } else if (request.action === 'contentScriptReady') {
    console.log('コンテンツスクリプトの準備完了:', sender.tab.id);
    sendResponse({ received: true });
  } else if (request.action === 'getSelectedText') {
    // 現在保存されている選択テキストを返す
    sendResponse({ text: currentSelectedText });
  } else if (request.action === 'checkApiKey') {
    chrome.storage.sync.get(['gemini-api-key'], (result) => {
      sendResponse({ hasApiKey: !!result['gemini-api-key'] });
    });
    return true;
  }
});

// タブ切り替え時やフォーカス変更時にアイコン状態をリセット
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.action.setIcon({
    path: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    tabId: activeInfo.tabId
  });
  
  // 新しいタブで選択中のテキストを確認
  chrome.tabs.sendMessage(activeInfo.tabId, { action: 'getSelectedText' }, (response) => {
    if (chrome.runtime.lastError) {
      // エラーは無視（コンテンツスクリプトがまだロードされていない可能性）
      return;
    }
    if (response && response.text && response.text.length > 5) {
      currentSelectedText = response.text;
      chrome.action.setIcon({
        path: {
          "16": "icons/icon16_active.png",
          "32": "icons/icon32_active.png",
          "48": "icons/icon48_active.png",
          "128": "icons/icon128_active.png"
        },
        tabId: activeInfo.tabId
      });
    }
  });
});