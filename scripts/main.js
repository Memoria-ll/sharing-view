// main.js - メイン機能
// 言語設定

// インポートされたオペレーターデータ
let importedOperators = [];

// キャラクター静的データ
let characterData = {};

// 現在のデータID
let currentDataId = null;

// 選択中の言語
let currentLanguage = 'ja'; // デフォルトは日本語

document.addEventListener('DOMContentLoaded', () => {
    // 各種DOM要素の取得
    const copyUrlButton = document.getElementById('copy-url-button');
    const tweetButton = document.getElementById('tweet-button');
    const operatorsBody = document.getElementById('operators-body');


    // URLからデータIDを取得
    const urlParams = new URLSearchParams(window.location.search);
    const dataId = urlParams.get('d');

    // 言語選択ラジオボタンのイベントリスナー
    document.querySelectorAll('input[name="language"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentLanguage = e.target.value;
            
            // 言語変更時にテーブルを再描画
            if (importedOperators.length > 0) {
                displayOperators(importedOperators);
            }
        });
    });

    // 静的データの読み込み
    loadCharacterData()
        .then(data => {
            characterData = data;
            
            // URLにデータIDがある場合、APIからデータを取得して表示
            if (dataId) {
                currentDataId = dataId;
                return fetchOperatorData(dataId);
            }
        })
        .then(operatorData => {
            if (operatorData) {
                importedOperators = operatorData;
                displayOperators(operatorData);
            }
        })
        .catch(error => {
            console.error('初期化エラー:', error);
            // エラーの表示
            const operatorsBody = document.getElementById('operators-body');
            const errorRow = document.createElement('tr');
            const errorCell = document.createElement('td');
            errorCell.colSpan = 13; // テーブルの列数に合わせる
            errorCell.textContent = 'データの読み込みに失敗しました。';
            errorCell.style.textAlign = 'center';
            errorCell.style.padding = '20px';
            errorCell.style.color = 'red';
            errorRow.appendChild(errorCell);
            operatorsBody.appendChild(errorRow);
        });

    // URLコピーボタンのイベントリスナー
    copyUrlButton.addEventListener('click', () => {
        if (!currentDataId) {
            alert('表示するデータがありません。');
            return;
        }
        
        const url = `${window.location.origin}${window.location.pathname}?d=${currentDataId}`;
        copyToClipboard(url);
        
        // ボタンのテキストを一時的に変更
        const originalText = copyUrlButton.textContent;
        copyUrlButton.textContent = 'コピーしました！';
        setTimeout(() => {
            copyUrlButton.textContent = originalText;
        }, 2000);
    });

    // Xツイートボタンのイベントリスナー
    tweetButton.addEventListener('click', () => {
        if (!currentDataId) {
            alert('表示するデータがありません。');
            return;
        }
        
        // オペレーター数を取得
        const operatorCount = document.querySelectorAll('#operators-body tr').length;
        
        // ツイート用テキストとURLを生成
        const shareUrl = `${window.location.origin}${window.location.pathname}?d=${currentDataId}`;
        const tweetText = `私のオペレーターの育成状況を共有します！ ${shareUrl} #Arknights #アークナイツ #ANManager`;
        
        // Xの投稿画面を開く（ポップアップ）
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420');
    });
});

// クリップボードにコピーする関数
function copyToClipboard(text) {
    // navigator.clipboard APIが利用可能な場合はそちらを使用
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('クリップボードへのコピーに失敗しました:', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

// フォールバックコピー方法
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // オフスクリーンに配置
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (!successful) {
            console.error('クリップボードへのコピーに失敗しました');
        }
    } catch (err) {
        console.error('クリップボードへのコピーに失敗しました:', err);
    }
    
    document.body.removeChild(textArea);
}

// キャラクター静的データを読み込む関数
async function loadCharacterData() {
    try {
        const response = await fetch('https://data.memoria-ll.link/arknights-data/operator_master_data_shareview.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('オペレータデータの読み込みに失敗しました:', error);
        return {};
    }
}

// 入力データを処理する関数
function processInputData(data) {
    // 配列でない場合は配列に変換
    if (!Array.isArray(data)) {
        data = [data];
    }
    
    // 必要なデータを抽出
    return data.map(item => {
        // コードの取得（大文字小文字を区別しない）
        const code = item.Code || item.code;
        if (!code) return null; // コードがない場合はスキップ
        
        // 潜在の取得と数値変換
        let potential = item.Potential || item.potential;
        potential = parseInt(potential) || 1;
        
        // 現在のレベル情報を取得
        const currentLevel = item.CurrentLevel || {};
        
        // 必要なデータを抽出して返す
        return {
            code: code,
            potential: potential,
            elite: parseInt(currentLevel.Elite) || 0,
            level: parseInt(currentLevel.Level) || 1,
            skill: parseInt(currentLevel.Skill) || 7,
            skill1: parseInt(currentLevel.Skill1) || 0,
            skill2: parseInt(currentLevel.Skill2) || 0,
            skill3: parseInt(currentLevel.Skill3) || 0,
            moduleX: parseInt(currentLevel.ModuleX) || 0,
            moduleY: parseInt(currentLevel.ModuleY) || 0,
            moduleD: parseInt(currentLevel.ModuleD) || 0,
            moduleA: parseInt(currentLevel.ModuleA) || 0
        };
    }).filter(item => item !== null); // nullの項目を除外
}

// 共有データに含まれないオペレーターの初期値
const DEFAULT_OPERATOR_VALUES = {
    potential: 0,
    elite: 0,
    level: 1,
    skill: 1,
    skill1: 0,
    skill2: 0,
    skill3: 0,
    moduleX: 0,
    moduleY: 0,
    moduleD: 0,
    moduleA: 0
};

// マスターデータの全オペレーターを行にする。共有データがあればその値、なければ初期値
function buildDisplayRows(operators) {
    const operatorsByCode = new Map(operators.map(op => [op.code, op]));
    const rows = Object.keys(characterData).map(code =>
        Object.assign({ code: code }, DEFAULT_OPERATOR_VALUES, operatorsByCode.get(code))
    );

    // マスターデータに無いコードの共有データも末尾に表示する
    operators.forEach(operator => {
        if (!characterData[operator.code]) {
            rows.push(Object.assign({}, DEFAULT_OPERATOR_VALUES, operator));
        }
    });

    return rows;
}

// オペレーターデータをテーブルに表示する関数
function displayOperators(operators) {
    // テーブルの内容をクリア
    const operatorsBody = document.getElementById('operators-body');
    operatorsBody.innerHTML = '';

    // 各オペレーターの行を生成
    buildDisplayRows(operators).forEach(operator => {
        const tr = document.createElement('tr');
        
        // キャラクター基本情報を取得
        const charInfo = characterData[operator.code] || { name: { ja: 'Unknown', en: 'Unknown', ch: 'Unknown' } };
        
        // コード
        const tdCode = document.createElement('td');
        tdCode.textContent = operator.code;
        tr.appendChild(tdCode);
        
        // オペレータ名 - 現在選択されている言語で表示
        const tdName = document.createElement('td');
        tdName.textContent = getOperatorName(charInfo);
        
        // レアリティに基づいてクラスを追加（例：☆6 → rarity-6）
        if (charInfo.rarity) {
            const rarityNum = charInfo.rarity.replace(/\D/g, '');
            if (rarityNum) {
                tdName.classList.add(`rarity-${rarityNum}`);
            }
        }
        
        tr.appendChild(tdName);
        
        // 潜在
        const tdPotential = document.createElement('td');
        tdPotential.textContent = operator.potential;
        tr.appendChild(tdPotential);

        // 昇進
        const tdElite = document.createElement('td');
        tdElite.textContent = operator.elite;
        tr.appendChild(tdElite);

        // レベル
        const tdLevel = document.createElement('td');
        tdLevel.textContent = operator.level;
        tr.appendChild(tdLevel);

        // スキル
        const tdSkill = document.createElement('td');
        tdSkill.textContent = operator.skill;
        tr.appendChild(tdSkill);

        // スキル1特化
        const tdSkill1 = document.createElement('td');
        tdSkill1.textContent = operator.skill1;
        tr.appendChild(tdSkill1);

        // スキル2特化
        const tdSkill2 = document.createElement('td');
        tdSkill2.textContent = operator.skill2;
        tr.appendChild(tdSkill2);

        // スキル3特化
        const tdSkill3 = document.createElement('td');
        tdSkill3.textContent = operator.skill3;
        tr.appendChild(tdSkill3);

        // モジュールX
        const tdModuleX = document.createElement('td');
        tdModuleX.textContent = operator.moduleX;
        tr.appendChild(tdModuleX);

        // モジュールY
        const tdModuleY = document.createElement('td');
        tdModuleY.textContent = operator.moduleY;
        tr.appendChild(tdModuleY);

        // モジュールD
        const tdModuleD = document.createElement('td');
        tdModuleD.textContent = operator.moduleD;
        tr.appendChild(tdModuleD);

        // モジュールA
        const tdModuleA = document.createElement('td');
        tdModuleA.textContent = operator.moduleA;
        tr.appendChild(tdModuleA);
        
        // 行をテーブルに追加
        operatorsBody.appendChild(tr);
    });
}

// オペレーター名を現在の言語に基づいて取得する関数
function getOperatorName(operatorData) {
    if (!operatorData || !operatorData.name) return 'Unknown';
    
    // 選択された言語で名前を返す
    return operatorData.name[currentLanguage] || 
           operatorData.name.ja ||
           operatorData.name.en || 
           operatorData.name.ch || 
           'Unknown';
}