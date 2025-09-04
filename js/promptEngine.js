/**
 * ReadEasy. Prompt Engine Module
 * AIに送るプロンプトの生成と管理
 */

/**
 * 学年レベルの情報を取得
 */
function getGradeInfo(level) {
    const gradeLevels = {
        none: {
            name: 'なし',
            maxLength: 0,
            description: 'レベル指定なし'
        },
        kindergarten: {
            name: '幼稚園児',
            maxLength: 20,
            description: 'ひらがな中心、短文、簡単な言葉のみ'
        },
        elementary: {
            name: '小学生',
            maxLength: 25,
            description: 'ひらがな多め、二重否定回避'
        },
        junior: {
            name: '中学生',
            maxLength: 35,
            description: '基本語彙＋頻出専門語に簡注'
        },
        senior: {
            name: '高校生',
            maxLength: 45,
            description: '論理接続を明確、専門語は最小限'
        },
        university: {
            name: '大学生',
            maxLength: 60,
            description: '専門用語可、論理的構成重視'
        }
    };

    return gradeLevels[level] || gradeLevels.junior;
}

/**
 * システムプロンプトを生成（複数モード対応）
 */
function generateSystemPrompt(modes, level) {
    // 共通方針（簡潔版）
    const commonPolicy = `やさしい日本語で変換。一文一義、固有名詞・数値・記号・否定・範囲を保持。二重否定回避、外来語に注意。事実は追加しない。`;

    let levelInfo = '';
    if (level && level !== 'none') {
        const gradeInfo = getGradeInfo(level);
        levelInfo = `${gradeInfo.name}レベル（文長≤${gradeInfo.maxLength}字）。`;
    }

    // モードが配列でない場合は配列に変換
    const modeArray = Array.isArray(modes) ? modes : [modes];

    // 複数モードの指示を組み合わせ
    const modeInstructions = [];

    if (modeArray.includes('lexicon')) {
        modeInstructions.push('難語に注釈、指示語を具体化、記号の意味を明記');
    }
    if (modeArray.includes('load')) {
        modeInstructions.push('一文一義、目的→結論→要旨→本文の順');
    }
    if (modeArray.includes('cohesion')) {
        modeInstructions.push('接続詞追加、主語再掲、前提補足');
    }

    // 何も選択されていない場合は全て適用
    if (modeInstructions.length === 0) {
        modeInstructions.push('難語に注釈、指示語を具体化、記号の意味を明記', '一文一義、目的→結論→要旨→本文の順', '接続詞追加、主語再掲、前提補足');
    }

    const combinedInstructions = modeInstructions.join('、');
    return `${commonPolicy}${levelInfo}${combinedInstructions}。`;
}

/**
 * ユーザープロンプトを生成（複数モード対応）
 */
function generateUserPrompt(text, modes) {
    // モードが配列でない場合は配列に変換
    const modeArray = Array.isArray(modes) ? modes : [modes];

    // 複数モードの指示を組み合わせ
    const instructions = [];

    if (modeArray.includes('lexicon')) {
        instructions.push('語と記号の意味が分かるように');
    }
    if (modeArray.includes('load')) {
        instructions.push('情報が多いので、目的→結論→要旨→本文の順に短く並べ替え、文を分割');
    }
    if (modeArray.includes('cohesion')) {
        instructions.push('つながりが分かるように、接続詞を足し、指示語を具体化し、必要なら前提を一文で補って');
    }

    // 何も選択されていない場合は全て適用
    if (instructions.length === 0) {
        instructions.push('語と記号の意味が分かるように', '情報が多いので、目的→結論→要旨→本文の順に短く並べ替え、文を分割', 'つながりが分かるように、接続詞を足し、指示語を具体化し、必要なら前提を一文で補って');
    }

    const combinedInstructions = instructions.join('、');
    return `次の文を${combinedInstructions}ください。--- ${text} ---`;
}

/**
 * 完全なプロンプトを生成（複数モード対応）
 */
function generateCompletePrompt(text, modes, level) {
    const systemPrompt = generateSystemPrompt(modes, level);
    const userPrompt = generateUserPrompt(text, modes);
    return `${systemPrompt}\n\n${userPrompt}`;
}

// ES6モジュールとしてエクスポート
export {
    getGradeInfo,
    generateSystemPrompt,
    generateUserPrompt,
    generateCompletePrompt
};
