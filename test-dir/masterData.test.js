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
    DEFAULT_OPERATOR_VALUES
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
