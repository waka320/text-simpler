const style = document.createElement('style');
style.textContent = `
.simplify-tooltip {
  position: absolute;
  background: white;
  border: 1px solid #ccc;
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0,0,0,0.2);
  z-index: 10000;
  max-width: 300px;
}
.level-selector {
  display: flex;
  gap: 5px;
  margin-bottom: 10px;
}
.level-selector button {
  padding: 5px 10px;
  border: none;
  border-radius: 3px;
  background-color: #4285f4;
  color: white;
  cursor: pointer;
}
.level-selector button:hover {
  background-color: #3b78e7;
}
.simplified-text {
  margin-top: 10px;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 3px;
  font-size: 14px;
  line-height: 1.4;
}
.simplified-word {
  background-color: #e8f0fe;
  padding: 0 2px;
  border-radius: 2px;
  cursor: help;
}
.word-tooltip {
  position: absolute;
  background: white;
  border: 1px solid #ddd;
  padding: 8px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10001;
  max-width: 250px;
  font-size: 13px;
}
`;
document.head.appendChild(style);

// トグル可能なツールチップ用変数
let activeTooltip = null;

// テキスト選択時の処理
document.addEventListener('mouseup', async (event) => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText && selectedText.length > 10) {
        // 既存のツールチップがあれば閉じる
        if (activeTooltip) {
            document.body.removeChild(activeTooltip);
            activeTooltip = null;
        }
        showTooltip(event.pageX, event.pageY, selectedText);
    }
});

// クリック時のツールチップ閉じる処理
document.addEventListener('click', (event) => {
    if (activeTooltip && !activeTooltip.contains(event.target)) {
        document.body.removeChild(activeTooltip);
        activeTooltip = null;
    }
});

// ツールチップ表示
function showTooltip(x, y, text) {
    const tooltip = document.createElement('div');
    tooltip.className = 'simplify-tooltip';
    tooltip.innerHTML = `
    <div class="tooltip-header">難易度を選択してください</div>
    <div class="level-selector">
      <button data-level="小学生">小学生</button>
      <button data-level="中学生">中学生</button>
      <button data-level="高校生">高校生</button>
      <button data-level="大学生">大学生</button>
    </div>
    <div class="simplified-text" id="simplified-result">簡略化されたテキストがここに表示されます</div>
  `;
    
    // 位置調整
    tooltip.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
    tooltip.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    
    document.body.appendChild(tooltip);
    activeTooltip = tooltip;
    
    // レベル選択ボタンにイベントリスナーを追加
    const buttons = tooltip.querySelectorAll('.level-selector button');
    buttons.forEach(button => {
        button.addEventListener('click', async () => {
            const level = button.dataset.level;
            const resultDiv = tooltip.querySelector('#simplified-result');
            resultDiv.textContent = '処理中...';
            
            try {
                const simplifiedText = await simplifyTextWithAPI(text, level);
                resultDiv.innerHTML = addClickableWords(simplifiedText);
                
                // 単語クリックイベントを追加
                const words = resultDiv.querySelectorAll('.simplified-word');
                words.forEach(word => {
                    word.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const wordText = word.textContent;
                        await showWordDefinition(wordText, e.pageX, e.pageY);
                    });
                });
            } catch (error) {
                resultDiv.textContent = 'エラーが発生しました: ' + error.message;
            }
        });
    });
}

// APIを使用してテキストを簡略化
async function simplifyTextWithAPI(text, level) {
    // API情報を取得
    const settings = await chrome.storage.sync.get(['gemini-api-key', 'selected-model']);
    const apiKey = settings['gemini-api-key'];
    const model = settings['selected-model'] || 'gemini';
    
    if (!apiKey) {
        throw new Error('APIキーが設定されていません。拡張機能の設定を確認してください。');
    }
    
    if (model === 'gemini') {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `次の文章を${level}レベルに平易化してください。重要な単語には<mark>タグをつけて下さい:\n${text}`
                    }]
                }]
            })
        });
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        return data.candidates[0].content.parts[0].text;
    } else {
        // ChatGPTの場合（仮実装）
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
                        role: 'user',
                        content: `次の文章を${level}レベルに平易化してください。重要な単語には<mark>タグをつけて下さい:\n${text}`
                    }
                ],
                temperature: 0.7
            })
        });
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        return data.choices[0].message.content;
    }
}

// マークタグを含むテキストをクリック可能な単語に変換
function addClickableWords(text) {
    return text.replace(/<mark>(.*?)<\/mark>/g, '<span class="simplified-word">$1</span>');
}

// 単語の説明を表示
async function showWordDefinition(word, x, y) {
    // 既存の単語説明ツールチップを削除
    const existingTooltip = document.querySelector('.word-tooltip');
    if (existingTooltip) {
        document.body.removeChild(existingTooltip);
    }
    
    const wordTooltip = document.createElement('div');
    wordTooltip.className = 'word-tooltip';
    wordTooltip.textContent = '読み込み中...';
    
    // 位置調整
    wordTooltip.style.left = `${Math.min(x + 10, window.innerWidth - 270)}px`;
    wordTooltip.style.top = `${Math.min(y + 10, window.innerHeight - 100)}px`;
    
    document.body.appendChild(wordTooltip);
    
    // API情報を取得
    const settings = await chrome.storage.sync.get(['gemini-api-key', 'selected-model']);
    const apiKey = settings['gemini-api-key'];
    const model = settings['selected-model'] || 'gemini';
    
    try {
        if (model === 'gemini') {
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
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
            wordTooltip.textContent = data.candidates[0].content.parts[0].text;
        } else {
            // ChatGPT実装
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
                            role: 'user',
                            content: `「${word}」という単語を小学生にもわかるように簡潔に説明してください。50字以内でお願いします。`
                        }
                    ],
                    temperature: 0.7
                })
            });
            
            const data = await response.json();
            wordTooltip.textContent = data.choices[0].message.content;
        }
    } catch (error) {
        wordTooltip.textContent = 'エラー: 説明を取得できませんでした';
    }
    
    // クリックで閉じる
    wordTooltip.addEventListener('click', () => {
        document.body.removeChild(wordTooltip);
    });
    
    // 外部クリックでも閉じる
    setTimeout(() => {
        document.addEventListener('click', function closeTooltip(e) {
            if (!wordTooltip.contains(e.target)) {
                if (document.body.contains(wordTooltip)) {
                    document.body.removeChild(wordTooltip);
                }
                document.removeEventListener('click', closeTooltip);
            }
        });
    }, 100);
}
