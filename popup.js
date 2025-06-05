// APIキー保存処理
document.getElementById('save').addEventListener('click', () => {
  const apiKey = document.getElementById('api-key').value;
  const model = document.getElementById('model-select').value;
  
  chrome.storage.sync.set({ 
    'gemini-api-key': apiKey,
    'selected-model': model
  }, () => {
    const status = document.getElementById('status');
    status.textContent = '設定を保存しました！';
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
  });
});

// ページ読み込み時に保存済み設定を表示
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['gemini-api-key', 'selected-model'], (result) => {
    if (result['gemini-api-key']) {
      document.getElementById('api-key').value = result['gemini-api-key'];
    }
    if (result['selected-model']) {
      document.getElementById('model-select').value = result['selected-model'];
    }
  });
});

// API呼び出し例
async function simplifyText(text, level) {
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
  return response.json();
}
