// masterData.test.js - 実マスターデータを入力に純粋ロジック(masterData.js)のビヘイビアを固定する
//
// マスターの内容（オペレーター件数・モジュール種別・所持情報）は随時更新されるため、
// 期待値はフィクスチャから導出する。モジュールが増えたときにこのファイルの編集が要る形にしないこと。
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
    parseMasterData,
    moduleColumnLabels,
    getOperatorInfo,
    resolveModuleCell,
    buildDisplayRows,
    DEFAULT_OPERATOR_VALUES,
    FILTER_FACETS,
    FILTER_FACET_KEYS,
    createEmptyFilterCriteria,
    normalizeFilterCriteria,
    isFilterCriteriaEmpty,
    buildFilterOptionCatalog,
    buildOperatorView,
    createEmptySortState,
    initialSortDirection,
    cycleSortState,
    sortTieBreakKeys
} = require('../scripts/masterData.js');

const rawOperator = require('./fixtures/operator_master_data.json');
const rawGameData = require('./fixtures/game_data_master.json');
const legacyMasterSubset = require('./fixtures/legacy-master-subset.json');

const master = parseMasterData(rawOperator, rawGameData);
const operatorCount = rawOperator.operators.length;
const STATIC_TH_COUNT = 9;

// マスター上でそのオペレーターが所持しているモジュールID（moduleIds の順）。
// production の所持述語（Array.isArray）は呼ばず、キー存在という独立した基準で導出する
function ownedIds(code) {
    const modules = master.operators.get(code).modules;
    return master.moduleIds.filter(id => Object.prototype.hasOwnProperty.call(modules, id));
}

// 条件を満たすオペレーターをフィクスチャから選ぶ。該当が無ければテストが空振りするので失敗させる
function findOperator(predicate, description) {
    const code = [...master.operators.keys()].find(predicate);
    assert.ok(code, `フィクスチャに「${description}」オペレーターが存在しない`);
    return code;
}

// g. parseMasterData と罠1〜3（3通りの綴り・単数形/複数形）
test('g1: moduleIds はgamedataマスターのgameData.module配列をそのままの順序で通す', () => {
    assert.ok(master.moduleIds.length > 0);
    assert.deepEqual(master.moduleIds, rawGameData.gameData.module);
});

test('g2: operators はマスター全件を保持する', () => {
    assert.ok(operatorCount > 0);
    assert.equal(master.operators.size, operatorCount);
});

test('g3: buildDisplayRows([], master) はマスター全件', () => {
    const rows = buildDisplayRows([], master);
    assert.equal(rows.length, operatorCount);
});

test('g4: parseMasterData は不正/旧形式入力でも例外を投げず空に縮退する', () => {
    [
        parseMasterData(null, null),
        parseMasterData({}, {}),
        // 旧 shareview 形（トップレベル modules 配列 + operators 辞書）の operators は
        // 配列ではないので、新形の解釈では拾われない
        parseMasterData(legacyMasterSubset, legacyMasterSubset)
    ].forEach(result => {
        assert.equal(result.moduleIds.length, 0);
        assert.equal(result.operators.size, 0);
    });
});

// h. 列
test('h1: moduleColumnLabels は "Module " + ID の形にする', () => {
    assert.deepEqual(moduleColumnLabels(['X', 'ZZ']), ['Module X', 'Module ZZ']);
    assert.equal(moduleColumnLabels(master.moduleIds).length, master.moduleIds.length);
});

test('h2: index.html の thead は非モジュール9本のみ。モジュール列は静的HTMLに残っていない', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const theadMatch = html.match(/<thead>[\s\S]*?<\/thead>/);
    assert.ok(theadMatch, 'index.html に <thead> が見つからない');
    const thCount = (theadMatch[0].match(/<th\b/g) || []).length;
    assert.equal(thCount, STATIC_TH_COUNT);
    assert.ok(!/Module\s/.test(theadMatch[0]), 'thead にモジュール列が静的に残っている');
});

// i. resolveModuleCell（罠4）
test('i1: 所持0件のオペレーターは全モジュール列が非所持', () => {
    const code = findOperator(c => ownedIds(c).length === 0, 'モジュールを1つも所持しない');
    const charInfo = getOperatorInfo(master, code);
    const cells = master.moduleIds.map(id => resolveModuleCell(charInfo, { code: code }, id));
    assert.deepEqual(cells, master.moduleIds.map(() => '-'));
});

test('i2: 一部だけ所持するオペレーターは所持列が数値、非所持列が非所持', () => {
    const code = findOperator(
        c => ownedIds(c).length > 0 && ownedIds(c).length < master.moduleIds.length,
        '一部のモジュールだけを所持する'
    );
    const owned = ownedIds(code);
    const charInfo = getOperatorInfo(master, code);
    const row = { code: code };
    owned.forEach((id, index) => { row['module' + id] = (index % 3) + 1; });

    master.moduleIds.forEach(id => {
        const cell = resolveModuleCell(charInfo, row, id);
        if (owned.includes(id)) {
            assert.equal(cell, String(row['module' + id]), `${code} の ${id} 列`);
        } else {
            assert.equal(cell, '-', `${code} の ${id} 列`);
        }
    });
});

test('i3: 所持モジュールのキーが共有データに無くても非所持ではなく0（罠4）', () => {
    const code = findOperator(c => ownedIds(c).length >= 2, '2つ以上のモジュールを所持する');
    const owned = ownedIds(code);
    const present = owned[0];
    const missing = owned[owned.length - 1];
    const charInfo = getOperatorInfo(master, code);
    // 旧共有データ = 新しいモジュールのキーがそもそも保存されていない状態
    const row = { code: code, ['module' + present]: 3 };

    assert.equal(resolveModuleCell(charInfo, row, present), '3');
    assert.equal(resolveModuleCell(charInfo, row, missing), '0');
});

test('i4: マスター上非所持のモジュールは共有データに値があってもマスター優先で非所持', () => {
    const code = findOperator(
        c => ownedIds(c).length > 0 && ownedIds(c).length < master.moduleIds.length,
        '非所持のモジュールがある'
    );
    const notOwned = master.moduleIds.find(id => !ownedIds(code).includes(id));
    const charInfo = getOperatorInfo(master, code);

    assert.equal(resolveModuleCell(charInfo, { code: code, ['module' + notOwned]: 3 }, notOwned), '-');
});

test('i5: マスターに無いコードはモジュール列に数値を出す(非所持扱いにしない)', () => {
    assert.ok(master.moduleIds.length >= 2);
    const valued = master.moduleIds[0];
    const empty = master.moduleIds[master.moduleIds.length - 1];
    const charInfo = getOperatorInfo(master, 'ZZ99');
    const row = { code: 'ZZ99', ['module' + valued]: 2 };

    assert.equal(resolveModuleCell(charInfo, row, valued), '2');
    assert.equal(resolveModuleCell(charInfo, row, empty), '0');
});

test('i6: 全行×全moduleIdsの 非所持/数値 セル数がフィクスチャから導出した値と一致する', () => {
    const rows = buildDisplayRows([], master);

    let ownedFromFixture = 0;
    for (const code of master.operators.keys()) {
        ownedFromFixture += ownedIds(code).length;
    }
    const expectedNum = ownedFromFixture;
    const expectedDash = rows.length * master.moduleIds.length - ownedFromFixture;

    // どちらかが0だと「全部 - 」「全部数値」の実装でも通ってしまう
    assert.ok(expectedNum > 0 && expectedDash > 0);

    let dashCount = 0;
    let numCount = 0;
    rows.forEach(row => {
        const charInfo = getOperatorInfo(master, row.code);
        master.moduleIds.forEach(id => {
            if (resolveModuleCell(charInfo, row, id) === '-') {
                dashCount += 1;
            } else {
                numCount += 1;
            }
        });
    });

    assert.equal(dashCount, expectedDash);
    assert.equal(numCount, expectedNum);
});

// j. buildDisplayRows
test('j1: 共有データ1件を渡すと該当行は共有値、他行は既定値になる', () => {
    const sharedCode = master.operators.keys().next().value;
    const shared = [{
        code: sharedCode, potential: 5, elite: 2, level: 80,
        skill: 7, skill1: 3, skill2: 3, skill3: 0
    }];
    const rows = buildDisplayRows(shared, master);
    assert.equal(rows.length, operatorCount);

    const sharedRow = rows.find(row => row.code === sharedCode);
    assert.equal(sharedRow.potential, 5);
    assert.equal(sharedRow.skill1, 3);

    const otherRow = rows.find(row => row.code !== sharedCode);
    assert.deepEqual(
        {
            potential: otherRow.potential,
            elite: otherRow.elite,
            level: otherRow.level,
            skill: otherRow.skill,
            skill1: otherRow.skill1,
            skill2: otherRow.skill2,
            skill3: otherRow.skill3
        },
        DEFAULT_OPERATOR_VALUES
    );
});

test('j2: マスターに無いコードの共有データは末尾に追加される', () => {
    const rows = buildDisplayRows([{ code: 'ZZ99', moduleX: 2 }], master);
    assert.equal(rows.length, operatorCount + 1);
    assert.equal(rows[rows.length - 1].code, 'ZZ99');
});

test('j3: コード toString の共有データも末尾に追加される(prototype誤判定なし)', () => {
    const rows = buildDisplayRows([{ code: 'toString', moduleX: 1 }], master);
    assert.equal(rows.length, operatorCount + 1);
    assert.equal(rows[rows.length - 1].code, 'toString');
});

// k. manifest経由の新形専用（罠5・所持判定・supply point・行順）
test('k1: modules の値が true/null では所持と判定しない(罠5への出戻り検知)', () => {
    const code = findOperator(c => ownedIds(c).length > 0, 'モジュールを1つ以上所持する');
    const charInfo = getOperatorInfo(master, code);
    const ownedId = ownedIds(code)[0];

    const asTrue = { ...charInfo, modules: { ...charInfo.modules, [ownedId]: true } };
    const asNull = { ...charInfo, modules: { ...charInfo.modules, [ownedId]: null } };

    assert.equal(resolveModuleCell(asTrue, { code: code }, ownedId), '-');
    assert.equal(resolveModuleCell(asNull, { code: code }, ownedId), '-');
});

test('k2: gameData は生gameDataのキー集合をそのまま保持する(#2 の supply point)', () => {
    const keys = Object.keys(master.gameData).sort();
    const rawKeys = Object.keys(rawGameData.gameData).sort();
    assert.ok(keys.length > 0);
    assert.deepEqual(keys, rawKeys);
});

test('k3: operators の要素は射影されず生の operator 要素をそのまま保持する', () => {
    rawOperator.operators.forEach(raw => {
        const keys = Object.keys(master.operators.get(raw.code)).sort();
        assert.deepEqual(keys, Object.keys(raw).sort());
    });
});

test('k4: buildDisplayRows の行順は operator マスターの配信配列順(行順の正)', () => {
    const rows = buildDisplayRows([], master);
    assert.deepEqual(rows.map(row => row.code), rawOperator.operators.map(op => op.code));
});

function codes(view) {
    return view.rows.map(row => row.code);
}

function expectedCodes(shared, predicate) {
    return buildDisplayRows(shared, master)
        .filter(row => predicate(master.operators.get(row.code), row))
        .map(row => row.code);
}

function distinctValues(property) {
    return [...new Set([...master.operators.values()].map(operator => operator[property]))];
}

function twoValues(property) {
    const values = distinctValues(property).filter(value => value !== undefined && value !== null);
    assert.ok(values.length >= 2, `${property} の異なる値が2件必要`);
    return values.slice(0, 2);
}

// Issue 2: criteria catalog と公開 filter pipeline
test('f1: facet closed set、empty criteria、option catalog のキーは正準9 facet で一致する', () => {
    const expected = ['profession', 'sex', 'place', 'rarity', 'race', 'faction', 'date', 'ownership', 'potential'];
    assert.deepEqual(FILTER_FACET_KEYS, expected);
    assert.deepEqual(FILTER_FACETS.map(facet => facet.key), expected);
    assert.deepEqual(Object.keys(createEmptyFilterCriteria()), expected);
    assert.deepEqual(Object.keys(buildFilterOptionCatalog(master)), expected);
});

test('f2: normalize は純粋かつ不正値を既定へ縮退し、profession pair identity と依存を守る', () => {
    const raw = {
        profession: { classes: [2, 2, 2.5, NaN], subClasses: [{ classId: 2, subClassId: 3 }, { classId: 2, subClassId: 3 }, { classId: 1, subClassId: 3 }] },
        sex: [1, 1, NaN, 2.5], rarity: ['', '☆6', '☆6'], potential: [-1, 0, 0, 6, 7, 2.5],
        faction: { ids: [4, 4, 1.2], includeHidden: true, includeSubFactions: true },
        date: { region: 'china', since: '2024-02-30', to: '2024-02-29' }, unknown: 'ignored'
    };
    const before = structuredClone(raw);
    const normalized = normalizeFilterCriteria(raw);
    assert.deepEqual(raw, before);
    assert.deepEqual(normalized.profession, { classes: [], subClasses: [{ classId: 1, subClassId: 3 }, { classId: 2, subClassId: 3 }] });
    assert.deepEqual(normalized.sex, [1]);
    assert.deepEqual(normalized.rarity, ['☆6']);
    assert.deepEqual(normalized.potential, [0, 6]);
    assert.deepEqual(normalized.date, { region: 'china', since: null, to: '2024-02-29' });
    assert.deepEqual(normalizeFilterCriteria({ faction: { includeHidden: true } }).faction, { ids: [], includeHidden: false, includeSubFactions: false });
});

test('f3: empty criteria は全行・順序を buildDisplayRows と完全一致させ、各 facet の1値は active', () => {
    const empty = createEmptyFilterCriteria();
    assert.ok(isFilterCriteriaEmpty(empty));
    assert.ok(isFilterCriteriaEmpty(null));
    assert.deepEqual(buildOperatorView([], master, empty).rows, buildDisplayRows([], master));
    const examples = [
        { profession: { classes: [master.operators.values().next().value.class] } }, { sex: [master.operators.values().next().value.sex] },
        { place: [master.operators.values().next().value.place] }, { rarity: [master.operators.values().next().value.rarity] },
        { race: [master.operators.values().next().value.race] }, { faction: { ids: [master.operators.values().next().value.faction[0]] } },
        { date: { region: 'china' } }, { ownership: true }, { potential: [0] }
    ];
    examples.forEach(criteria => assert.equal(isFilterCriteriaEmpty(criteria), false));
});

test('f4: option catalog は runtime coverage、pair identity、raw rarity と names を保持する', () => {
    const catalog = buildFilterOptionCatalog(master);
    ['class', 'sex', 'place', 'race', 'faction'].forEach(field => {
        const key = field === 'class' ? 'profession' : field;
        const options = key === 'profession' ? catalog.profession.classes : catalog[key];
        valuesFromMaster(field).forEach(value => assert.ok(options.some(option => option.value === value), `${field}:${value}`));
        assert.ok(options.every(option => option.names && typeof option.names === 'object'));
    });
    [...master.operators.values()].forEach(operator => {
        assert.ok(catalog.profession.subClasses.some(option => option.value.classId === operator.class && option.value.subClassId === operator.subClass));
        assert.ok(catalog.rarity.some(option => option.value === operator.rarity));
    });
    assert.deepEqual(catalog.potential.map(option => option.value), [0, 1, 2, 3, 4, 5, 6]);
    const fallbackOperator = { ...master.operators.values().next().value, code: 'FALLBACK', class: 999, subClass: 888, sex: 777, place: 666, race: 555, faction: [444], rarity: 'custom rarity' };
    const fallbackMaster = { ...master, operators: new Map([...master.operators, [fallbackOperator.code, fallbackOperator]]) };
    const fallbackCatalog = buildFilterOptionCatalog(fallbackMaster);
    assert.ok(fallbackCatalog.profession.classes.some(option => option.value === 999 && option.names.ja === '999'));
    assert.ok(fallbackCatalog.profession.subClasses.some(option => option.value.classId === 999 && option.value.subClassId === 888));
    assert.ok(fallbackCatalog.faction.some(option => option.value === 444));
});

function valuesFromMaster(field) {
    const values = [];
    master.operators.forEach(operator => {
        if (field === 'faction') values.push(...operator.faction);
        else values.push(operator[field]);
    });
    return [...new Set(values)];
}

test('f5: scalar multi-value facets は OR、facet 間は AND で公開 entry point を通る', () => {
    ['sex', 'place', 'rarity', 'race'].forEach(field => {
        const values = twoValues(field);
        const actual = codes(buildOperatorView([], master, { [field]: values }));
        assert.deepEqual(actual, expectedCodes([], operator => values.includes(operator[field])), field);
    });
    const seed = master.operators.values().next().value;
    const shared = [{ code: seed.code, potential: 1 }];
    const criteria = { profession: { classes: [seed.class] }, sex: [seed.sex], rarity: [seed.rarity], ownership: true };
    const actual = codes(buildOperatorView(shared, master, criteria));
    assert.deepEqual(actual, expectedCodes(shared, (operator, row) => operator.class === seed.class && operator.sex === seed.sex && operator.rarity === seed.rarity && row.potential >= 1));
    assert.deepEqual(codes(buildOperatorView(shared, master, { ...criteria, sex: [-999] })), []);
});

test('f6: profession は whole/subclass union で、同classの raw whole+sub は subclass 限定になる', () => {
    const operators = [...master.operators.values()];
    const first = operators[0];
    const otherClass = operators.find(operator => operator.class !== first.class);
    const otherPair = operators.find(operator => operator.class !== first.class && (operator.class !== otherClass.class || operator.subClass !== otherClass.subClass));
    assert.ok(otherClass && otherPair);
    const criteria = { profession: { classes: [first.class, otherClass.class], subClasses: [{ classId: otherPair.class, subClassId: otherPair.subClass }] } };
    const normalized = normalizeFilterCriteria(criteria);
    assert.ok(!normalized.profession.classes.includes(otherPair.class));
    const expected = expectedCodes([], operator =>
        normalized.profession.classes.includes(operator.class) ||
        normalized.profession.subClasses.some(pair => pair.classId === operator.class && pair.subClassId === operator.subClass)
    );
    assert.deepEqual(codes(buildOperatorView([], master, criteria)), expected);
});

test('f7: faction の main/hidden/subfaction semantics は flag ごとに公開 entry point で反転する', () => {
    const hidden = [...master.operators.values()].find(operator => operator.faction.length > 1);
    assert.ok(hidden, 'hidden faction を持つ operator が必要');
    const hiddenId = hidden.faction[1];
    assert.ok(!codes(buildOperatorView([], master, { faction: { ids: [hiddenId] } })).includes(hidden.code));
    assert.ok(codes(buildOperatorView([], master, { faction: { ids: [hiddenId], includeHidden: true } })).includes(hidden.code));
    const parent = master.gameData.faction.find(faction => Array.isArray(faction.subFactions) && faction.subFactions.length > 0 && [...master.operators.values()].some(operator => operator.faction[0] === faction.subFactions[0]));
    assert.ok(parent, 'subfaction parent/child が必要');
    const childCode = [...master.operators.values()].find(operator => operator.faction[0] === parent.subFactions[0]).code;
    assert.ok(!codes(buildOperatorView([], master, { faction: { ids: [parent.id] } })).includes(childCode));
    assert.ok(codes(buildOperatorView([], master, { faction: { ids: [parent.id], includeSubFactions: true } })).includes(childCode));
});

test('f8: date は暦日 inclusive、region switch、missing と malformed を正しく扱う', () => {
    const dated = [...master.operators.values()].find(operator => operator.addDate && operator.addDate.china && operator.addDate.global);
    const china = dated.addDate.china.replaceAll('/', '-');
    const chinaCodes = codes(buildOperatorView([], master, { date: { region: 'china', since: china, to: china } }));
    assert.ok(chinaCodes.includes(dated.code));
    assert.deepEqual(chinaCodes, expectedCodes([], operator => operator.addDate && operator.addDate.china === dated.addDate.china));
    assert.deepEqual(codes(buildOperatorView([], master, { date: { region: 'china', since: china } })), expectedCodes([], operator => operator.addDate && operator.addDate.china >= dated.addDate.china));
    const globalDate = dated.addDate.global.replaceAll('/', '-');
    assert.deepEqual(codes(buildOperatorView([], master, { date: { region: 'global', since: globalDate, to: globalDate } })), expectedCodes([], operator => operator.addDate && operator.addDate.global === dated.addDate.global));
    const missing = [...master.operators.values()].find(operator => !operator.addDate || !operator.addDate.global);
    assert.ok(missing, 'global date 欠損 operator が必要');
    assert.ok(!codes(buildOperatorView([], master, { date: { region: 'global' } })).includes(missing.code));
    const malformedMaster = { ...master, operators: new Map(master.operators) };
    malformedMaster.operators.set(dated.code, { ...dated, addDate: { ...dated.addDate, china: '2024/02/30' } });
    assert.ok(!codes(buildOperatorView([], malformedMaster, { date: { region: 'china' } })).includes(dated.code));
    assert.deepEqual(normalizeFilterCriteria({ date: { region: 'global', since: china, to: china } }).date, { region: 'global', since: china, to: china });
});

test('f9: ownership/potential は row potential を唯一の入力にし、0 と master補完を未所持として扱う', () => {
    const [first, second] = [...master.operators.keys()];
    const shared = [{ code: first, potential: 0 }, { code: second, potential: 1 }];
    const owned = codes(buildOperatorView(shared, master, { ownership: true }));
    const unowned = codes(buildOperatorView(shared, master, { ownership: false }));
    assert.ok(!owned.includes(first) && owned.includes(second));
    assert.ok(unowned.includes(first));
    assert.ok(unowned.some(code => !shared.some(row => row.code === code)), 'master補完 row は未所持');
    assert.ok(codes(buildOperatorView(shared, master, { potential: [0] })).includes(first));
    assert.deepEqual(codes(buildOperatorView(shared, master, { potential: [0, 1] })), expectedCodes(shared, (operator, row) => row.potential === 0 || row.potential === 1));
    assert.deepEqual(normalizeFilterCriteria({ potential: [0, 7] }).potential, [0]);
});

test('f10: master外 shared code は empty/row facets では残り、metadata facet では除外される', () => {
    const shared = [{ code: 'ZZ99', potential: 0 }, { code: 'ZZ98', potential: 3 }];
    assert.ok(codes(buildOperatorView(shared, master, createEmptyFilterCriteria())).includes('ZZ99'));
    assert.ok(codes(buildOperatorView(shared, master, { ownership: false })).includes('ZZ99'));
    assert.ok(codes(buildOperatorView(shared, master, { potential: [3] })).includes('ZZ98'));
    const knownSex = master.operators.values().next().value.sex;
    assert.ok(!codes(buildOperatorView(shared, master, { sex: [knownSex] })).includes('ZZ99'));
});

function makeSortMaster(operators, moduleIds = ['M']) {
    return parseMasterData({ operators: operators }, { gameData: { module: moduleIds } });
}

function sortCodes(sortMaster, shared, state, language = 'ja', criteria = createEmptyFilterCriteria()) {
    return codes(buildOperatorView(shared, sortMaster, criteria, state, language));
}

function sortOperator(code, name, rarity, classId, modules = { M: [] }) {
    return { code: code, name: name, rarity: rarity, class: classId, modules: modules };
}

// Issue 4: 列ソートは filter 後の公開 view pipeline で確定する
test('s1: 列ごとの初回方向と3状態 cycle は純粋で、同列解除・別列移動を守る', () => {
    ['code', 'name'].forEach(key => assert.equal(initialSortDirection(key), 'ascending'));
    ['potential', 'elite', 'level', 'skill', 'skill1', 'skill2', 'skill3', 'module:M'].forEach(key => assert.equal(initialSortDirection(key), 'descending'));

    const none = createEmptySortState();
    const first = cycleSortState(none, 'potential');
    const reverse = cycleSortState(first, 'potential');
    const cleared = cycleSortState(reverse, 'potential');
    const other = cycleSortState(reverse, 'code');
    assert.deepEqual(none, { key: null, direction: null });
    assert.deepEqual(first, { key: 'potential', direction: 'descending' });
    assert.deepEqual(reverse, { key: 'potential', direction: 'ascending' });
    assert.deepEqual(cleared, { key: null, direction: null });
    assert.deepEqual(other, { key: 'code', direction: 'ascending' });
});

test('s2: 全固定列と動的module列は数値比較し、elite/level は常に複合比較する', () => {
    const sortMaster = makeSortMaster([
        sortOperator('A', { ja: 'Alpha', en: 'Alpha', ch: 'Alpha' }, '☆4', 2),
        sortOperator('B', { ja: 'Zulu', en: 'Zulu', ch: 'Zulu' }, '☆5', 1)
    ]);
    const shared = [
        { code: 'A', potential: 2, elite: 2, level: 1, skill: 2, skill1: 2, skill2: 2, skill3: 2, moduleM: 2 },
        { code: 'B', potential: 10, elite: 1, level: 99, skill: 10, skill1: 10, skill2: 10, skill3: 10, moduleM: 10 }
    ];
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'code', direction: 'ascending' }), ['A', 'B']);
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'name', direction: 'ascending' }, 'en'), ['A', 'B']);
    ['potential', 'skill', 'skill1', 'skill2', 'skill3', 'module:M'].forEach(key => {
        assert.deepEqual(sortCodes(sortMaster, shared, { key: key, direction: 'descending' }), ['B', 'A'], key);
    });
    ['elite', 'level'].forEach(key => {
        assert.deepEqual(sortCodes(sortMaster, shared, { key: key, direction: 'descending' }), ['A', 'B'], key);
    });
});

test('s3: module の非所持は resolver 経由で昇降とも末尾に置く', () => {
    const sortMaster = makeSortMaster([
        sortOperator('A', { ja: 'A', en: 'A', ch: 'A' }, '☆4', 1),
        sortOperator('B', { ja: 'B', en: 'B', ch: 'B' }, '☆4', 1, {}),
        sortOperator('C', { ja: 'C', en: 'C', ch: 'C' }, '☆4', 1)
    ]);
    const shared = [{ code: 'A', moduleM: 2 }, { code: 'B', moduleM: 999 }, { code: 'C', moduleM: 10 }];
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'module:M', direction: 'ascending' }), ['A', 'C', 'B']);
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'module:M', direction: 'descending' }), ['C', 'A', 'B']);
});

test('s4: 数値列の無値は 0 と混同せず昇降とも末尾に置く', () => {
    const sortMaster = makeSortMaster([
        sortOperator('zero', { ja: 'Zero', en: 'Zero', ch: 'Zero' }, '☆4', 1),
        sortOperator('value', { ja: 'Value', en: 'Value', ch: 'Value' }, '☆4', 1),
        sortOperator('missing', { ja: 'Missing', en: 'Missing', ch: 'Missing' }, '☆4', 1)
    ]);
    const shared = [
        { code: 'zero', potential: 0, skill: 0, skill1: 0, skill2: 0, skill3: 0 },
        { code: 'value', potential: 2, skill: 2, skill1: 2, skill2: 2, skill3: 2 },
        { code: 'missing', potential: null, skill: null, skill1: null, skill2: null, skill3: null }
    ];
    ['potential', 'skill', 'skill1', 'skill2', 'skill3'].forEach(key => {
        assert.deepEqual(sortCodes(sortMaster, shared, { key: key, direction: 'ascending' }), ['zero', 'value', 'missing'], key);
        assert.deepEqual(sortCodes(sortMaster, shared, { key: key, direction: 'descending' }), ['value', 'zero', 'missing'], key);
    });
});

test('s5: 名前は字種バケット、かな日本語照合、漢字中国語照合で言語切替時に再適用される', () => {
    const sortMaster = makeSortMaster([
        sortOperator('latin', { ja: 'Alpha', en: 'Mike', ch: '中' }, '☆4', 1),
        sortOperator('kata', { ja: 'ア', en: 'Zulu', ch: '阿' }, '☆4', 1),
        sortOperator('hira', { ja: 'あ', en: 'Alpha', ch: '八' }, '☆4', 1),
        sortOperator('han-middle', { ja: '中', en: 'Beta', ch: '中' }, '☆4', 1),
        sortOperator('han-eight', { ja: '八', en: 'Gamma', ch: '八' }, '☆4', 1)
    ]);
    const state = { key: 'name', direction: 'ascending' };
    assert.deepEqual(sortCodes(sortMaster, [], state, 'ja'), ['latin', 'kata', 'hira', 'han-eight', 'han-middle']);
    assert.deepEqual(sortCodes(sortMaster, [], state, 'en'), ['hira', 'han-middle', 'han-eight', 'latin', 'kata']);
    assert.deepEqual(sortCodes(sortMaster, [], state, 'ch'), ['kata', 'hira', 'han-eight', 'latin', 'han-middle']);
});

test('s6: 名前は選択言語が空なら中国語だけで補完し、全言語欠損は昇降とも末尾に置く', () => {
    const sortMaster = makeSortMaster([
        sortOperator('selected', { ja: 'ア', en: 'Alpha', ch: '阿' }, '☆4', 1),
        sortOperator('china-fallback', { ja: '', en: '', ch: '中' }, '☆4', 1),
        sortOperator('missing', { ja: null, en: null, ch: null }, '☆4', 1)
    ]);
    assert.deepEqual(sortCodes(sortMaster, [], { key: 'name', direction: 'ascending' }, 'en'), ['selected', 'china-fallback', 'missing']);
    assert.deepEqual(sortCodes(sortMaster, [], { key: 'name', direction: 'descending' }, 'en'), ['china-fallback', 'selected', 'missing']);
});

test('s7: 同値時は固定 tie-break 鎖を使い、主キーに含まれる要素は鎖から除外する', () => {
    const sortMaster = makeSortMaster([
        sortOperator('training', { ja: 'Z', en: 'Z', ch: 'Z' }, '☆1', 9),
        sortOperator('rarity', { ja: 'Z', en: 'Z', ch: 'Z' }, '☆6', 9),
        sortOperator('class', { ja: 'Z', en: 'Z', ch: 'Z' }, '☆4', 1),
        sortOperator('name-a', { ja: 'A', en: 'A', ch: 'A' }, '☆4', 1),
        sortOperator('name-z', { ja: 'Z', en: 'Z', ch: 'Z' }, '☆4', 1)
    ]);
    const shared = [
        { code: 'training', potential: 1, elite: 2, level: 1 },
        { code: 'rarity', potential: 1, elite: 1, level: 1 },
        { code: 'class', potential: 1, elite: 1, level: 1 },
        { code: 'name-a', potential: 1, elite: 1, level: 1 },
        { code: 'name-z', potential: 1, elite: 1, level: 1 }
    ];
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'potential', direction: 'descending' }, 'en'), ['training', 'rarity', 'name-a', 'class', 'name-z']);
    assert.deepEqual(sortTieBreakKeys('elite'), ['rarity', 'class', 'name']);
    assert.deepEqual(sortTieBreakKeys('level'), ['rarity', 'class', 'name']);
    assert.deepEqual(sortTieBreakKeys('name'), ['training', 'rarity', 'class']);

    const primaryMaster = makeSortMaster([
        sortOperator('high-training', { ja: 'Z', en: 'Z', ch: 'Z' }, '☆4', 1),
        sortOperator('low-training', { ja: 'A', en: 'A', ch: 'A' }, '☆6', 9)
    ]);
    const primaryShared = [
        { code: 'high-training', elite: 2, level: 1 },
        { code: 'low-training', elite: 1, level: 99 }
    ];
    assert.deepEqual(sortCodes(primaryMaster, primaryShared, { key: 'elite', direction: 'ascending' }, 'en'), ['low-training', 'high-training']);
    assert.deepEqual(sortCodes(primaryMaster, primaryShared, { key: 'level', direction: 'ascending' }, 'en'), ['low-training', 'high-training']);
    assert.deepEqual(sortCodes(primaryMaster, primaryShared, { key: 'name', direction: 'ascending' }, 'en'), ['low-training', 'high-training']);
});

test('s8: tie-break の rarity/class 欠損は既定数値と混同せず常に末尾に置く', () => {
    const minimalMaster = makeSortMaster([
        sortOperator('known', { ja: 'K', en: 'K', ch: 'K' }, null, 1)
    ]);
    assert.deepEqual(
        sortCodes(minimalMaster, [{ code: 'known', potential: 1 }, { code: 'unknown', potential: 1 }], { key: 'potential', direction: 'descending' }, 'en'),
        ['known', 'unknown']
    );

    const sortMaster = makeSortMaster([
        sortOperator('rarity-known', { ja: 'R', en: 'R', ch: 'R' }, '☆4', null),
        sortOperator('class-known', { ja: 'C', en: 'C', ch: 'C' }, null, 1)
    ]);
    const shared = [
        { code: 'rarity-known', potential: 1 },
        { code: 'class-known', potential: 1 },
        { code: 'unknown', potential: 1 }
    ];
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'potential', direction: 'descending' }, 'en'), ['rarity-known', 'class-known', 'unknown']);
});

test('s9: none・未知keyは入力順を維持し、filter 後のソートと解除は同じ view pipeline で戻る', () => {
    const sortMaster = makeSortMaster([
        sortOperator('B', { ja: 'B', en: 'B', ch: 'B' }, '☆4', 1),
        sortOperator('A', { ja: 'A', en: 'A', ch: 'A' }, '☆4', 1),
        sortOperator('C', { ja: 'C', en: 'C', ch: 'C' }, '☆4', 1)
    ]);
    const shared = [{ code: 'B', potential: 1 }, { code: 'A', potential: 1 }, { code: 'C', potential: 0 }];
    assert.deepEqual(sortCodes(sortMaster, shared, createEmptySortState()), ['B', 'A', 'C']);
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'missing', direction: 'ascending' }), ['B', 'A', 'C']);
    assert.deepEqual(sortCodes(sortMaster, shared, { key: 'code', direction: 'ascending' }, 'ja', { potential: [1] }), ['A', 'B']);
    assert.deepEqual(sortCodes(sortMaster, shared, createEmptySortState(), 'ja', { potential: [1] }), ['B', 'A']);
});
