// masterData.js - マスターデータの解釈とモジュール列/セルの解決
//
// このファイルは DOM を参照しないこと。Node の単体テストが require で読み込むため、
// document/window に触れた時点でテストから到達できなくなる。

// プレーンオブジェクト判定（配列・null を除く）
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// マスター生JSON（{ modules: string[], operators: object }）を解釈する
function parseMasterData(raw) {
    const moduleIds = Array.isArray(raw && raw.modules)
        ? raw.modules.filter(id => typeof id === 'string')
        : [];
    const operators = isPlainObject(raw && raw.operators) ? raw.operators : {};
    return { moduleIds: moduleIds, operators: operators };
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
    if (Object.prototype.hasOwnProperty.call(master.operators, code)) {
        return master.operators[code];
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
    // 所持判定は厳密に true のみ。false/undefined はすべて非所持として扱う
    if (charInfo.modules[moduleId] !== true) {
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
    const rows = Object.keys(master.operators).map(code =>
        Object.assign({ code: code }, DEFAULT_OPERATOR_VALUES, byCode.get(code))
    );

    sharedOperators.forEach(operator => {
        if (!Object.prototype.hasOwnProperty.call(master.operators, operator.code)) {
            rows.push(Object.assign({}, DEFAULT_OPERATOR_VALUES, operator));
        }
    });

    return rows;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMasterData, moduleColumnLabels, moduleValueKey, getOperatorInfo, resolveModuleCell, buildDisplayRows, DEFAULT_OPERATOR_VALUES };
}
