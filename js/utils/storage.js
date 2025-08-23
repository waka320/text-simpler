/**
 * ストレージ操作のユーティリティ関数
 */
export const StorageUtils = {
  /**
   * 設定値を取得する
   * @param {string|Array<string>} keys - 取得する設定のキー
   * @returns {Promise<Object>} - 設定値
   */
  async getSettings(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => {
        resolve(result);
      });
    });
  },
  
  /**
   * 設定値を保存する
   * @param {Object} settings - 保存する設定
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, () => {
        resolve();
      });
    });
  }
};

// filepath: /Users/WakaY/Documents/txt-simple/js/utils/ui.js
/**
 * UI操作のユーティリティ関数
 */
export const UIUtils = {
  /**
   * マークタグを含むテキストをクリック可能な単語に変換
   * @param {string} text - 変換元のテキスト
   * @returns {string} - 変換後のテキスト
   */
  addClickableWords(text) {
    return text.replace(/<mark>(.*?)<\/mark>/g, '<span class="simplified-word">$1</span>');
  },
  
  /**
   * ローディング表示を開始する
   * @param {HTMLElement} container - ローディングを表示する要素
   */
  showLoading(container) {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = '<div class="spinner"></div><p>処理中...</p>';
    container.appendChild(loading);
    return loading;
  },
  
  /**
   * エラーメッセージを表示する
   * @param {HTMLElement} container - エラーを表示する要素
   * @param {string} message - エラーメッセージ
   */
  showError(container, message) {
    container.innerHTML = `<div class="error-message">${message}</div>`;
  }
};