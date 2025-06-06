// ポップアップ開始時に設定を確認
document.addEventListener('DOMContentLoaded', async () => {
  // APIキーの存在をチェック
  chrome.storage.sync.get([
    'gemini-api-key', 
    'openai-api-key',
    'selected-model',
    'default-level'
  ], async (result) => {
    const geminiKeyExists = !!result['gemini-api-key'];
    const openaiKeyExists = !!result['openai-api-key'];
    const selectedModel = result['selected-model'] || 'gemini';
    
    // APIキーの状態に応じて表示を切り替え
    if ((selectedModel === 'gemini' && !geminiKeyExists) || 
        (selectedModel === 'chatgpt' && !openaiKeyExists)) {
      document.getElementById('api-not-set').style.display = 'block';
      document.getElementById('simplify-content').style.display = 'none';
      document.getElementById('no-text-selected').style.display = 'none';
    } else {
      // 選択中のテキストを取得
      try {
        const activeTab = await getCurrentTab();
        if (!activeTab) {
          console.error('アクティブタブが見つかりません');
          return;
        }
        
        // バックグラウンドスクリプトから選択テキストを取得
        chrome.runtime.sendMessage({ action: 'getSelectedText' }, async (response) => {
          let selectedText = response?.text || '';
          
          // バックグラウンドに保存されていなければ、コンテンツスクリプトから直接取得
          if (!selectedText) {
            try {
              const contentResponse = await chrome.tabs.sendMessage(
                activeTab.id, 
                { action: 'getSelectedText' }
              );
              selectedText = contentResponse?.text || '';
            } catch (error) {
              console.error('コンテンツスクリプトからテキスト取得エラー:', error);
            }
          }
          
          if (selectedText && selectedText.length > 5) {
            // 選択テキストがある場合
            document.getElementById('no-text-selected').style.display = 'none';
            document.getElementById('simplify-content').style.display = 'block';
            
            // 選択テキストを表示
            const selectedTextElement = document.getElementById('selected-text');
            // 長すぎる場合は省略
            selectedTextElement.textContent = selectedText.length > 300 ? 
              selectedText.substring(0, 300) + '...' : selectedText;
            
            // レベルボタンにイベントリスナーを設定
            const levelButtons = document.querySelectorAll('.level-button');
            levelButtons.forEach(button => {
              button.addEventListener('click', async () => {
                // 処理中の表示
                document.getElementById('loading').style.display = 'block';
                document.getElementById('simplified-result-container').style.display = 'none';
                
                // ボタンスタイルの更新
                levelButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                try {
                  // テキストを簡略化
                  const level = button.dataset.level;
                  const simplifiedText = await simplifyText(selectedText, level);
                  
                  // 結果を表示
                  const resultElement = document.getElementById('simplified-result');
                  resultElement.innerHTML = addClickableWords(simplifiedText);
                  
                  // 単語クリックイベントを追加
                  const words = resultElement.querySelectorAll('.simplified-word');
                  words.forEach(word => {
                    word.addEventListener('click', async () => {
                      const wordExplanation = await getWordExplanation(word.textContent);
                      showWordTooltip(word, wordExplanation);
                    });
                  });
                  
                  document.getElementById('loading').style.display = 'none';
                  document.getElementById('simplified-result-container').style.display = 'block';
                } catch (error) {
                  console.error('テキスト簡略化エラー:', error);
                  
                  // エラーメッセージを表示
                  const resultElement = document.getElementById('simplified-result');
                  resultElement.innerHTML = `<div class="error-message">エラーが発生しました: ${error.message}</div>`;
                  
                  document.getElementById('loading').style.display = 'none';
                  document.getElementById('simplified-result-container').style.display = 'block';
                }
              });
            });
          } else {
            // 選択テキストがない場合
            document.getElementById('no-text-selected').style.display = 'block';
            document.getElementById('simplify-content').style.display = 'none';
          }
        });
      } catch (error) {
        console.error('ポップアップ初期化エラー:', error);
      }
    }
    
    // モデル選択の現在値を設定
    if (result['selected-model']) {
      document.getElementById('model-select').value = result['selected-model'];
    }
  });
  
  // オプションページを開くボタンのイベントハンドラを設定
  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // モデル選択変更時の処理
  document.getElementById('model-select').addEventListener('change', (e) => {
    const model = e.target.value;
    chrome.storage.sync.set({ 'selected-model': model });
  });
});

// アクティブなタブを取得する関数
async function getCurrentTab() {
  const queryOptions = { active: true, currentWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

// テキストを簡略化する関数
async function simplifyText(text, level) {
  const settings = await chrome.storage.sync.get(['gemini-api-key', 'openai-api-key', 'selected-model']);
  const model = settings['selected-model'] || 'gemini';
  let apiKey;
  
  if (model === 'gemini') {
    apiKey = settings['gemini-api-key'];
    if (!apiKey) throw new Error('Gemini APIキーが設定されていません');
    
    const endpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `次の文章を${level}レベルに平易化してください。重要な専門用語や理解すべき単語には<mark>タグをつけてください:\n${text}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          topK: 40
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API応答エラー (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    // 新しいバージョンに対応したデータ抽出
    let resultText = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      resultText = data.candidates[0].content.parts[0].text;
    } else if (data.content && data.content.parts && data.content.parts[0]) {
      resultText = data.content.parts[0].text;
    } else {
      throw new Error('APIから有効なレスポンスが返されませんでした');
    }
    
    return resultText;
  } else {
    apiKey = settings['openai-api-key'];
    if (!apiKey) throw new Error('OpenAI APIキーが設定されていません');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `あなたは文章を簡単にわかりやすく説明するアシスタントです。専門用語や難しい概念を${level}レベルの言葉で説明してください。`
          },
          {
            role: 'user',
            content: `次の文章を${level}レベルに平易化してください。重要な専門用語や理解すべき単語には<mark>タグをつけてください:\n${text}`
          }
        ],
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API応答エラー (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('APIから有効なレスポンスが返されませんでした');
    }
    
    return data.choices[0].message.content;
  }
}

// 単語の説明を取得
async function getWordExplanation(word) {
  const settings = await chrome.storage.sync.get(['gemini-api-key', 'selected-model']);
  const apiKey = settings['gemini-api-key'];
  const model = settings['selected-model'] || 'gemini';
  
  try {
    if (model === 'gemini') {
      const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `「${word}」という単語を小学生にもわかるように簡潔に説明してください。50字以内でお願いします。`
            }]
          }]
        })
      });
      
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } else {
      // ChatGPT実装
      // ...既存のコードと同様...
    }
  } catch (error) {
    return 'エラー: 説明を取得できませんでした';
  }
}

// マークタグを含むテキストをクリック可能な単語に変換
function addClickableWords(text) {
  return text.replace(/<mark>(.*?)<\/mark>/g, '<span class="simplified-word">$1</span>');
}

// 単語ツールチップを表示
function showWordTooltip(wordElement, explanation) {
  // 既存のツールチップを削除
  const existingTooltips = document.querySelectorAll('.word-tooltip');
  existingTooltips.forEach(tooltip => tooltip.remove());
  
  // 新しいツールチップ要素を作成
  const tooltip = document.createElement('div');
  tooltip.className = 'word-tooltip';
  tooltip.textContent = explanation;
  
  // ポジションを取得
  const rect = wordElement.getBoundingClientRect();
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${rect.bottom + 5}px`;
  
  // ポップアップに追加
  document.body.appendChild(tooltip);
  
  // クリックで閉じる
  tooltip.addEventListener('click', () => {
    tooltip.remove();
  });
  
  // 一定時間後に自動で消える
  setTimeout(() => {
    if (document.body.contains(tooltip)) {
      tooltip.remove();
    }
  }, 5000);
}
