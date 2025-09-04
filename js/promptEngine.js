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
 * システムプロンプトを生成
 */
function generateSystemPrompt(mode, level) {
    // 共通方針（簡潔版）
    const commonPolicy = `やさしい日本語で変換。一文一義、固有名詞・数値・記号・否定・範囲を保持。二重否定回避、外来語に注意。事実は追加しない。`;

    let levelInfo = '';
    if (level && level !== 'none') {
        const gradeInfo = getGradeInfo(level);
        levelInfo = `${gradeInfo.name}レベル（文長≤${gradeInfo.maxLength}字）。`;
    }

    switch (mode) {
        case 'lexicon':
            return `${commonPolicy}${levelInfo}難語に注釈、指示語を具体化、記号の意味を明記。`;
        case 'load':
            return `${commonPolicy}${levelInfo}一文一義、目的→結論→要旨→本文の順。`;
        case 'cohesion':
            return `${commonPolicy}${levelInfo}接続詞追加、主語再掲、前提補足。`;
        default:
            return `${commonPolicy}${levelInfo}語・記号の意味を明確化。`;
    }
}

/**
 * ユーザープロンプトを生成
 */
function generateUserPrompt(text, mode) {
    switch (mode) {
        case 'lexicon':
            return `次の文を語と記号の意味が分かるように直してください。--- ${text} ---`;
        case 'load':
            return `次の文は情報が多いので、目的→結論→要旨→本文の順に短く並べ替え、文を分割してください。--- ${text} ---`;
        case 'cohesion':
            return `次の文のつながりが分かるように、接続詞を足し、指示語を具体化し、必要なら前提を一文で補ってください。--- ${text} ---`;
        default:
            return `次の文を変換してください。--- ${text} ---`;
    }
}

/**
 * 完全なプロンプトを生成
 */
function generateCompletePrompt(text, mode, level) {
    const systemPrompt = generateSystemPrompt(mode, level);
    const userPrompt = generateUserPrompt(text, mode);
    return `${systemPrompt}\n\n${userPrompt}`;
}

// ES6モジュールとしてエクスポート
export {
    getGradeInfo,
    generateSystemPrompt,
    generateUserPrompt,
    generateCompletePrompt
};
