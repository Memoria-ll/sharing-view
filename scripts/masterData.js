// masterData.js - マスターデータの解釈とモジュール列/セルの解決
//
// このファイルは DOM を参照しないこと。Node の単体テストが require で読み込むため、
// document/window に触れた時点でテストから到達できなくなる。

// プレーンオブジェクト判定（配列・null を除く）
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// operator マスター生JSON（{ version, operators: array }）と gamedata マスター生JSON
// （{ version, gameData: { module: string[], ... } }）を解釈する
function parseMasterData(rawOperator, rawGameData) {
    const gameDataTable = rawGameData && rawGameData.gameData;
    const moduleIds = Array.isArray(gameDataTable && gameDataTable.module)
        ? gameDataTable.module.filter(id => typeof id === 'string')
        : [];

    // 行順の正は配信配列の出現順。プレーンオブジェクト辞書だと整数様キーが先頭へ
    // 繰り上がり行順が静かに狂うため、挿入順が保証される Map に詰める
    const operators = new Map();
    if (Array.isArray(rawOperator && rawOperator.operators)) {
        rawOperator.operators.forEach(operator => {
            if (operator && typeof operator.code === 'string' && !operators.has(operator.code)) {
                operators.set(operator.code, operator);
            }
        });
    }

    // #2（フィルタ）が読む gameData のテーブル。ここで捨てると #2 が parse の契約から作り直しになる
    const gameData = isPlainObject(gameDataTable) ? gameDataTable : {};

    return { moduleIds: moduleIds, operators: operators, gameData: gameData };
}

// モジュール列のヘッダラベルを moduleIds の順序で生成する
function moduleColumnLabels(moduleIds) {
    return moduleIds.map(id => 'Module ' + id);
}

// モジュール所持/値を保持する共有データキー。backend の保存キー規則（'module' + 接尾辞）のミラー
function moduleValueKey(moduleId) {
    return 'module' + moduleId;
}

// マスター上のオペレーター情報を取得する。マスターに無いコードは Unknown 表示用のフォールバックを返す
function getOperatorInfo(master, code) {
    if (master.operators.has(code)) {
        return master.operators.get(code);
    }
    return { name: { ja: 'Unknown', en: 'Unknown', ch: 'Unknown' } };
}

// モジュール1セルの表示値を決定する。所持判定の正はマスターの per-operator modules
function resolveModuleCell(charInfo, row, moduleId) {
    const key = moduleValueKey(moduleId);
    // charInfo.modules が無い = マスターがこのオペレーターの所持情報を持たない（マスター未知コード）。
    // この場合は所持判定をせず共有データの値をそのまま数値として出す。
    if (!isPlainObject(charInfo.modules)) {
        return String(row[key] ?? 0);
    }
    // 所持判定は値が配列であること。キー存在だけで判定すると、配信側が非所持を
    // null/false/[] で表し始めた瞬間に静かに所持扱いになる。配列判定なら非所持側に倒れる
    if (!Array.isArray(charInfo.modules[moduleId])) {
        return '-';
    }
    const value = row[key];
    return Number.isInteger(value) ? String(value) : '0';
}

// 共有データが無いオペレーターの初期値。潜在0・スキル1はbackendの許容範囲/既定値とは別の表示規約
const DEFAULT_OPERATOR_VALUES = {
    potential: 0,
    elite: 0,
    level: 1,
    skill: 1,
    skill1: 0,
    skill2: 0,
    skill3: 0
};

// マスターの全オペレーターを行にする。共有データがあればその値、なければ初期値。
// マスターに無いコードの共有データも末尾に追加する
function buildDisplayRows(sharedOperators, master) {
    const byCode = new Map(sharedOperators.map(op => [op.code, op]));
    const rows = [...master.operators.keys()].map(code =>
        Object.assign({ code: code }, DEFAULT_OPERATOR_VALUES, byCode.get(code))
    );

    sharedOperators.forEach(operator => {
        if (!master.operators.has(operator.code)) {
            rows.push(Object.assign({}, DEFAULT_OPERATOR_VALUES, operator));
        }
    });

    return rows;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMasterData, moduleColumnLabels, moduleValueKey, getOperatorInfo, resolveModuleCell, buildDisplayRows, DEFAULT_OPERATOR_VALUES };
}
