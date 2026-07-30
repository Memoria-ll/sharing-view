// masterData.test.js - 実マスターデータを入力に純粋ロジック(masterData.js)のビヘイビアを固定する
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

const rawMaster = require('./fixtures/operator_master_data_shareview.json');
const legacyMasterSubset = require('./fixtures/legacy-master-subset.json');

const master = parseMasterData(rawMaster);

// g. parseMasterData と罠1
test('g1: moduleIds はトップレベルmodules配列の順序どおり', () => {
    assert.deepEqual(master.moduleIds, ['X', 'Y', 'D', 'A', 'B']);
});

test('g2: operators はマスター全件を保持する', () => {
    assert.equal(Object.keys(master.operators).length, 423);
});

test('g3: buildDisplayRows([], master) は423行。codeに modules/operators を含まない', () => {
    const rows = buildDisplayRows([], master);
    assert.equal(rows.length, 423);
    const codes = rows.map(row => row.code);
    assert.ok(!codes.includes('modules'));
    assert.ok(!codes.includes('operators'));
});

test('g4: parseMasterData は不正/旧形式入力でも例外を投げず空に縮退する', () => {
    assert.deepEqual(parseMasterData({}), { moduleIds: [], operators: {} });
    assert.deepEqual(parseMasterData(legacyMasterSubset), { moduleIds: [], operators: {} });
});

// h. 列
test('h1: moduleColumnLabels は moduleIds をそのままラベル化する', () => {
    assert.deepEqual(
        moduleColumnLabels(master.moduleIds),
        ['Module X', 'Module Y', 'Module D', 'Module A', 'Module B']
    );
});

test('h2: index.html の静的theadは9本、動的モジュール列を足すと14本になる', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const theadMatch = html.match(/<thead>[\s\S]*?<\/thead>/);
    assert.ok(theadMatch, 'index.html に <thead> が見つからない');
    const thCount = (theadMatch[0].match(/<th\b/g) || []).length;
    assert.equal(thCount, 9);
    assert.equal(thCount + moduleColumnLabels(master.moduleIds).length, 14);
});

// i. resolveModuleCell（罠4）
test('i1: KZ08（所持0件）は全モジュール列が非所持', () => {
    const charInfo = getOperatorInfo(master, 'KZ08');
    const row = { code: 'KZ08' };
    const cells = master.moduleIds.map(id => resolveModuleCell(charInfo, row, id));
    assert.deepEqual(cells, ['-', '-', '-', '-', '-']);
});

test('i2: RL03（X,D所持）はX/D列が数値、Y/A/B列が非所持', () => {
    const charInfo = getOperatorInfo(master, 'RL03');
    const row = { code: 'RL03', moduleX: 3, moduleD: 2 };
    const cells = {};
    master.moduleIds.forEach(id => { cells[id] = resolveModuleCell(charInfo, row, id); });
    assert.equal(cells.X, '3');
    assert.equal(cells.D, '2');
    assert.equal(cells.Y, '-');
    assert.equal(cells.A, '-');
    assert.equal(cells.B, '-');
});

test('i3: RE10 + moduleBキーなしの旧共有データ行 → A列は共有データの値、B列は0（罠4）', () => {
    const charInfo = getOperatorInfo(master, 'RE10');
    const row = {
        code: 'RE10', potential: 6, elite: 2, level: 90, skill: 7,
        skill1: 3, skill2: 0, skill3: 0, moduleX: 0, moduleY: 0, moduleD: 0, moduleA: 3
    };
    assert.equal(resolveModuleCell(charInfo, row, 'A'), '3');
    assert.equal(resolveModuleCell(charInfo, row, 'B'), '0');
});

test('i4: RL03の行にmoduleA(マスター上非所持)の値が入っていてもマスター優先で非所持表示', () => {
    const charInfo = getOperatorInfo(master, 'RL03');
    const row = { code: 'RL03', moduleA: 3 };
    assert.equal(resolveModuleCell(charInfo, row, 'A'), '-');
});

test('i5: マスターに無いコードはモジュール列に数値を出す(非所持扱いにしない)', () => {
    const charInfo = getOperatorInfo(master, 'ZZ99');
    const row = { code: 'ZZ99', moduleX: 2 };
    assert.equal(resolveModuleCell(charInfo, row, 'X'), '2');
    assert.equal(resolveModuleCell(charInfo, row, 'Y'), '0');
});

test('i6: 全行×全moduleIdsの `-`/数値セル数がフィクスチャから導出した値と一致する', () => {
    const rows = buildDisplayRows([], master);

    let ownedFromFixture = 0;
    for (const code of Object.keys(master.operators)) {
        const modules = master.operators[code].modules;
        if (modules && typeof modules === 'object') {
            ownedFromFixture += Object.values(modules).filter(v => v === true).length;
        }
    }
    const expectedDash = rows.length * master.moduleIds.length - ownedFromFixture;
    const expectedNum = ownedFromFixture;

    let dashCount = 0;
    let numCount = 0;
    rows.forEach(row => {
        const charInfo = getOperatorInfo(master, row.code);
        master.moduleIds.forEach(id => {
            const cell = resolveModuleCell(charInfo, row, id);
            if (cell === '-') {
                dashCount += 1;
            } else {
                numCount += 1;
            }
        });
    });

    assert.equal(dashCount, expectedDash);
    assert.equal(numCount, expectedNum);
    assert.equal(dashCount, 1628);
    assert.equal(numCount, 487);
});

// j. buildDisplayRows
test('j1: 共有データ1件を渡すと該当行は共有値、他行は既定値になる', () => {
    const shared = [{
        code: 'LM04', potential: 5, elite: 2, level: 80,
        skill: 7, skill1: 3, skill2: 3, skill3: 0
    }];
    const rows = buildDisplayRows(shared, master);
    assert.equal(rows.length, 423);

    const lm04Row = rows.find(row => row.code === 'LM04');
    assert.equal(lm04Row.potential, 5);
    assert.equal(lm04Row.skill1, 3);

    const otherRow = rows.find(row => row.code !== 'LM04');
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

test('j2: マスターに無いコードの共有データは末尾に追加され行数が424になる', () => {
    const rows = buildDisplayRows([{ code: 'ZZ99', moduleX: 2 }], master);
    assert.equal(rows.length, 424);
    assert.equal(rows[rows.length - 1].code, 'ZZ99');
});

test('j3: コード toString の共有データも末尾に追加され行数が424になる(prototype誤判定なし)', () => {
    const rows = buildDisplayRows([{ code: 'toString', moduleX: 1 }], master);
    assert.equal(rows.length, 424);
    assert.equal(rows[rows.length - 1].code, 'toString');
});
