// オプション設定の保存
document.getElementById('save-options').addEventListener('click', () => {
  const geminiApiKey = document.getElementById('api-key-gemini').value;
  const openaiApiKey = document.getElementById('api-key-openai').value;
  const defaultModel = document.getElementById('default-model').value;
  const defaultLevel = document.getElementById('default-level').value;
  const enableContextMenu = document.getElementById('enable-context-menu').checked;
  
  chrome.storage.sync.set({
    'gemini-api-key': geminiApiKey,
    'openai-api-key': openaiApiKey,
    'selected-model': defaultModel,
    'default-level': defaultLevel,
    'enable-context-menu': enableContextMenu
  }, () => {
    const status = document.getElementById('status-message');
    status.textContent = '設定を保存しました！';
    status.classList.add('success');
    
    // コンテキストメニューの設定を更新
    if (enableContextMenu) {
      // コンテキストメニューの有効化
      chrome.contextMenus.create({
        id: 'simplify-text',
        title: '選択したテキストを簡略化',
        contexts: ['selection']
      }, () => {
        if (chrome.runtime.lastError) {
          // メニューが既に存在する場合は無視
        }
      });
    } else {
      // コンテキストメニューの無効化
      chrome.contextMenus.remove('simplify-text');
    }
    
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('success');
    }, 2000);
  });
});

// オプション設定のリセット
document.getElementById('reset-options').addEventListener('click', () => {
  if (confirm('本当に設定をリセットしますか？')) {
    chrome.storage.sync.set({
      'selected-model': 'gemini',
      'default-level': '中学生',
      'enable-context-menu': true
    }, () => {
      // APIキーはセキュリティ上の理由から消去
      document.getElementById('api-key-gemini').value = '';
      document.getElementById('api-key-openai').value = '';
      document.getElementById('default-model').value = 'gemini';
      document.getElementById('default-level').value = '中学生';
      document.getElementById('enable-context-menu').checked = true;
      
      const status = document.getElementById('status-message');
      status.textContent = '設定をリセットしました';
      status.classList.add('success');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('success');
      }, 2000);
    });
  }
});

// 保存済み設定の読み込み
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get([
    'gemini-api-key',
    'openai-api-key',
    'selected-model',
    'default-level',
    'enable-context-menu'
  ], (result) => {
    if (result['gemini-api-key']) {
      document.getElementById('api-key-gemini').value = result['gemini-api-key'];
    }
    if (result['openai-api-key']) {
      document.getElementById('api-key-openai').value = result['openai-api-key'];
    }
    if (result['selected-model']) {
      document.getElementById('default-model').value = result['selected-model'];
    }
    if (result['default-level']) {
      document.getElementById('default-level').value = result['default-level'];
    }
    if (result.hasOwnProperty('enable-context-menu')) {
      document.getElementById('enable-context-menu').checked = result['enable-context-menu'];
    }
  });
});