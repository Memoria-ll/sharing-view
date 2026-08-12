// main.js - メイン機能

let importedOperators = null;
let masterData = parseMasterData(null, null);
let currentDataId = null;
let currentLanguage = 'ja';
let appliedFilterCriteria = createEmptyFilterCriteria();
let draftFilterCriteria = null;
let activeFilterFacet = null;
let filterOptionCatalog = null;
let sortState = createEmptySortState();

const FILTER_TEXT = {
    ja: {
        open: 'フィルター', title: 'オペレーターフィルター', clear: 'すべて解除', apply: '適用', cancel: 'キャンセル', close: '閉じる',
        none: '条件なし', result: '一致', total: '全件', preview: 'プレビュー', includeHidden: '隠し陣営を含む', includeSub: '副陣営を含む',
        since: '開始日', to: '終了日', profession: '職業・職分', sex: '性別', place: '出身', rarity: 'レアリティ', race: '種族', faction: '陣営', date: '実装日', ownership: '所持/未所持', potential: '潜在',
        config: '設定', closeConfig: '閉じる', displayLanguage: '表示言語', copyUrl: 'URLをコピー', copied: 'コピーしました！', post: 'Xでポスト'
    },
    en: {
        open: 'Filter', title: 'Operator filters', clear: 'Clear all', apply: 'Apply', cancel: 'Cancel', close: 'Close',
        none: 'No conditions', result: 'Matched', total: 'Total', preview: 'Preview', includeHidden: 'Include hidden factions', includeSub: 'Include subfactions',
        since: 'Since', to: 'To', profession: 'Class / subclass', sex: 'Sex', place: 'Place', rarity: 'Rarity', race: 'Race', faction: 'Faction', date: 'Release date', ownership: 'Ownership', potential: 'Potential',
        config: 'Config', closeConfig: 'Close', displayLanguage: 'Display language', copyUrl: 'Copy URL', copied: 'Copied!', post: 'Post on X'
    },
    ch: {
        open: '筛选', title: '干员筛选', clear: '清除全部', apply: '应用', cancel: '取消', close: '关闭',
        none: '无条件', result: '匹配', total: '全部', preview: '预览', includeHidden: '包含隐藏阵营', includeSub: '包含子阵营',
        since: '开始日期', to: '结束日期', profession: '职业 / 分支', sex: '性别', place: '出身', rarity: '稀有度', race: '种族', faction: '阵营', date: '实装日期', ownership: '持有', potential: '潜能',
        config: '设置', closeConfig: '关闭', displayLanguage: '显示语言', copyUrl: '复制链接', copied: '已复制！', post: '发布到 X'
    }
};

function filterText(key) {
    return FILTER_TEXT[currentLanguage][key] || FILTER_TEXT.ja[key] || key;
}

function optionLabel(option) {
    return resolveLocalizedName(option.names, currentLanguage, option.value);
}

function pairIdentity(pair) {
    return `${pair.classId}/${pair.subClassId}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const copyUrlButton = document.getElementById('copy-url-button');
    const tweetButton = document.getElementById('tweet-button');
    const dialog = document.getElementById('operator-filter-dialog');
    const configDialog = document.getElementById('config-dialog');
    const openConfigButton = document.getElementById('open-config-button');
    const openButton = document.getElementById('open-filter-button');

    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finishFilterDialog('cancel');
    });
    dialog.addEventListener('close', () => {
        if (draftFilterCriteria !== null) cleanupFilterDialog();
    });
    document.getElementById('filter-close-button').addEventListener('click', () => finishFilterDialog('cancel'));
    document.getElementById('filter-cancel-button').addEventListener('click', () => finishFilterDialog('cancel'));
    document.getElementById('filter-clear-button').addEventListener('click', () => updateDraftCriteria(createEmptyFilterCriteria()));
    document.getElementById('filter-form').addEventListener('submit', event => {
        event.preventDefault();
        finishFilterDialog('apply');
    });
    openButton.addEventListener('click', openFilterDialog);
    openConfigButton.addEventListener('click', () => configDialog.showModal());
    configDialog.addEventListener('close', () => openConfigButton.focus());
    initializeSortHeaders();

    const urlParams = new URLSearchParams(window.location.search);
    const dataId = urlParams.get('d');

    document.querySelectorAll('input[name="language"]').forEach(radio => {
        radio.addEventListener('change', event => {
            currentLanguage = event.target.value;
            renderLocalizedControls();
            renderFilterToolbar();
            if (dialog.open) renderFilterDialog();
            if (importedOperators !== null) displayOperators(importedOperators);
        });
    });

    fetchMasterData()
        .then(raw => {
            masterData = parseMasterData(raw.operator, raw.gameData);
            filterOptionCatalog = buildFilterOptionCatalog(masterData);
            renderTableHeaders();
            if (dataId) {
                currentDataId = dataId;
                return fetchOperatorData(dataId);
            }
            return null;
        })
        .then(operatorData => {
            if (Array.isArray(operatorData)) {
                importedOperators = operatorData;
                document.getElementById('filter-toolbar').hidden = false;
                displayOperators(importedOperators);
            }
        })
        .catch(error => {
            console.error('初期化エラー:', error);
            const operatorsBody = document.getElementById('operators-body');
            const errorRow = document.createElement('tr');
            const errorCell = document.createElement('td');
            errorCell.colSpan = 9 + masterData.moduleIds.length;
            errorCell.textContent = 'データの読み込みに失敗しました。';
            errorCell.style.textAlign = 'center';
            errorCell.style.padding = '20px';
            errorCell.style.color = 'red';
            errorRow.appendChild(errorCell);
            operatorsBody.appendChild(errorRow);
        });

    copyUrlButton.addEventListener('click', () => {
        if (!currentDataId) {
            alert('表示するデータがありません。');
            return;
        }
        const url = `${window.location.origin}${window.location.pathname}?d=${currentDataId}`;
        copyToClipboard(url);
        copyUrlButton.textContent = filterText('copied');
        setTimeout(() => { copyUrlButton.textContent = filterText('copyUrl'); }, 2000);
    });

    tweetButton.addEventListener('click', () => {
        if (!currentDataId) {
            alert('表示するデータがありません。');
            return;
        }
        const shareUrl = `${window.location.origin}${window.location.pathname}?d=${currentDataId}`;
        const tweetText = `私のオペレーターの育成状況を共有します！ ${shareUrl} #Arknights #アークナイツ #ANManager`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank', 'width=550,height=420');
    });
});

function renderLocalizedControls() {
    document.documentElement.lang = currentLanguage === 'ch' ? 'zh' : currentLanguage;
    document.getElementById('open-config-button').textContent = filterText('config');
    document.getElementById('config-dialog-title').textContent = filterText('config');
    document.getElementById('config-close-button').textContent = filterText('closeConfig');
    document.getElementById('language-selector-title').textContent = filterText('displayLanguage');
    document.getElementById('copy-url-button').textContent = filterText('copyUrl');
    document.getElementById('tweet-button').textContent = filterText('post');
    renderTableHeaders();
}

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('クリップボードへのコピーに失敗しました:', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        if (!document.execCommand('copy')) console.error('クリップボードへのコピーに失敗しました');
    } catch (err) {
        console.error('クリップボードへのコピーに失敗しました:', err);
    }
    document.body.removeChild(textArea);
}

function renderTableHeaders() {
    const headRow = document.getElementById('operators-head-row');
    const subheadRow = document.getElementById('operators-subhead-row');
    const labels = tableColumnLabels(currentLanguage, masterData.moduleIds);
    document.querySelectorAll('#operators-table th[data-column-key]').forEach(th => {
        th.textContent = labels[th.dataset.columnKey];
    });
    document.querySelector('[data-column-group="mastery"]').textContent = labels.mastery;
    const moduleGroup = document.querySelector('[data-column-group="module"]');
    moduleGroup.textContent = labels.module;
    moduleGroup.colSpan = Math.max(1, masterData.moduleIds.length);
    moduleGroup.hidden = masterData.moduleIds.length === 0;
    subheadRow.querySelectorAll('th[data-module-id]').forEach(th => th.remove());
    labels.modules.forEach((label, index) => {
        const th = document.createElement('th');
        th.textContent = label;
        th.dataset.moduleId = masterData.moduleIds[index];
        th.dataset.sortKey = `module:${masterData.moduleIds[index]}`;
        if (index === 0) th.classList.add('column-group-start');
        configureSortableHeader(th);
        subheadRow.appendChild(th);
    });
    renderSortHeaderState();
}

function initializeSortHeaders() {
    document.querySelectorAll('#operators-head-row th[data-sort-key]').forEach(configureSortableHeader);
    renderSortHeaderState();
}

function configureSortableHeader(th) {
    th.classList.add('sortable-header');
    th.setAttribute('aria-sort', 'none');
    th.addEventListener('click', () => {
        sortState = cycleSortState(sortState, th.dataset.sortKey);
        renderSortHeaderState();
        if (importedOperators !== null) displayOperators(importedOperators);
    });
}

function renderSortHeaderState() {
    document.querySelectorAll('#operators-head-row th[data-sort-key]').forEach(th => {
        const isActive = sortState.key === th.dataset.sortKey && sortState.direction !== null;
        th.classList.toggle('sort-ascending', isActive && sortState.direction === 'ascending');
        th.classList.toggle('sort-descending', isActive && sortState.direction === 'descending');
        th.setAttribute('aria-sort', isActive ? sortState.direction : 'none');
    });
}

function renderFilterToolbar() {
    const toolbar = document.getElementById('filter-toolbar');
    if (toolbar.hidden) return;
    const openButton = document.getElementById('open-filter-button');
    openButton.textContent = filterText('open');
    const chips = document.getElementById('applied-filter-chips');
    chips.replaceChildren(...createConditionNodes(appliedFilterCriteria));
}

function displayOperators(operators) {
    const view = buildOperatorView(operators, masterData, appliedFilterCriteria, sortState, currentLanguage);
    const operatorsBody = document.getElementById('operators-body');
    operatorsBody.innerHTML = '';
    view.rows.forEach(operator => {
        const tr = document.createElement('tr');
        const charInfo = getOperatorInfo(masterData, operator.code);
        appendCell(tr, operator.code, 'operator-code');
        const tdName = appendCell(tr, resolveLocalizedName(charInfo.name, currentLanguage, 'Unknown'), 'operator-name');
        if (charInfo.rarity) {
            const rarityNum = charInfo.rarity.replace(/\D/g, '');
            if (rarityNum) tdName.classList.add(`rarity-${rarityNum}`);
        }
        ['potential', 'elite', 'level'].forEach(key => appendCell(tr, operator[key]));
        ['skill', 'skill1', 'skill2', 'skill3'].forEach((key, index) => appendCell(tr, operator[key], index === 0 ? 'column-group-start' : ''));
        masterData.moduleIds.forEach((moduleId, index) => appendCell(tr, resolveModuleCell(charInfo, operator, moduleId), index === 0 ? 'column-group-start' : ''));
        operatorsBody.appendChild(tr);
    });
    const count = document.getElementById('filter-result-count');
    count.textContent = `${filterText('result')}: ${view.rows.length} / ${filterText('total')}: ${view.totalCount}`;
    renderFilterToolbar();
    renderSortHeaderState();
}

function appendCell(tr, value, className = '') {
    const td = document.createElement('td');
    td.textContent = value;
    if (className) td.classList.add(className);
    if (value === 0 || value === '-') td.classList.add('secondary-value');
    tr.appendChild(td);
    return td;
}

function openFilterDialog() {
    const dialog = document.getElementById('operator-filter-dialog');
    if (importedOperators === null || dialog.open) return;
    draftFilterCriteria = normalizeFilterCriteria(appliedFilterCriteria);
    activeFilterFacet = FILTER_FACET_KEYS.find(key => !isFilterCriteriaEmpty({ [key]: draftFilterCriteria[key] })) || FILTER_FACET_KEYS[0];
    renderFilterDialog();
    dialog.showModal();
    const activeButton = document.querySelector(`[data-filter-facet="${activeFilterFacet}"]`);
    if (activeButton) activeButton.focus();
}

function finishFilterDialog(mode) {
    const dialog = document.getElementById('operator-filter-dialog');
    if (mode === 'apply' && draftFilterCriteria !== null) {
        appliedFilterCriteria = normalizeFilterCriteria(draftFilterCriteria);
        displayOperators(importedOperators);
    }
    if (dialog.open) dialog.close();
    // modal 中は背景の opener が inert なので、閉じてから focus を戻す。
    cleanupFilterDialog();
}

function cleanupFilterDialog() {
    draftFilterCriteria = null;
    activeFilterFacet = null;
    document.getElementById('open-filter-button').focus();
}

function updateDraftCriteria(nextCriteria) {
    const viewState = captureFilterEditorViewState();
    draftFilterCriteria = normalizeFilterCriteria(nextCriteria);
    renderFilterDialog();
    restoreFilterEditorViewState(viewState);
}

function captureFilterEditorViewState() {
    const editor = document.getElementById('filter-editor');
    const controls = [...editor.querySelectorAll('input, button')];
    const focusIndex = editor.contains(document.activeElement) ? controls.indexOf(document.activeElement) : -1;
    const scrollContainers = [editor, ...editor.querySelectorAll('.filter-option-list, .filter-profession-groups')];
    return {
        focusIndex: focusIndex,
        scrollPositions: scrollContainers.map(element => ({ top: element.scrollTop, left: element.scrollLeft }))
    };
}

function restoreFilterEditorViewState(viewState) {
    const editor = document.getElementById('filter-editor');
    if (viewState.focusIndex >= 0) {
        const control = editor.querySelectorAll('input, button')[viewState.focusIndex];
        if (control) control.focus({ preventScroll: true });
    }
    const scrollContainers = [editor, ...editor.querySelectorAll('.filter-option-list, .filter-profession-groups')];
    scrollContainers.forEach((element, index) => {
        const position = viewState.scrollPositions[index];
        if (position) element.scrollTo(position.left, position.top);
    });
}

function renderFilterDialog() {
    if (draftFilterCriteria === null || !filterOptionCatalog) return;
    const dialog = document.getElementById('operator-filter-dialog');
    document.getElementById('filter-dialog-title').textContent = filterText('title');
    document.getElementById('filter-close-button').textContent = filterText('close');
    document.getElementById('filter-clear-button').textContent = filterText('clear');
    document.getElementById('filter-cancel-button').textContent = filterText('cancel');
    document.getElementById('filter-apply-button').textContent = filterText('apply');
    const categories = document.getElementById('filter-category-list');
    categories.replaceChildren();
    FILTER_FACET_KEYS.forEach(key => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.filterFacet = key;
        button.textContent = filterText(key);
        button.setAttribute('aria-pressed', String(activeFilterFacet === key));
        button.addEventListener('click', () => { activeFilterFacet = key; renderFilterDialog(); });
        categories.appendChild(button);
    });
    const editor = document.getElementById('filter-editor');
    editor.replaceChildren();
    renderFacetEditor(editor, activeFilterFacet);
    const cards = document.getElementById('draft-filter-cards');
    const conditionNodes = createConditionNodes(draftFilterCriteria, true);
    cards.replaceChildren(...conditionNodes);
    const preview = buildOperatorView(importedOperators, masterData, draftFilterCriteria);
    document.getElementById('filter-preview-count').textContent = `${filterText('preview')}: ${preview.rows.length} / ${preview.totalCount}`;
    if (!dialog.open) return;
}

function createConditionNodes(criteria, draft) {
    const nodes = [];
    FILTER_FACET_KEYS.forEach(key => {
        if (isFilterCriteriaEmpty({ [key]: criteria[key] })) return;
        const card = document.createElement('div');
        card.className = 'filter-condition-card';
        const label = document.createElement('strong');
        label.textContent = filterText(key);
        const summary = document.createElement('span');
        summary.textContent = summarizeFacet(key, criteria[key]);
        card.append(label, summary);
        if (draft) {
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.textContent = filterText('clear');
            clear.addEventListener('click', () => updateDraftCriteria(clearFilterFacet(draftFilterCriteria, key)));
            card.appendChild(clear);
        }
        nodes.push(card);
    });
    if (nodes.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'filter-condition-empty';
        empty.textContent = filterText('none');
        nodes.push(empty);
    }
    return nodes;
}

function summarizeFacet(key, value) {
    const catalog = filterOptionCatalog[key];
    if (key === 'profession') {
        const classes = catalog.classes.filter(option => value.classes.includes(option.value)).map(optionLabel);
        const subClasses = catalog.subClasses.filter(option => value.subClasses.some(pair => pairIdentity(pair) === pairIdentity(option.value))).map(optionLabel);
        return [...classes, ...subClasses].join(', ');
    }
    if (key === 'faction') {
        const ids = catalog.filter(option => value.ids.includes(option.value)).map(optionLabel);
        if (value.includeHidden) ids.push(filterText('includeHidden'));
        if (value.includeSubFactions) ids.push(filterText('includeSub'));
        return ids.join(', ');
    }
    if (key === 'date') return [catalog.find(option => option.value === value.region), value.since, value.to].filter(Boolean).map(item => typeof item === 'string' ? item : optionLabel(item)).join(' – ');
    if (key === 'ownership') return optionLabel(catalog.find(option => option.value === value));
    return catalog.filter(option => value.includes(option.value)).map(optionLabel).join(', ');
}

function renderFacetEditor(container, key) {
    const heading = document.createElement('h3');
    heading.textContent = filterText(key);
    container.appendChild(heading);
    if (key === 'profession') return renderProfessionEditor(container);
    if (key === 'faction') return renderFactionEditor(container);
    if (key === 'date') return renderDateEditor(container);
    if (key === 'ownership') return renderOwnershipEditor(container);
    renderMultiValueEditor(container, filterOptionCatalog[key], draftFilterCriteria[key], values => {
        const next = normalizeFilterCriteria(draftFilterCriteria);
        next[key] = values;
        updateDraftCriteria(next);
    });
}

function renderMultiValueEditor(container, options, selected, updateSelected) {
    const list = document.createElement('div');
    list.className = 'filter-option-list';
    options.forEach(option => list.appendChild(createCheckOption(optionLabel(option), selected.includes(option.value), checked => {
        const values = checked ? [...selected, option.value] : selected.filter(value => value !== option.value);
        updateSelected(values);
    })));
    container.appendChild(list);
}

function renderProfessionEditor(container) {
    const value = draftFilterCriteria.profession;
    const groups = document.createElement('div');
    groups.className = 'filter-profession-groups';
    filterOptionCatalog.profession.classes.forEach(classOption => {
        const group = document.createElement('fieldset');
        group.className = 'filter-profession-group';
        const legend = document.createElement('legend');
        legend.textContent = optionLabel(classOption);
        group.appendChild(legend);
        group.appendChild(createCheckOption(optionLabel(classOption), value.classes.includes(classOption.value), checked => {
            const next = normalizeFilterCriteria(draftFilterCriteria);
            next.profession.classes = checked ? [...value.classes, classOption.value] : value.classes.filter(id => id !== classOption.value);
            if (checked) next.profession.subClasses = value.subClasses.filter(pair => pair.classId !== classOption.value);
            updateDraftCriteria(next);
        }));
        const subClasses = document.createElement('div');
        subClasses.className = 'filter-subclass-list';
        filterOptionCatalog.profession.subClasses
            .filter(option => option.value.classId === classOption.value)
            .forEach(option => subClasses.appendChild(createCheckOption(optionLabel(option), value.subClasses.some(pair => pairIdentity(pair) === pairIdentity(option.value)), checked => {
                const next = normalizeFilterCriteria(draftFilterCriteria);
                next.profession.subClasses = checked ? [...value.subClasses, option.value] : value.subClasses.filter(pair => pairIdentity(pair) !== pairIdentity(option.value));
                if (checked) next.profession.classes = value.classes.filter(classId => classId !== option.value.classId);
                updateDraftCriteria(next);
            })));
        group.appendChild(subClasses);
        groups.appendChild(group);
    });
    container.appendChild(groups);
}

function renderFactionEditor(container) {
    const value = draftFilterCriteria.faction;
    const flags = document.createElement('div');
    flags.className = 'filter-flag-list';
    [['includeHidden', 'includeHidden'], ['includeSubFactions', 'includeSub']].forEach(([field, label]) => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = value[field];
        input.disabled = value.ids.length === 0;
        input.addEventListener('change', () => {
            const next = normalizeFilterCriteria(draftFilterCriteria);
            next.faction[field] = input.checked;
            updateDraftCriteria(next);
        });
        const wrapper = document.createElement('label');
        wrapper.append(input, document.createTextNode(filterText(label)));
        flags.appendChild(wrapper);
    });
    container.appendChild(flags);
    renderMultiValueEditor(container, filterOptionCatalog.faction, value.ids, ids => {
        const next = normalizeFilterCriteria(draftFilterCriteria);
        next.faction.ids = ids;
        updateDraftCriteria(next);
    });
}

function renderDateEditor(container) {
    const value = draftFilterCriteria.date;
    const regionList = document.createElement('div');
    filterOptionCatalog.date.forEach(option => {
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'filter-date-region';
        input.checked = value.region === option.value;
        input.addEventListener('change', () => {
            const next = normalizeFilterCriteria(draftFilterCriteria);
            next.date.region = option.value;
            updateDraftCriteria(next);
        });
        const label = document.createElement('label');
        label.append(input, document.createTextNode(optionLabel(option)));
        regionList.appendChild(label);
    });
    container.appendChild(regionList);
    [['since', 'since'], ['to', 'to']].forEach(([field, labelKey]) => {
        const label = document.createElement('label');
        label.textContent = filterText(labelKey);
        const input = document.createElement('input');
        input.type = 'date';
        input.value = value[field] || '';
        input.disabled = value.region === null;
        input.addEventListener('change', () => {
            const next = normalizeFilterCriteria(draftFilterCriteria);
            next.date[field] = input.value || null;
            updateDraftCriteria(next);
        });
        label.appendChild(input);
        container.appendChild(label);
    });
}

function renderOwnershipEditor(container) {
    const value = draftFilterCriteria.ownership;
    filterOptionCatalog.ownership.forEach(option => {
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'filter-ownership';
        input.checked = value === option.value;
        input.addEventListener('change', () => {
            const next = normalizeFilterCriteria(draftFilterCriteria);
            next.ownership = option.value;
            updateDraftCriteria(next);
        });
        const label = document.createElement('label');
        label.append(input, document.createTextNode(optionLabel(option)));
        container.appendChild(label);
    });
}

function createCheckOption(text, checked, onChange) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    const label = document.createElement('label');
    label.className = 'filter-option';
    label.append(input, document.createTextNode(text));
    return label;
}
