// masterData.js - マスターデータの解釈とモジュール列/セルの解決
//
// このファイルは DOM を参照しないこと。Node の単体テストが require で読み込むため、
// document/window に触れた時点でテストから到達できなくなる。

// プレーンオブジェクト判定（配列・null を除く）
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueSortedIntegers(value) {
    return [...new Set((Array.isArray(value) ? value : []).filter(Number.isInteger))].sort((a, b) => a - b);
}

function uniqueSortedStrings(value) {
    return [...new Set((Array.isArray(value) ? value : []).filter(item => typeof item === 'string' && item.length > 0))].sort();
}

function namesOrFallback(names, fallback) {
    return isPlainObject(names) ? names : { ja: String(fallback), en: String(fallback), ch: String(fallback) };
}

function resolveLocalizedName(names, language, fallback) {
    const resolved = namesOrFallback(names, fallback);
    return resolved[language] || resolved.ja || resolved.en || resolved.ch || String(fallback);
}

function parseCalendarDate(value, separator) {
    if (typeof value !== 'string') return null;
    const expression = separator === '/' ? /^(\d{4})\/(\d{2})\/(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = value.match(expression);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
}

function emptyCriteria() {
    return {
        profession: { classes: [], subClasses: [] },
        sex: [],
        place: [],
        rarity: [],
        race: [],
        faction: { ids: [], includeHidden: false, includeSubFactions: false },
        date: { region: null, since: null, to: null },
        ownership: null,
        potential: []
    };
}

function normalizedPairs(value) {
    const pairs = Array.isArray(value) ? value : [];
    const result = [];
    const seen = new Set();
    pairs.forEach(pair => {
        if (!isPlainObject(pair) || !Number.isInteger(pair.classId) || !Number.isInteger(pair.subClassId)) return;
        const identity = `${pair.classId}/${pair.subClassId}`;
        if (!seen.has(identity)) {
            seen.add(identity);
            result.push({ classId: pair.classId, subClassId: pair.subClassId });
        }
    });
    return result.sort((left, right) => left.classId - right.classId || left.subClassId - right.subClassId);
}

function normalizeProfession(value) {
    const source = isPlainObject(value) ? value : {};
    const subClasses = normalizedPairs(source.subClasses);
    const classesWithSubClass = new Set(subClasses.map(pair => pair.classId));
    return {
        classes: uniqueSortedIntegers(source.classes).filter(classId => !classesWithSubClass.has(classId)),
        subClasses: subClasses
    };
}

function normalizeFaction(value) {
    const source = isPlainObject(value) ? value : {};
    const ids = uniqueSortedIntegers(source.ids);
    return {
        ids: ids,
        includeHidden: ids.length > 0 && source.includeHidden === true,
        includeSubFactions: ids.length > 0 && source.includeSubFactions === true
    };
}

function normalizeDate(value) {
    const source = isPlainObject(value) ? value : {};
    const region = source.region === 'china' || source.region === 'global' ? source.region : null;
    if (!region) return { region: null, since: null, to: null };
    return {
        region: region,
        since: parseCalendarDate(source.since, '-'),
        to: parseCalendarDate(source.to, '-')
    };
}

const FILTER_FACETS = [
    {
        key: 'profession',
        normalize: normalizeProfession,
        isActive: value => value.classes.length > 0 || value.subClasses.length > 0,
        matches: (operator, row, value) => value.classes.includes(operator.class) || value.subClasses.some(pair => pair.classId === operator.class && pair.subClassId === operator.subClass)
    },
    { key: 'sex', normalize: uniqueSortedIntegers, isActive: value => value.length > 0, matches: (operator, row, value) => value.includes(operator.sex) },
    { key: 'place', normalize: uniqueSortedIntegers, isActive: value => value.length > 0, matches: (operator, row, value) => value.includes(operator.place) },
    { key: 'rarity', normalize: uniqueSortedStrings, isActive: value => value.length > 0, matches: (operator, row, value) => value.includes(operator.rarity) },
    { key: 'race', normalize: uniqueSortedIntegers, isActive: value => value.length > 0, matches: (operator, row, value) => value.includes(operator.race) },
    {
        key: 'faction', normalize: normalizeFaction, isActive: value => value.ids.length > 0,
        matches: (operator, row, value, master) => {
            const selected = new Set(value.ids);
            if (value.includeSubFactions) {
                const factions = Array.isArray(master.gameData.faction) ? master.gameData.faction : [];
                value.ids.forEach(id => {
                    const faction = factions.find(item => item && item.id === id);
                    if (Array.isArray(faction && faction.subFactions)) faction.subFactions.filter(Number.isInteger).forEach(id => selected.add(id));
                });
            }
            const rawTargets = Array.isArray(operator.faction) ? operator.faction : [];
            const targets = value.includeHidden ? rawTargets : rawTargets.slice(0, 1);
            return targets.some(id => selected.has(id));
        }
    },
    {
        key: 'date', normalize: normalizeDate, isActive: value => value.region !== null,
        matches: (operator, row, value) => {
            const date = parseCalendarDate(operator.addDate && operator.addDate[value.region], '/');
            return date !== null && (!value.since || date >= value.since) && (!value.to || date <= value.to);
        }
    },
    {
        key: 'ownership', normalize: value => value === true || value === false ? value : null, isActive: value => value !== null,
        matches: (operator, row, value) => value === (Number.isInteger(row.potential) && row.potential >= 1)
    },
    {
        key: 'potential', normalize: value => uniqueSortedIntegers(value).filter(item => item >= 0 && item <= 6), isActive: value => value.length > 0,
        matches: (operator, row, value) => Number.isInteger(row.potential) && value.includes(row.potential)
    }
];

const FILTER_FACET_KEYS = FILTER_FACETS.map(facet => facet.key);

function createEmptyFilterCriteria() {
    return emptyCriteria();
}

function normalizeFilterCriteria(rawCriteria) {
    const source = isPlainObject(rawCriteria) ? rawCriteria : {};
    const normalized = emptyCriteria();
    FILTER_FACETS.forEach(facet => { normalized[facet.key] = facet.normalize(source[facet.key]); });
    return normalized;
}

function isFilterCriteriaEmpty(rawCriteria) {
    const criteria = normalizeFilterCriteria(rawCriteria);
    return FILTER_FACETS.every(facet => !facet.isActive(criteria[facet.key]));
}

function matchesOperatorFilter(operator, row, master, rawCriteria) {
    const criteria = normalizeFilterCriteria(rawCriteria);
    return FILTER_FACETS.every(facet => {
        const value = criteria[facet.key];
        if (!facet.isActive(value)) return true;
        // マスター外共有行は metadata facet では一致不能だが、行値だけの facet は評価する。
        if (!operator && !['ownership', 'potential'].includes(facet.key)) return false;
        return facet.matches(operator || {}, row, value, master);
    });
}

function clearFilterFacet(rawCriteria, key) {
    const criteria = normalizeFilterCriteria(rawCriteria);
    const facet = FILTER_FACETS.find(item => item.key === key);
    if (facet) criteria[key] = facet.normalize(undefined);
    return criteria;
}

function valuesFromOperators(master, property, includeAllFactionValues) {
    const values = [];
    master.operators.forEach(operator => {
        const value = operator[property];
        if (includeAllFactionValues && Array.isArray(value)) values.push(...value);
        else values.push(value);
    });
    return uniqueSortedIntegers(values);
}

function namedOptions(table, runtimeValues) {
    const options = [];
    const seen = new Set();
    (Array.isArray(table) ? table : []).forEach(item => {
        if (!item || !Number.isInteger(item.id) || seen.has(item.id)) return;
        seen.add(item.id);
        options.push({ value: item.id, names: namesOrFallback(item.name, item.id) });
    });
    runtimeValues.filter(id => !seen.has(id)).forEach(id => options.push({ value: id, names: namesOrFallback(null, id) }));
    return options;
}

function buildFilterOptionCatalog(master) {
    const gameData = master && isPlainObject(master.gameData) ? master.gameData : {};
    const classes = namedOptions(gameData.class, valuesFromOperators(master, 'class'));
    const subClasses = [];
    const knownPairs = new Set();
    classes.forEach(classOption => {
        const english = resolveLocalizedName(classOption.names, 'en', classOption.value).toLowerCase();
        (Array.isArray(gameData.subClass && gameData.subClass[english]) ? gameData.subClass[english] : []).forEach(item => {
            if (!item || !Number.isInteger(item.id)) return;
            const identity = `${classOption.value}/${item.id}`;
            if (!knownPairs.has(identity)) {
                knownPairs.add(identity);
                subClasses.push({ value: { classId: classOption.value, subClassId: item.id }, names: namesOrFallback(item.name, item.id) });
            }
        });
    });
    master.operators.forEach(operator => {
        if (!Number.isInteger(operator.class) || !Number.isInteger(operator.subClass)) return;
        const identity = `${operator.class}/${operator.subClass}`;
        if (!knownPairs.has(identity)) {
            knownPairs.add(identity);
            subClasses.push({ value: { classId: operator.class, subClassId: operator.subClass }, names: namesOrFallback(null, operator.subClass) });
        }
    });
    const rarities = [...new Set([...master.operators.values()].map(operator => operator.rarity).filter(value => typeof value === 'string' && value.length > 0))]
        .sort((left, right) => {
            const leftStars = Number((left.match(/\d+/) || [])[0]);
            const rightStars = Number((right.match(/\d+/) || [])[0]);
            if (Number.isFinite(leftStars) && Number.isFinite(rightStars) && leftStars !== rightStars) return rightStars - leftStars;
            if (Number.isFinite(leftStars) !== Number.isFinite(rightStars)) return Number.isFinite(rightStars) - Number.isFinite(leftStars);
            return left.localeCompare(right);
        })
        .map(value => ({ value: value, names: namesOrFallback(null, value) }));
    return {
        profession: { classes: classes, subClasses: subClasses },
        sex: namedOptions(gameData.sex, valuesFromOperators(master, 'sex')),
        place: namedOptions(gameData.place, valuesFromOperators(master, 'place')),
        rarity: rarities,
        race: namedOptions(gameData.race, valuesFromOperators(master, 'race')),
        faction: namedOptions(gameData.faction, valuesFromOperators(master, 'faction', true)),
        date: [{ value: 'china', names: { ja: '大陸版', en: 'China', ch: '中国' } }, { value: 'global', names: { ja: 'グローバル版', en: 'Global', ch: '全球' } }],
        ownership: [{ value: null, names: { ja: 'すべて', en: 'All', ch: '全部' } }, { value: true, names: { ja: '所持', en: 'Owned', ch: '已拥有' } }, { value: false, names: { ja: '未所持', en: 'Unowned', ch: '未拥有' } }],
        potential: [0, 1, 2, 3, 4, 5, 6].map(value => ({ value: value, names: namesOrFallback(null, value) }))
    };
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
    const shared = Array.isArray(sharedOperators) ? sharedOperators : [];
    const byCode = new Map(shared.map(op => [op.code, op]));
    const rows = [...master.operators.keys()].map(code =>
        Object.assign({ code: code }, DEFAULT_OPERATOR_VALUES, byCode.get(code))
    );

    shared.forEach(operator => {
        if (!master.operators.has(operator.code)) {
            rows.push(Object.assign({}, DEFAULT_OPERATOR_VALUES, operator));
        }
    });

    return rows;
}

// 表示行の供給と filter 判定をここで直列化し、preview と product table を同じ入口にする。
function buildOperatorView(sharedOperators, master, rawCriteria) {
    const criteria = normalizeFilterCriteria(rawCriteria);
    const rows = buildDisplayRows(sharedOperators, master);
    return {
        criteria: criteria,
        totalCount: rows.length,
        rows: rows.filter(row => matchesOperatorFilter(master.operators.get(row.code), row, master, criteria))
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseMasterData, moduleColumnLabels, moduleValueKey, getOperatorInfo, resolveModuleCell, buildDisplayRows,
        DEFAULT_OPERATOR_VALUES, FILTER_FACETS, FILTER_FACET_KEYS, createEmptyFilterCriteria,
        normalizeFilterCriteria, isFilterCriteriaEmpty, matchesOperatorFilter, clearFilterFacet,
        buildFilterOptionCatalog, buildOperatorView, resolveLocalizedName
    };
}
