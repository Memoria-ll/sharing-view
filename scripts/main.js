// main.js - メイン機能
// 言語設定

// インポートされたオペレーターデータ
let importedOperators = [];

// マスターデータ（モジュール列定義 + オペレーター情報）。空マスタの唯一の生成元を
// parseMasterData に寄せる（リテラルで初期値を書くと operators がプレーンオブジェクトの
// ままになり、Map を期待する getOperatorInfo / buildDisplayRows と型は通るが意味が違う状態になる）
let masterData = parseMasterData(null, null);

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
    fetchMasterData()
        .then(raw => {
            masterData = parseMasterData(raw.operator, raw.gameData);
            renderModuleHeaders(masterData.moduleIds);

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
            errorCell.colSpan = document.getElementById('operators-head-row').children.length; // theadの実列数に合わせる
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

// theadの動的モジュール列を再構築する。除去→追加は対称ペアで、再入しても列が増えないよう冪等にする
function renderModuleHeaders(moduleIds) {
    const headRow = document.getElementById('operators-head-row');
    headRow.querySelectorAll('th[data-module-id]').forEach(th => th.remove());
    moduleColumnLabels(moduleIds).forEach((label, index) => {
        const th = document.createElement('th');
        th.textContent = label;
        th.dataset.moduleId = moduleIds[index];
        headRow.appendChild(th);
    });
}

// オペレーターデータをテーブルに表示する関数
function displayOperators(operators) {
    // テーブルの内容をクリア
    const operatorsBody = document.getElementById('operators-body');
    operatorsBody.innerHTML = '';

    // 各オペレーターの行を生成
    buildDisplayRows(operators, masterData).forEach(operator => {
        const tr = document.createElement('tr');

        // キャラクター基本情報を取得
        const charInfo = getOperatorInfo(masterData, operator.code);
        
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

        // モジュール列（マスターのmoduleIds順に動的生成）
        masterData.moduleIds.forEach(moduleId => {
            const tdModule = document.createElement('td');
            tdModule.textContent = resolveModuleCell(charInfo, operator, moduleId);
            tr.appendChild(tdModule);
        });

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