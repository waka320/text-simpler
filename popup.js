// ポップアップ開始時に設定を確認
document.addEventListener('DOMContentLoaded', () => {
  // APIキーの存在をチェック
  chrome.storage.sync.get([
    'gemini-api-key', 
    'openai-api-key',
    'selected-model',
    'default-level'
  ], (result) => {
    const geminiKeyExists = !!result['gemini-api-key'];
    const openaiKeyExists = !!result['openai-api-key'];
    const selectedModel = result['selected-model'] || 'gemini';
    
    // APIキーの状態に応じて表示を切り替え
    if ((selectedModel === 'gemini' && !geminiKeyExists) || 
        (selectedModel === 'chatgpt' && !openaiKeyExists)) {
      document.getElementById('api-not-set').style.display = 'block';
      document.getElementById('main-content').style.display = 'none';
    } else {
      document.getElementById('api-not-set').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
      
      // 現在の設定を表示
      if (result['gemini-api-key']) {
        document.getElementById('api-key').value = result['gemini-api-key'];
      }
      if (result['selected-model']) {
        document.getElementById('model-select').value = result['selected-model'];
      }
      if (result['default-level']) {
        document.getElementById('default-level').value = result['default-level'];
      } else {
        // デフォルト値を設定
        document.getElementById('default-level').value = '中学生';
      }
    }
  });
  
  // オプションページを開くボタンのイベントハンドラを設定
  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('open-options-link').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

// 保存ボタンのイベントハンドラ
document.getElementById('save').addEventListener('click', () => {
  const apiKey = document.getElementById('api-key').value;
  const model = document.getElementById('model-select').value;
  const defaultLevel = document.getElementById('default-level').value;
  
  // モデル選択に応じて適切なキーを保存
  if (model === 'gemini') {
    chrome.storage.sync.set({ 
      'gemini-api-key': apiKey,
      'selected-model': model,
      'default-level': defaultLevel
    }, showSavedMessage);
  } else {
    chrome.storage.sync.set({ 
      'openai-api-key': apiKey,
      'selected-model': model,
      'default-level': defaultLevel
    }, showSavedMessage);
  }
});

// 保存完了メッセージの表示
function showSavedMessage() {
  const status = document.getElementById('status');
  status.textContent = '設定を保存しました！';
  status.classList.add('success');
  
  setTimeout(() => {
    status.textContent = '';
    status.classList.remove('success');
  }, 2000);
}

// モデル選択変更時の処理
document.getElementById('model-select').addEventListener('change', (e) => {
  const model = e.target.value;
  // モデルに応じてAPIキー欄のラベルを変更
  const apiKeyLabel = document.querySelector('label[for="api-key"]');
  
  if (model === 'gemini') {
    apiKeyLabel.textContent = 'Gemini API キー';
    // Gemini APIキーがあれば表示
    chrome.storage.sync.get(['gemini-api-key'], (result) => {
      if (result['gemini-api-key']) {
        document.getElementById('api-key').value = result['gemini-api-key'];
      } else {
        document.getElementById('api-key').value = '';
      }
    });
  } else {
    apiKeyLabel.textContent = 'OpenAI API キー';
    // OpenAI APIキーがあれば表示
    chrome.storage.sync.get(['openai-api-key'], (result) => {
      if (result['openai-api-key']) {
        document.getElementById('api-key').value = result['openai-api-key'];
      } else {
        document.getElementById('api-key').value = '';
      }
    });
  }
});

// API呼び出しのサンプル関数
async function simplifyText(text, level) {
  try {
    const settings = await chrome.storage.sync.get(['gemini-api-key', 'openai-api-key', 'selected-model']);
    const model = settings['selected-model'] || 'gemini';
    
    if (model === 'gemini') {
      const apiKey = settings['gemini-api-key'];
      if (!apiKey) throw new Error('Gemini APIキーが設定されていません');
      
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `次の文章を${level}レベルに平易化してください:\n${text}`
            }]
          }]
        })
      });
      
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } else {
      const apiKey = settings['openai-api-key'];
      if (!apiKey) throw new Error('OpenAI APIキーが設定されていません');
      
      // OpenAI API呼び出し
      // 実装は上記のcontent.jsと同様
    }
  } catch (error) {
    console.error('API呼び出しエラー:', error);
    throw error;
  }
}
