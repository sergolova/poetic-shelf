/**
 * ==========================================================================
 * tests/translation_test.js
 * Тесты detectTranslationPattern() из assets/ui.js.
 *
 * Это функция, которая решает, показывать ли произведение в две колонки
 * «оригинал | перевод». Ошибка в ней не бросает исключение — она молча
 * разворачивает русское произведение в две колонки или, наоборот,
 * склеивает перевод в одну. Поэтому на каждый известный ложный случай
 * здесь зафиксировано отдельное утверждение.
 *
 * Запуск:  npm test
 * ==========================================================================
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UI_PATH = path.join(__dirname, '..', 'assets', 'ui.js');
const source = fs.readFileSync(UI_PATH, 'utf8');

/**
 * Достаёт detectTranslationPattern вместе с её константами порогов.
 * В ui.js функция не экспортируется и опирается на модульные константы,
 * поэтому берём из файла ровно тот блок, который к ней относится.
 */
function loadDetect() {
    const lines = source.split('\n');
    const constsStart = lines.findIndex(l => l.startsWith('const TRANSLATION_MIN_LINE_LETTERS'));
    const fnStart = lines.findIndex(l => l.startsWith('function detectTranslationPattern'));
    if (constsStart < 0 || fnStart < 0) {
        throw new Error('В ui.js не найден блок распознавания перевода');
    }
    let fnEnd = -1;
    for (let i = fnStart; i < lines.length; i++) {
        if (lines[i] === '}') { fnEnd = i; break; }
    }
    if (fnEnd < 0) throw new Error('Не найден конец detectTranslationPattern');

    // Объявления const/function в vm не попадают в globalThis как
    // свойства, поэтому функции достаются через return-обёртку.
    const code = lines.slice(constsStart, fnEnd + 1).join('\n');
    const wrapped = code + '\n;({ detect: detectTranslationPattern });';
    const sandbox = { window: {}, document: {} };
    vm.createContext(sandbox);
    return vm.runInContext(wrapped, sandbox, { filename: UI_PATH }).detect;
}

const detect = loadDetect();

/* ==========================================================================
   Настоящие переводы
   ========================================================================== */

test('распознаёт чередующиеся пары оригинал/перевод', () => {
    const text = [
        'I walked alone the street of stone',
        'Я шёл один по улице из камня',
        'And the night was cold and long',
        'А ночь была холодна и долга'
    ].join('\n');
    assert.strictEqual(detect(text).isTranslation, true);
});

test('уверенность для настоящего перевода равна 1', () => {
    const text = [
        'Paper flowers on the table',
        'Бумажные цветы на столе',
        'Fade away before the dawn',
        'Увянут до рассвета'
    ].join('\n');
    assert.strictEqual(detect(text).confidence, 1);
});

test('распознаёт перевод независимо от направления: перевод -> оригинал', () => {
    const text = 'Бумажные цветы на столе\nPaper flowers on the table';
    assert.strictEqual(detect(text).isTranslation, true);
});

test('распознаёт перевод независимо от направления: оригинал -> перевод', () => {
    const text = 'Paper flowers on the table\nБумажные цветы на столе';
    assert.strictEqual(detect(text).isTranslation, true);
});

test('украинская кириллица распознаётся как перевод', () => {
    const text = 'The night is falling down\nНіч падає на наші дні';
    assert.strictEqual(detect(text).isTranslation, true);
});

/* ==========================================================================
   Ложные срабатывания, найденные на реальной библиотеке
   ========================================================================== */

test('латинская цитата внутри русского произведения — не перевод', () => {
    // «Незнакомка» Блока: «In vino veritas!» кричат. — 13 латинских
    // букв против 6 кириллических, строка выглядит латинской, но
    // кириллица в ней есть, и пара не должна собираться.
    const text = [
        'Кто там? кричат.',
        '«In vino veritas!» кричат.',
        'Он велел идти.'
    ].join('\n');
    assert.strictEqual(detect(text).isTranslation, false);
});

test('римские цифры в переносках станс не считаются оригиналом', () => {
    // «Ответ Онегина»: XIII/XIV/XV/XVI — все 4 буквы латинские,
    // доля 100%, старый порог доминирования их не отсекал, и
    // followRatio доходил до 1.0 при 11% покрытия текста.
    const text = [
        'Письмо таковое есть',
        'XIII',
        'Ещё одна строка',
        'XIV',
        'И снова строка',
        'XV',
        'Ещё строка',
        'XVI',
        'И опять строка'
    ].join('\n');
    assert.strictEqual(detect(text).isTranslation, false);
});

test('строка с латинской вставкой посреди русской — русская', () => {
    // Блок, «Когда ты загнан и забит»: 13 кириллических против
    // 12 латинских. Строка не двуязычная — это русский текст
    // с латинской цитатой.
    const text = [
        'Жизнь — безмерно боле,',
        'Чем quantum satis Бранда воли,',
        'А мир — прекрасен, как всегда.'
    ].join('\n');
    const d = detect(text);
    assert.strictEqual(d.isTranslation, false);
    assert.strictEqual(d.lineTypes[1], 'translate');
});

test('полностью русское произведение не является переводом', () => {
    const text = [
        'Просто текст',
        'Без перевода тут вовсе',
        'И ни латинских слов'
    ].join('\n');
    assert.strictEqual(detect(text).isTranslation, false);
});

/* ==========================================================================
   Структурные границы
   ========================================================================== */

test('одиночная латинская строка не создаёт перевод', () => {
    const text = [
        'Ночная строка русского текста',
        'single',
        'Ещё строка русского текста',
        'Ещё одна строка русского текста'
    ].join('\n');
    assert.strictEqual(detect(text).isTranslation, false);
});

test('нужны минимум две пары — одна пара не считается', () => {
    const text = [
        'One line in latin script here',
        'Одна строка в кириллице тут',
        'И снова русская строка подряд',
        'И ещё одна русская строка'
    ].join('\n');
    // ровно одна пара из четырёх строк покрывает 50%, но пар меньше двух
    const d = detect(text);
    assert.strictEqual(d.isTranslation, false);
});

test('пустой текст не считается переводом', () => {
    assert.strictEqual(detect('').isTranslation, false);
});

test('одна строка не считается переводом', () => {
    assert.strictEqual(detect('Just a single line of text').isTranslation, false);
});

test('короткие строки в 4+ непустых не собирают пары', () => {
    // строки короче 5 букв получают тип skip и не участвуют в счётчиках
    const text = ['OK', 'ok', 'no', 'da'].join('\n');
    const d = detect(text);
    assert.ok(!d.isTranslation);
    // Массив приходит из vm-контекста, поэтому сравниваем через
    // Array.from, а не deepStrictEqual: у него другой прототип.
    assert.deepStrictEqual(Array.from(d.lineTypes), ['skip', 'skip', 'skip', 'skip']);
});

test('пустые строки между парами не мешают', () => {
    const text = [
        'First line in latin script',
        '',
        'Первая строка кириллицей тут',
        '',
        'Second line in latin script',
        '',
        'Вторая строка кириллицей тут'
    ].join('\n');
    assert.strictEqual(detect(text).isTranslation, true);
});

/* ==========================================================================
   Классификация строк
   ========================================================================== */

test('пустая строка классифицируется как empty', () => {
    assert.strictEqual(detect('строка\n\nстрока').lineTypes[1], 'empty');
});

test('строка короче 5 букв классифицируется как skip', () => {
    // Порог MIN_LINE_LETTERS отсекает римские цифры и отдельные
    // короткие вставки ДО определения доминирующего алфавита.
    const d = detect('Первая строка русского текста\nXIII\nВторая строка тут');
    assert.strictEqual(d.lineTypes[1], 'skip');
});

test('строка из цифр и пунктуации пропускается, а не рвёт текст', () => {
    // Букв нет вообще — порог букв срабатывает раньше, чем 'mixed'.
    const d = detect('Первая строка текста\n--- 123 ---\nВторая строка текста');
    assert.strictEqual(d.lineTypes[1], 'skip');
});

test('lineTypes совпадает по длине с разбиением текста', () => {
    const text = 'One line here\nВторая строка\n\nтретья строка';
    assert.strictEqual(detect(text).lineTypes.length, text.split('\n').length);
});

test('confidence всегда в диапазоне 0..1', () => {
    const samples = [
        'I walked alone the street\nЯ шёл один по улице',
        'Просто русский текст\nИ ещё строка\nИ третья строка',
        'XIII\nXIV\nСтрока русская тут\nИ ещё строка тут'
    ];
    for (const s of samples) {
        const { confidence } = detect(s);
        assert.ok(confidence >= 0 && confidence <= 1, `confidence вне диапазона: ${confidence}`);
    }
});
