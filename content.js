console.log('AI Text Simplifier: content script loaded');

// CSSスタイルを修正（既存のスタイル部分を置き換え）
const style = document.createElement('style');
style.textContent = `
.simplify-tooltip {
  position: fixed;  /* absoluteではなくfixedに変更 */
  background: white;
  border: 1px solid #4285f4;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  z-index: 2147483647;  /* 最大のz-index */
  max-width: 350px;
  font-size: 14px;
  line-height: 1.5;
}
.level-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}
.level-selector button {
  padding: 5px 12px;
  border: none;
  border-radius: 20px;
  background-color: #4285f4;
  color: white;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.level-selector button:hover {
  background-color: #3b78e7;
  transform: translateY(-1px);
}
.simplified-text {
  margin-top: 12px;
  padding: 12px;
  background-color: #f9f9f9;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
}
.simplified-word {
  background-color: #e8f0fe;
  padding: 0 3px;
  border-radius: 3px;
  cursor: help;
  border-bottom: 1px dotted #4285f4;
}
.word-tooltip {
  position: fixed;  /* absoluteではなくfixedに変更 */
  background: white;
  border: 1px solid #ddd;
  padding: 10px 12px;
  border-radius: 6px;
  box-shadow: 0 3px 10px rgba(0,0,0,0.2);
  z-index: 2147483646;
  max-width: 280px;
  font-size: 13px;
}
.tooltip-header {
  font-weight: bold;
  margin-bottom: 10px;
  color: #555;
}
`;
document.head.appendChild(style);

// トグル可能なツールチップ用変数
let activeTooltip = null;

// グローバル変数の定義（ファイル先頭近く）
let isSelectionInProgress = false;

// mousedownイベントのリスナーを追加
document.addEventListener('mousedown', () => {
    isSelectionInProgress = true;
});

// mouseupイベントのリスナーを修正
document.addEventListener('mouseup', async (event) => {
    if (!isSelectionInProgress) return;
    isSelectionInProgress = false;

    // 少し遅延させてテキスト選択が確定するのを待つ
    setTimeout(() => {
        const selectedText = window.getSelection().toString().trim();
        console.log('選択テキスト:', selectedText);

        if (selectedText && selectedText.length > 5) { // 文字数制限を一時的に緩和
            // 既存のツールチップがあれば閉じる
            if (activeTooltip) {
                document.body.removeChild(activeTooltip);
                activeTooltip = null;
            }
            showTooltip(event.pageX, event.pageY, selectedText);
        }
    }, 100);
});

// クリック時のツールチップ閉じる処理
document.addEventListener('click', (event) => {
    if (activeTooltip && !activeTooltip.contains(event.target)) {
        document.body.removeChild(activeTooltip);
        activeTooltip = null;
    }
});

// ツールチップ表示関数を修正
function showTooltip(x, y, text) {
    try {
        console.log('ツールチップ表示開始:', x, y, text.substring(0, 20) + '...');

        // コンテナ要素を作成（シャドウDOMのホスト）
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '0';
        container.style.top = '0';
        container.style.width = '0';
        container.style.height = '0';
        container.style.zIndex = '2147483647';
        document.body.appendChild(container);

        // シャドウDOMを作成
        const shadowRoot = container.attachShadow({ mode: 'open' });
        
        // シャドウDOM内にスタイルを追加
        const styleElement = document.createElement('style');
        styleElement.textContent = `
        .simplify-tooltip {
          position: fixed;
          background: white;
          border: 1px solid #4285f4;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          z-index: 2147483647;
          max-width: 350px;
          font-size: 14px;
          line-height: 1.5;
          left: ${x}px;
          top: ${y}px;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        /* その他のスタイルも同様に... */
        `;
        shadowRoot.appendChild(styleElement);

        // ツールチップ要素を作成
        const tooltip = document.createElement('div');
        tooltip.className = 'simplify-tooltip';
        // ツールチップHTML部分を修正
        tooltip.innerHTML = `
<div style="display: flex; justify-content: space-between; align-items: center;">
  <div class="tooltip-header">難易度を選択してください</div>
  <button class="close-button" style="background: none; border: none; cursor: pointer; font-size: 18px;">×</button>
</div>
<div class="level-selector">
  <button data-level="小学生">小学生</button>
  <button data-level="中学生">中学生</button>
  <button data-level="高校生">高校生</button>
  <button data-level="大学生">大学生</button>
</div>
<div class="simplified-text" id="simplified-result">簡略化されたテキストがここに表示されます</div>
`;
        shadowRoot.appendChild(tooltip);
        
        activeTooltip = container;
        
        // 閉じるボタンのイベントリスナー
        const closeButton = shadowRoot.querySelector('.close-button');
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            document.body.removeChild(container);
            activeTooltip = null;
        });

        // レベル選択ボタンにイベントリスナーを追加
        const buttons = shadowRoot.querySelectorAll('.level-selector button');
        buttons.forEach(button => {
            // レベル選択ボタンのイベントハンドラー部分を修正
            button.addEventListener('click', async (e) => {
                e.stopPropagation(); // イベント伝播を止める

                // すべてのボタンからアクティブ状態を解除
                buttons.forEach(btn => btn.style.backgroundColor = '#4285f4');

                // クリックされたボタンをアクティブ状態にする
                button.style.backgroundColor = '#34a853';

                const level = button.dataset.level;
                const resultDiv = tooltip.querySelector('#simplified-result');
                resultDiv.textContent = '処理中...';

                try {
                    console.log(`${level}レベルで簡略化を開始`);
                    
                    // コンテキストが有効かチェック
                    if (!chrome.runtime || !chrome.runtime.id) {
                        resultDiv.innerHTML = `
                            <div class="error-message">
                                拡張機能のコンテキストが無効です。<br>
                                <button id="reload-page" class="reload-button">ページをリロード</button> して再試行してください。
                            </div>
                        `;
                        
                        // リロードボタンのイベントリスナーを追加
                        setTimeout(() => {
                            const reloadButton = resultDiv.querySelector('#reload-page');
                            if (reloadButton) {
                                reloadButton.addEventListener('click', () => {
                                    window.location.reload();
                                });
                            }
                        }, 100);
                        
                        return;
                    }
                    
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
                    console.error('簡略化処理エラー:', error);
                    
                    // エラーメッセージをより親切に
                    if (error.message.includes('Extension context invalidated') || 
                        error.message.includes('拡張機能のコンテキスト')) {
                        resultDiv.innerHTML = `
                            <div class="error-message">
                                拡張機能が再読み込みされたか無効になりました。<br>
                                <button id="reload-page" class="reload-button">ページをリロード</button> して再試行してください。
                            </div>
                        `;
                        
                        // リロードボタンのイベントリスナーを追加
                        setTimeout(() => {
                            const reloadButton = resultDiv.querySelector('#reload-page');
                            if (reloadButton) {
                                reloadButton.addEventListener('click', () => {
                                    window.location.reload();
                                });
                            }
                        }, 100);
                    } else {
                        resultDiv.textContent = `エラーが発生しました: ${error.message}`;
                    }
                }
            });
        });

        console.log('ツールチップ表示完了');
    } catch (error) {
        console.error('ツールチップ作成エラー:', error);
    }
}

// iframeを使用した隔離環境でツールチップを表示
function showTooltipInIframe(x, y, text) {
    try {
        // コンテナ作成
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.zIndex = '2147483647';
        container.style.background = 'transparent';
        container.style.border = 'none';
        container.style.maxWidth = '350px';
        
        // iframe作成
        const iframe = document.createElement('iframe');
        iframe.style.border = 'none';
        iframe.style.width = '350px';
        iframe.style.height = '300px';
        iframe.style.background = 'transparent';
        container.appendChild(iframe);
        document.body.appendChild(container);
        
        // iframeにコンテンツを追加
        setTimeout(() => {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            
            // ヘッドとスタイルを設定
            const head = document.createElement('head');
            const style = document.createElement('style');
            style.textContent = `
                body { font-family: sans-serif; margin: 0; padding: 0; }
                .simplify-tooltip { 
                    background: white; 
                    border: 1px solid #4285f4;
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                }
                /* その他のスタイル... */
            `;
            head.appendChild(style);
            doc.head.innerHTML = head.innerHTML;
            
            // ボディとコンテンツを設定
            doc.body.innerHTML = `
                <div class="simplify-tooltip">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="tooltip-header">難易度を選択してください</div>
                        <button id="close-button" style="background: none; border: none; cursor: pointer; font-size: 18px;">×</button>
                    </div>
                    <div class="level-selector">
                        <button data-level="小学生">小学生</button>
                        <button data-level="中学生">中学生</button>
                        <button data-level="高校生">高校生</button>
                        <button data-level="大学生">大学生</button>
                    </div>
                    <div class="simplified-text" id="simplified-result">簡略化されたテキストがここに表示されます</div>
                </div>
            `;
            
            // イベントリスナーを設定
            // ...
        }, 100);
        
        activeTooltip = container;
        
    } catch (error) {
        console.error('iframe ツールチップ作成エラー:', error);
    }
}

// グローバルにshowTooltip関数を公開（デバッグ用）
window.showTooltip = showTooltip;

// APIを使用してテキストを簡略化する関数を修正
async function simplifyTextWithAPI(text, level) {
    try {
        console.log('API呼び出し開始');
        
        // コンテキストが有効かチェック
        if (!chrome.runtime || !chrome.runtime.id) {
            console.warn('拡張機能のコンテキストが無効です。ページをリロードしてください。');
            throw new Error('拡張機能のコンテキストが無効です。ページをリロードするか、拡張機能を有効にしてください。');
        }
        
        // API情報を取得
        const settings = await chrome.storage.sync.get(['gemini-api-key', 'openai-api-key', 'selected-model'])
            .catch(err => {
                if (err.message.includes('Extension context invalidated')) {
                    throw new Error('拡張機能のコンテキストが無効です。ページをリロードしてください。');
                }
                throw err;
            });
        
        const model = settings['selected-model'] || 'gemini';
        let apiKey;

        if (model === 'gemini') {
            apiKey = settings['gemini-api-key'];
            console.log('Geminiモデルを使用');
        } else {
            apiKey = settings['openai-api-key'];
            console.log('OpenAIモデルを使用');
        }

        if (!apiKey) {
            throw new Error('APIキーが設定されていません。拡張機能の設定を確認してください。');
        }

        console.log('APIリクエスト準備中...');

        if (model === 'gemini') {
            const endpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent';
            console.log('Gemini APIエンドポイント:', endpoint);

            const requestBody = {
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
            };

            console.log('リクエスト送信中...');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(requestBody)
            });

            console.log('レスポンス受信:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API応答エラー:', errorText);
                throw new Error(`API応答エラー (${response.status}): ${errorText}`);
            }

            // レスポンスの処理部分を修正
            const data = await response.json();
            if (data.error) {
                console.error('APIエラー:', data.error);
                throw new Error(data.error.message);
            }

            // 新しいバージョンに対応したデータ抽出
            let resultText = '';
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                resultText = data.candidates[0].content.parts[0].text;
            } else if (data.content && data.content.parts && data.content.parts[0]) {
                // 新しいバージョンの可能性があるレスポンス形式に対応
                resultText = data.content.parts[0].text;
            } else {
                console.error('不正なAPIレスポンス:', data);
                throw new Error('APIから有効なレスポンスが返されませんでした');
            }

            console.log('API処理成功');
            return resultText;
        } else {
            // OpenAI ChatGPT API
            const endpoint = 'https://api.openai.com/v1/chat/completions';
            console.log('OpenAI APIエンドポイント:', endpoint);

            const requestBody = {
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
            };

            console.log('リクエスト送信中...');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            console.log('レスポンス受信:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API応答エラー:', errorText);
                throw new Error(`API応答エラー (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            if (data.error) {
                console.error('APIエラー:', data.error);
                throw new Error(data.error.message);
            }

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('不正なAPIレスポンス:', data);
                throw new Error('APIから有効なレスポンスが返されませんでした');
            }

            console.log('API処理成功');
            return data.choices[0].message.content;
        }
    } catch (error) {
        console.error('API呼び出しエラー:', error);
        
        // コンテキスト無効エラーの特別処理
        if (error.message.includes('Extension context invalidated') || 
            error.message.includes('拡張機能のコンテキスト')) {
            return '拡張機能のコンテキストが無効になりました。ページをリロードして再試行してください。';
        }
        
        throw new Error(`API処理エラー: ${error.message}`);
    }
}

// モデル一覧を取得するためのコード
async function listAvailableModels(apiKey) {
    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1/models', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            }
        });
        
        const data = await response.json();
        console.log('利用可能なモデル一覧:', data);
        return data;
    } catch (error) {
        console.error('モデル一覧取得エラー:', error);
        throw error;
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

// バックグラウンドスクリプトからのメッセージを受信するリスナーを追加
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'simplifySelectedText') {
        const selection = window.getSelection();
        const text = request.text || selection.toString().trim();

        if (text && text.length > 10) {
            // 選択テキストの位置を取得
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // ツールチップを表示
            showTooltip(
                window.scrollX + rect.right,
                window.scrollY + rect.bottom,
                text
            );

            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'テキストが選択されていないか、短すぎます。' });
        }
    }
    return true; // 非同期レスポンスのために必要
});

// 拡張機能の準備完了をバックグラウンドスクリプトに通知
chrome.runtime.sendMessage({ action: 'contentScriptReady' });

// デバッグ用の可視化機能を追加
function addDebugIndicator() {
    const debugElement = document.createElement('div');
    debugElement.style.position = 'fixed';
    debugElement.style.right = '10px';
    debugElement.style.top = '10px';
    debugElement.style.width = '20px';
    debugElement.style.height = '20px';
    debugElement.style.background = 'red';
    debugElement.style.borderRadius = '50%';
    debugElement.style.zIndex = '2147483647';
    debugElement.style.cursor = 'pointer';
    debugElement.title = 'AI Text Simplifierのデバッグ表示';
    
    document.body.appendChild(debugElement);
    
    debugElement.addEventListener('click', () => {
        alert('AI Text Simplifier：拡張機能は正常に動作しています。');
        
        // テスト用のツールチップを表示
        const testText = "これはテスト用のテキストです。";
        showTooltip(100, 100, testText);
    });
}

// ページ読み込み時にデバッグインジケーターを追加
addDebugIndicator();

// 選択中のテキストを監視
document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText && selectedText.length > 5) {
    // 選択テキストをbackground.jsに通知
    chrome.runtime.sendMessage({
      action: 'textSelected',
      text: selectedText
    });
  }
});

// バックグラウンドスクリプトからのメッセージを受信するリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelectedText') {
    const selectedText = window.getSelection().toString().trim();
    sendResponse({ text: selectedText });
  }
  return true; // 非同期レスポンスを可能にする
});
