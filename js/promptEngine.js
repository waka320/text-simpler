/**
 * ReadEasy. Prompt Engine Module
 * AIに送るプロンプトの生成と管理（レベル/モードのポリシーと連携ルール込み）
 */

// レベル別量的・語彙的ポリシー
const gradePolicies = {
    none: {
        name: 'なし',
        maxSentenceLength: 0,             // 制約なし
        maxSentences: 0,                  // 制約なし
        maxPoints: 0,                     // 制約なし
        maxConnectivesPerSentence: 0,     // 制約なし
        allowAnnotationOnce: true,
        compressionRatio: [0.4, 0.85],    // 参考値
        vocabGuideline: '語彙制約なし（読みやすさを優先）',
        abilityDescription: 'レベル指定なし'
    },
    kindergarten: {
        name: '幼稚園児',
        maxSentenceLength: 18, // 論文Lower-elementary相当
        maxSentences: 3,
        maxPoints: 2,
        maxConnectivesPerSentence: 0,
        allowAnnotationOnce: true,
        compressionRatio: [0.3, 0.5],
        vocabGuideline: 'ひらがな・和語中心（和語75%以上、漢語10%以下）。基本動詞・形容詞のみ。抽象語禁止。カタカナ語は身近な例で説明',
        abilityDescription: '最も基本的な日本語表現を理解。単純な文のみ。複文や修飾語は困難'
    },
    elementary: {
        name: '小学生',
        maxSentenceLength: 22, // 論文Upper-elementary相当
        maxSentences: 4,
        maxPoints: 3,
        maxConnectivesPerSentence: 1,
        allowAnnotationOnce: true,
        compressionRatio: [0.35, 0.55],
        vocabGuideline: '和語・基本漢語（和語65%以上、漢語20%以下）。基本的な文法パターン。te形程度の接続は可。カタカナ語は簡単な説明付き',
        abilityDescription: '基本語彙と文法パターンを理解。te形などの基本的複文は理解可能'
    },
    junior: {
        name: '中学生',
        maxSentenceLength: 28, // 論文Lower-intermediate相当
        maxSentences: 5,
        maxPoints: 4,
        maxConnectivesPerSentence: 1,
        allowAnnotationOnce: true,
        compressionRatio: [0.45, 0.65],
        vocabGuideline: '基本漢語・和語バランス型（和語55%以上、漢語30%以下）。複数文構成への対応。専門語は短い注釈必須。カタカナ技術用語は機能説明付き。抽象概念は具体例で説明',
        abilityDescription: '比較的単純な文章を読解。複数文からなるテキストを扱える。基本的な論理関係を理解'
    },
    senior: {
        name: '高校生',
        maxSentenceLength: 35, // 論文Upper-intermediate相当
        maxSentences: 7,
        maxPoints: 6,
        maxConnectivesPerSentence: 1,
        allowAnnotationOnce: true,
        compressionRatio: [0.5, 0.7],
        vocabGuideline: '漢語増加許容（和語50%以上、漢語40%以下）。技術文章の全体構造把握。日常場面のテキスト対応。カタカナ専門用語は初出時に用途・目的を説明',
        abilityDescription: '技術的文章の全体構造を把握。日常的状況のほとんどの日本語テキストを問題なく処理'
    },
    university: {
        name: '大学生',
        maxSentenceLength: 45, // 論文Lower-advanced相当
        maxSentences: 9,
        maxPoints: 8,
        maxConnectivesPerSentence: 2,
        allowAnnotationOnce: true,
        compressionRatio: [0.55, 0.75],
        vocabGuideline: '専門語彙許容（漢語50%まで）。技術文章をほぼ理解。文学的複雑構造も対応可能。カタカナ専門用語は初出時に用途・目的を説明',
        abilityDescription: '技術的文章をほぼ理解。文学作品の複雑な構造を扱える。高度な論理関係の把握'
    },
    // 論文Upper-advanced相当
    expert: {
        name: '専門家',
        maxSentenceLength: 60, // 国会議事録レベル
        maxSentences: 12,
        maxPoints: 10,
        maxConnectivesPerSentence: 3,
        allowAnnotationOnce: false,
        compressionRatio: [0.6, 0.85],
        vocabGuideline: '専門語彙・抽象語彙全面許容。あらゆる文体・分野に対応',
        abilityDescription: '高度に技術的な文章を完全理解。実質的にあらゆる種類の日本語テキストに対応可能'
    }
};

/**
 * 学年レベルの情報を取得（詳細ポリシー）
 */
function getGradeInfo(level) {
    return gradePolicies[level] || gradePolicies.junior;
}

// モード別ポリシー（Do/Don’t）
const modePolicies = {
    // 言葉をやさしく
    lexicon: {
        do: [
            '専門用語・漢語・外来語・記号に短い注釈を初出のみ付ける',
            'カタカナ語（技術用語・概念語）に機能説明を付ける',
            '抽象概念を具体例や身近な例で説明する',
            '指示語（これ・それ・あれ・どれ等）を具体的な名詞に置換',
            '技術用語は「何をするもの」「なぜ必要」を含めて説明する',
        ],
        dont: [
            '事実を追加しない',
            '同じ注釈を繰り返さない',
            '冗長な言い換えをしない',
            'カタカナ語を単純に日本語に置き換えるだけにしない',
            '抽象概念をより抽象的に説明しない'
        ]
    },
    // 文を要約
    load: {
        do: [
            '一文一義を徹底する',
            '本文はシンプルな箇条書きで列挙する',
            '要約（要点の総括）を最初に挿入する',
            '結論（示唆・提案など）を最後に挿入する'
        ],
        dont: [
            '新しい情報を足さない',
            '同内容の重複を残さない'
        ]
    },
    // 流れを見やすく
    cohesion: {
        do: [
            '接続詞を必要最小限追加して論理関係を明確にする',
            '主語を適宜再掲する',
            '理解に必要な前提を一文で補足する'
        ],
        dont: [
            '文数を不必要に増やさない',
            '接続詞を多用しない（1文あたり上限内）'
        ]
    }
};

// モード適用の優先順序（競合時は前勝ち）
const MODE_ORDER = ['load', 'cohesion', 'lexicon'];

function sortModesByPriority(modes) {
    const arr = Array.isArray(modes) ? modes.slice() : [modes];
    return arr.sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
}

function mergeModeInstructions(modes) {
    const doSet = new Set();
    const dontSet = new Set();
    modes.forEach(m => {
        const policy = modePolicies[m];
        if (!policy) return;
        policy.do.forEach(x => doSet.add(x));
        policy.dont.forEach(x => dontSet.add(x));
    });
    return { doList: Array.from(doSet), dontList: Array.from(dontSet) };
}

/**
 * システムプロンプトを生成（複数モード対応）
 */
function generateSystemPrompt(modes, level) {
    // 選択モード（未指定なら全適用）
    const selected = (Array.isArray(modes) ? modes : [modes]).filter(Boolean);
    const modeArray = selected.length ? selected : MODE_ORDER.slice();
    const ordered = sortModesByPriority(modeArray);

    // レベルポリシー
    const g = getGradeInfo(level);

    // 共通方針（不変の安全ガイド）
    const commonPolicy = 'やさしい日本語で変換。固有名詞・数値・単位・否定・範囲を保持。二重否定回避。新規情報の追加禁止。';

    // モードDo/Don’tを統合
    const { doList, dontList } = mergeModeInstructions(ordered);

    // 手順（優先順に適用）
    const steps = [];
    ordered.forEach(m => {
        if (m === 'load') {
            steps.push('要約を最初に、本文は箇条書きでシングルセンテンス化し、結論を最後に置く');
        } else if (m === 'cohesion') {
            steps.push('接続詞の最小追加・主語再掲・前提補足で文のつながりを明確化');
        } else if (m === 'lexicon') {
            steps.push('専門語・外来語・漢語・記号へ初出のみ短い注釈、指示語の具体化。特にカタカナの専門用語（API、インスタンス等）は「何をするもの」「なぜ使うか」を含めて説明。抽象概念は具体例で補足');
        }
    });

    // 量的制約
    const quantitative = [];
    if (g.maxSentenceLength) quantitative.push(`平均文長≤${g.maxSentenceLength}字`);
    if (g.maxSentences) quantitative.push(`総文数≤${g.maxSentences}`);
    if (g.maxPoints) quantitative.push(`要点≤${g.maxPoints}`);
    if (g.maxConnectivesPerSentence || g.maxConnectivesPerSentence === 0) quantitative.push(`接続詞/文≤${g.maxConnectivesPerSentence}`);
    if (ordered.includes('lexicon') && g.allowAnnotationOnce) {
        quantitative.push('注釈は初出のみ');
        quantitative.push('カタカナ語・抽象概念は具体例併記');
        quantitative.push('専門用語は機能・用途を説明');
    }
    if (ordered.includes('load') && g.compressionRatio) quantitative.push(`目標圧縮率≈${Math.round(g.compressionRatio[0] * 100)}–${Math.round(g.compressionRatio[1] * 100)}%`);

    // 語種比率（和語/漢語の割合がguideline文に含まれる場合は抽出して明示）
    try {
        if (g.vocabGuideline && /和語\d+%/.test(g.vocabGuideline) && /漢語\d+%/.test(g.vocabGuideline)) {
            const wago = g.vocabGuideline.match(/和語\d+%/);
            const kango = g.vocabGuideline.match(/漢語\d+%/);
            if (wago && kango) {
                quantitative.push(`語種比率: ${wago[0]}、${kango[0]}`);
            }
        }
    } catch (_) { }

    // 語彙制約
    const vocab = g.vocabGuideline || '';

    // 競合時の優先ルール
    const conflictRule = '競合時は手順の早い方を優先（load＞cohesion＞lexicon）。量的制約（文長/総文数/要点/接続詞）を最優先。lexiconモードでは技術用語の機能説明を優先し、単純な言い換えは避ける。';

    // 禁止事項（統合）
    const dontCombined = Array.from(new Set([
        ...dontList,
        '長文化させない',
        '形式説明やメタコメントは出力しない（本文のみ）'
    ]));

    // まとめ（短い一段落+箇条書き最小限）
    const parts = [];
    parts.push(commonPolicy);
    parts.push(`手順（順に適用）: ${steps.join(' → ')}。`);
    if (quantitative.length) parts.push(`量的制約: ${quantitative.join('、')}。`);
    if (vocab) parts.push(`語彙制約: ${vocab}。`);
    if (g.abilityDescription) parts.push(`読者想定: ${g.name}（${g.abilityDescription}）。`);
    if (doList.length) parts.push(`すること: ${doList.join('、')}。`);
    if (dontCombined.length) parts.push(`しないこと: ${dontCombined.join('、')}。`);
    parts.push(conflictRule);

    return parts.join(' ');
}

/**
 * ユーザープロンプトを生成（複数モード対応 + メタデータ）
 */
function generateUserPrompt(text, modes, metadata = null) {
    const selected = (Array.isArray(modes) ? modes : [modes]).filter(Boolean);
    const modeArray = selected.length ? selected : MODE_ORDER.slice();
    const ordered = sortModesByPriority(modeArray);

    // 短い一文で目的を伝える
    const goal = [];
    if (ordered.includes('load')) goal.push('情報を圧縮して整理');
    if (ordered.includes('cohesion')) goal.push('つながりを明確化');
    if (ordered.includes('lexicon')) goal.push('語をやさしく');
    const goalText = goal.length ? goal.join('・') : '読みやすく';

    // メタデータがある場合は文脈情報として追加
    let contextInfo = '';
    if (metadata && metadata.title) {
        contextInfo = `\n\n【文脈情報】\nページタイトル: ${metadata.title}`;
        if (metadata.domain) {
            contextInfo += `\nサイト: ${metadata.domain}`;
        }
        if (metadata.description && metadata.description.length > 0) {
            contextInfo += `\n概要: ${metadata.description}`;
        }
        contextInfo += '\n';
    }

    return `次の文を、手順に従って${goalText}してください。制約を満たさない場合は短縮・統合を優先し、説明文は出力しないでください。${contextInfo}--- ${text} ---`;
}

/**
 * 完全なプロンプトを生成（複数モード対応 + メタデータ）
 */
function generateCompletePrompt(text, modes, level, metadata = null) {
    const systemPrompt = generateSystemPrompt(modes, level);
    const userPrompt = generateUserPrompt(text, modes, metadata);
    return `${systemPrompt}\n\n${userPrompt}`;
}

// ES6モジュールとしてエクスポート
export {
    getGradeInfo,
    generateSystemPrompt,
    generateUserPrompt,
    generateCompletePrompt
};
