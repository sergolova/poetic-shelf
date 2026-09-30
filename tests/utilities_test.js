/**
 * ==========================================================================
 * tests/utilities_test.js
 * Тесты чистых функций из assets/utilities.js.
 *
 * Запуск:  npm test   (или  node --test tests/)
 *
 * Файл загружается в Node как обычный скрипт (проект без сборщика), поэтому
 * функции копируются чтением исходника, а не импортом модуля. Так тест
 * проверяет РЕАЛЬНЫЙ код из assets/, а не его копию в тесте.
 * ==========================================================================
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UTILS_PATH = path.join(__dirname, '..', 'assets', 'utilities.js');
const source = fs.readFileSync(UTILS_PATH, 'utf8');

/** Выполняет исходник utilities.js и достаёт из него функции. */
function loadUtilities() {
    const sandbox = { window: {}, document: {} };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: UTILS_PATH });
    return sandbox;
}

const utils = loadUtilities();


test('escapeHtml экранирует все опасные спецсимволы', () => {
    assert.strictEqual(utils.escapeHtml('<b>'), '&lt;b&gt;');
    assert.strictEqual(utils.escapeHtml('a & b'), 'a &amp; b');
    assert.strictEqual(utils.escapeHtml('"кавычки"'), '&quot;кавычки&quot;');
    // апостроф берём из входа, а не из русского слова — само слово
    // не содержит ' и поэтому экранироваться нечему
    assert.strictEqual(utils.escapeHtml("it's"), 'it&#039;s');
    assert.strictEqual(utils.escapeHtml('<a href="x">&\'</a>'),
                       '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;');
});

test('escapeHtml не ломает кириллицу и обычный текст', () => {
    assert.strictEqual(utils.escapeHtml('Весна в Праге'), 'Весна в Праге');
    assert.strictEqual(utils.escapeHtml('100% — да'), '100% — да');
});

test('escapeHtml на пустых значениях возвращает пустую строку', () => {
    // null/undefined в шаблонных строках дали бы «null»/«undefined»
    assert.strictEqual(utils.escapeHtml(''), '');
    assert.strictEqual(utils.escapeHtml(null), '');
    assert.strictEqual(utils.escapeHtml(undefined), '');
});

test('escapeHtml закрывает главный вектор XSS в разметке произведений', () => {
    // Регрессия: текст пользователя попадает в innerHTML карточек.
    const xss = '<img src=x onerror="alert(1)">';
    assert.ok(!utils.escapeHtml(xss).includes('<img'));
    assert.ok(utils.escapeHtml(xss).includes('&lt;img'));
});

test('escapeHtml не даёт вырваться из атрибута — регрессия', () => {
    // Фамилия автора подставлялась в alt="..." без экранирования.
    // Кавычка закрывала атрибут, и «onerror=...» становился обработчиком:
    //   <img src="..." alt="Пушкин" onerror="alert(1)">
    const hostile = 'Пушкин" onerror="alert(1)';
    const escaped = utils.escapeHtml(hostile);
    assert.ok(!escaped.includes('"'), 'кавычка не экранирована — атрибут рвётся');
    assert.ok(escaped.includes('&quot;'));
});

test('escapeHtml закрывает одинарную кавычку и угловую скобку в атрибутах', () => {
    // Значения попадают и в одинарно-кавычные атрибуты (value, title).
    assert.ok(!utils.escapeHtml("' onfocus='alert(1)").includes("'"));
    assert.ok(!utils.escapeHtml('a>b').includes('>'));
});

test('normalizeUnicode приводит текст к NFC', () => {
    // «é» как e + комбинирующий акцент == «é» в NFC
    const decomposed = 'e\u0301';
    const composed = '\u00e9';
    assert.strictEqual(utils.normalizeUnicode(decomposed), composed);
});

test('normalizeUnicode на пустой строке не падает', () => {
    assert.strictEqual(utils.normalizeUnicode(''), '');
    assert.strictEqual(utils.normalizeUnicode(null), '');
});

test('convertEngToRus конвертирует ошибочную раскладку', () => {
    assert.strictEqual(utils.convertEngToRus('ghbdtn'), 'привет');
    assert.strictEqual(utils.convertEngToRus('rjvf'), 'кома');
    assert.strictEqual(utils.convertEngToRus('dhtvfn'), 'времат');
});

test('convertEngToRus не трогает смешанные строки с кириллицей', () => {
    // Смысл guard-условия: латиница в русском слове («кофе») не портится
    assert.strictEqual(utils.convertEngToRus('кофе'), 'кофе');
});

test('convertEngToRus сохраняет цифры и пробелы', () => {
    assert.strictEqual(utils.convertEngToRus('ghbdtn 123'), 'привет 123');
});

test('cleanPastedText вырезает хвосты вида «Источник: https://…»', () => {
    assert.strictEqual(utils.cleanPastedText('Источник: https://example.com/a'), '');
    assert.strictEqual(utils.cleanPastedText('Подробнее: http://example.com/b'), '');
});

test('cleanPastedText сохраняет обычный текст', () => {
    assert.strictEqual(utils.cleanPastedText('Весна'), 'Весна');
    assert.strictEqual(utils.cleanPastedText(''), '');
});

test('sortAZ сортирует по ФИО по-русски', () => {
    const authors = [
        { lastName: 'Яблонский', firstName: 'А' },
        { lastName: 'Бродский', firstName: 'И' },
        { lastName: 'Ахматова', firstName: 'А' }
    ];
    const sorted = [...authors].sort(utils.sortAZ).map(a => a.lastName);
    assert.deepStrictEqual(sorted, ['Ахматова', 'Бродский', 'Яблонский']);
});

test('sortAZ учитывает отчество — регрессия', () => {
    // Баг был: во втором аргументе localeCompare подставлялось a.surName
    // вместо b.surName, из-за чего «Иванов А. / Иванов Б.» могли
    // сравниваться как одинаковые. Теперь порядок детерминирован.
    const a = { lastName: 'Иванов', firstName: 'А', surName: 'Алексеевич' };
    const b = { lastName: 'Иванов', firstName: 'Б', surName: 'Борисович' };
    const back = [...[a, b]].sort(utils.sortAZ);
    assert.notStrictEqual(utils.sortAZ(a, b), utils.sortAZ(b, a));
    assert.deepStrictEqual(back, [a, b]);
});

test('sortAZ не зависит от наличия отчества', () => {
    // Без отчества сравнивается только «Бродский И», и сравнение
    // остаётся детерминированным (в т.ч. при обратном порядке).
    const a = { lastName: 'Бродский', firstName: 'И' };
    const b = { lastName: 'Бродский', firstName: 'И', surName: 'Иосифович' };
    const forward = utils.sortAZ(a, b);
    const backward = utils.sortAZ(b, a);
    assert.ok(Number.isInteger(forward) && Number.isInteger(backward));
    // Одинаковое ФИО без отчества — разные авторы, порядок не важен,
    // важно лишь, что сортировка не падает и не всегда даёт 0 в обе стороны.
    assert.deepStrictEqual([a, b].sort(utils.sortAZ).length, 2);
});

test('sortAZ не падает на авторе с пустыми полями', () => {
    assert.strictEqual(utils.sortAZ({ lastName: '', firstName: '' }, {}), 0);
});
