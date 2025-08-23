/**
 * Text-Simpler Background Script (Modular Version)
 * モジュール化されたService Worker
 */

// モジュールの動的読み込み
let modules = {};

async function loadModules() {
  try {
    // 各モジュールを順次読み込み
    await Promise.all([
      loadScript('js/modules/utils/event-emitter.js'),
      loadScript('js/modules/utils/text-processor.js'),
      loadScript('js/modules/prompts/prompt-templates.js'),
      loadScript('js/modules/prompts/prompt-engine.js'),
      loadScript('js/modules/api/api-error-handler.js'),
      loadScript('js/modules/api/gemini-client.js'),
      loadScript('js/modules/storage/settings-manager.js')
    ]);
    
    // モジュールインスタンスを初期化
    modules = {
      eventBus: typeof eventBus !== 'undefined' ? eventBus : null,
      textProcessor: typeof textProcessor !== 'undefined' ? textProcessor : null,
      promptEngine: initializePromptEngine(),
      geminiClient: initializeGeminiClient(),
      settingsManager: typeof settingsManager !== 'undefined' ? settingsManager : null
    };
    
    console.log('Text-Simpler: All modules loaded successfully');
    return true;
    
  } catch (error) {
    console.error('Text-Simpler: Module loading failed:', error);
    return false;
  }
}

// スクリプト読み込みヘルパー
function loadScript(src) {
  return new Promise((resolve, reject) => {
    importScripts(src);
    resolve();
  });
}

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  const modulesLoaded = await loadModules();
  
  if (modulesLoaded && modules.settingsManager) {
    // デフォルト設定の初期化
    const settings = await modules.settingsManager.getSettings();
    console.log('Text-Simpler: Initialized with settings:', settings);
    
    // イベントバスでの通知
    if (modules.eventBus) {
      modules.eventBus.emitTyped(modules.eventBus.EVENT_TYPES.SETTINGS_CHANGED, settings);
    }
  }
});

// Service Worker起動時の初期化
chrome.runtime.onStartup.addListener(async () => {
  await loadModules();
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // 非同期レスポンスを示す
});

/**
 * メッセージハンドリング
 */
async function handleMessage(request, sender, sendResponse) {
  try {
    // モジュールが未初期化の場合は初期化
    if (!modules.settingsManager) {
      const modulesLoaded = await loadModules();
      if (!modulesLoaded) {
        throw new Error('モジュールの初期化に失敗しました');
      }
    }

    switch (request.action) {
      case 'transform':
        await handleTransformRequest(request, sendResponse);
        break;
        
      case 'getSettings':
        await handleGetSettings(request, sendResponse);
        break;
        
      case 'saveSettings':
        await handleSaveSettings(request, sendResponse);
        break;
        
      case 'validateApiKey':
        await handleValidateApiKey(request, sendResponse);
        break;
        
      default:
        sendResponse({ 
          success: false, 
          error: `未対応のアクション: ${request.action}` 
        });
    }
  } catch (error) {
    console.error('Text-Simpler: Message handling error:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * テキスト変換リクエストの処理
 */
async function handleTransformRequest(request, sendResponse) {
  const { text, mode, level, chunks } = request;
  
  try {
    // イベント発火
    if (modules.eventBus) {
      modules.eventBus.emitTransformStart({ text, mode, level });
    }
    
    // 設定を取得
    const settings = await modules.settingsManager.getSettings([
      'geminiApiKey', 'temperature', 'defaultMode', 'gradeLevel'
    ]);
    
    if (!settings.geminiApiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }
    
    // 単一テキストの場合
    if (text && !chunks) {
      const result = await transformSingleText({
        text,
        mode: mode || settings.defaultMode,
        level: level || settings.gradeLevel,
        apiKey: settings.geminiApiKey,
        temperature: settings.temperature
      });
      
      // 成功イベント発火
      if (modules.eventBus) {
        modules.eventBus.emitTransformSuccess({ text, result, mode });
      }
      
      sendResponse({ 
        success: true, 
        result: result 
      });
      return;
    }
    
    // チャンク処理の場合
    if (chunks && Array.isArray(chunks)) {
      const results = await transformChunks({
        chunks,
        mode: mode || settings.defaultMode,
        level: level || settings.gradeLevel,
        apiKey: settings.geminiApiKey,
        temperature: settings.temperature
      });
      
      // 成功イベント発火
      if (modules.eventBus) {
        modules.eventBus.emitTransformSuccess({ chunks, results, mode });
      }
      
      sendResponse({ 
        success: true, 
        results: results 
      });
      return;
    }
    
    throw new Error('無効なリクエスト形式です');
    
  } catch (error) {
    // エラーイベント発火
    if (modules.eventBus) {
      modules.eventBus.emitTransformError({ error, request });
    }
    
    const classified = modules.geminiClient.errorHandler.classifyError(error);
    sendResponse({ 
      success: false, 
      error: classified.message,
      errorType: classified.type,
      canRetry: classified.canRetry
    });
  }
}

/**
 * 単一テキストの変換
 */
async function transformSingleText({ text, mode, level, apiKey, temperature }) {
  // プロンプト生成
  const prompt = modules.promptEngine.generatePrompt(text, mode, level);
  
  // API呼び出し
  return await modules.geminiClient.transformWithRetry({
    prompt,
    apiKey,
    config: { temperature }
  });
}

/**
 * チャンクの順次変換
 */
async function transformChunks({ chunks, mode, level, apiKey, temperature }) {
  const results = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    try {
      const result = await transformSingleText({
        text: chunk.text,
        mode,
        level,
        apiKey,
        temperature
      });
      
      results.push({
        index: chunk.index,
        originalText: chunk.text,
        transformedText: result,
        success: true
      });
      
    } catch (error) {
      const classified = modules.geminiClient.errorHandler.classifyError(error);
      results.push({
        index: chunk.index,
        originalText: chunk.text,
        error: classified.message,
        errorType: classified.type,
        success: false
      });
      
      // 認証エラーなど致命的なエラーの場合は処理を中断
      if (!classified.canRetry) {
        break;
      }
    }
  }
  
  return results;
}

/**
 * 設定取得の処理
 */
async function handleGetSettings(request, sendResponse) {
  try {
    const settings = await modules.settingsManager.getSettings(request.keys);
    sendResponse({ 
      success: true, 
      settings: settings 
    });
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * 設定保存の処理
 */
async function handleSaveSettings(request, sendResponse) {
  try {
    const success = await modules.settingsManager.saveSettings(request.settings);
    sendResponse({ 
      success: success 
    });
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * APIキー検証の処理
 */
async function handleValidateApiKey(request, sendResponse) {
  try {
    const { apiKey } = request;
    
    if (!apiKey) {
      throw new Error('APIキーが指定されていません');
    }
    
    const isValid = await modules.geminiClient.validateApiKey(apiKey);
    
    sendResponse({ 
      success: true, 
      valid: isValid 
    });
    
  } catch (error) {
    const classified = modules.geminiClient.errorHandler.classifyError(error);
    sendResponse({ 
      success: false, 
      valid: false,
      error: classified.message 
    });
  }
}

console.log('Text-Simpler: Modular background script loaded');
