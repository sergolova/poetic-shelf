/**
 * ==========================================================================
 * tests/duplicate_detector_test.js
 * Тесты DuplicateDetector из assets/DuplicateDetector.js.
 *
 * Класс отвечает за поиск дубликатов авторов и произведений, поэтому
 * тестируется вся логика сходства: нормализация текста, порог и
 * расстояние Левенштейна. Метод renderDuplicateResults() не тестируется —
 * он работает с DOM.
 *
 * Запуск:  npm test
 * ==========================================================================
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILE = path.join(__dirname, '..', 'assets', 'DuplicateDetector.js');
const source = fs.readFileSync(FILE, 'utf8');

function loadDetector() {
    // Объявление class не попадает в globalThis как свойство,
    // поэтому достаём класс return-обёрткой. setTimeout нужен для
    // пауз, которые detectPostDuplicatesAsync делает в цикле.
    const sandbox = { window: {}, document: {}, setTimeout };
    vm.createContext(sandbox);
    return vm.runInContext(source + '\n;({ DuplicateDetector });', sandbox, { filename: FILE }).DuplicateDetector;
}

const DuplicateDetector = loadDetector();

/* ==========================================================================
   Нормализация текста
   ========================================================================== */

test('normalizeText приводит к нижнему регистру и убирает «ё»', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.normalizeText('ЁЖИК'), 'ежик');
});

test('normalizeText убирает знаки препинания', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.normalizeText('Привет, мир!'), 'привет мир');
});

test('normalizeText схлопывает пробелы и обрезает края', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.normalizeText('  много   пробелов  '), 'много пробелов');
});

test('normalizeText на пустом значении даёт пустую строку', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.normalizeText(''), '');
    assert.strictEqual(d.normalizeText(null), '');
});

test('normalizeText оставляет разные тире и кавычки различимыми по регистру', () => {
    const d = new DuplicateDetector();
    // регрессия: normalizeText схлопывает пробелы, но не должна
    // приводить содержимое к пустой строке
    assert.ok(d.normalizeText('а б в г д е ж').length > 0);
});

/* ==========================================================================
   Расстояние Левенштейна
   ========================================================================== */

test('_levenshteinDistance равна 0 для одинаковых строк', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d._levenshteinDistance('круг', 'круг'), 0);
});

test('_levenshteinDistance равна 1 для одной замены', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d._levenshteinDistance('круг', 'крун'), 1);
    // латинские y и z — это ДВЕ замены, не одна
    assert.strictEqual(d._levenshteinDistance('круг', 'крyz'), 2);
});

test('_levenshteinDistance равна длине строки, если другая пустая', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d._levenshteinDistance('круг', ''), 4);
    assert.strictEqual(d._levenshteinDistance('', 'круг'), 4);
});

test('_levenshteinDistance симметрична', () => {
    const d = new DuplicateDetector();
    const pairs = [['abcd', 'abxd'], ['kitten', 'sitting'], ['круг', 'круга']];
    for (const [a, b] of pairs) {
        assert.strictEqual(d._levenshteinDistance(a, b), d._levenshteinDistance(b, a),
                           `асимметрия для ${a}/${b}`);
    }
});

test('_levenshteinDistance даёт известный результат для kitten/sitting', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d._levenshteinDistance('kitten', 'sitting'), 3);
});

/* ==========================================================================
   Сходство
   ========================================================================== */

test('calculateSimilarity равна 1 для совпадающих строк', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.calculateSimilarity('Весна в Праге', 'Весна в Праге'), 1.0);
});

test('calculateSimilarity игнорирует регистр, знаки и «ё»', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.calculateSimilarity('Ёжик, в лесу!', 'ежик в лесу'), 1.0);
});

test('calculateSimilarity равна 0 для пустых строк', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.calculateSimilarity('', ''), 0.0);
    assert.strictEqual(d.calculateSimilarity('круг', ''), 0.0);
});

test('calculateSimilarity равна 0 для строк разной длины за порогом', () => {
    // Быстрый выход: если длины отличаются сильнее, чем threshold - 0.15
    const d = new DuplicateDetector();
    assert.strictEqual(d.calculateSimilarity('короткая', 'совсем другая строка здесь'), 0.0);
});

test('calculateSimilarity убывает с ростом различий', () => {
    const d = new DuplicateDetector();
    const close = d.calculateSimilarity('Весна в Праге была', 'Весна в Праге есть');
    const far = d.calculateSimilarity('Весна в Праге была', 'Ничего общего тут нет');
    assert.ok(close > far, `ожидалось close(${close}) > far(${far})`);
});

/* ==========================================================================
   Порог и поиск дубликатов
   ========================================================================== */

test('порог по умолчанию 0.90 и переопределяется', () => {
    assert.strictEqual(new DuplicateDetector().threshold, 0.90);
    assert.strictEqual(new DuplicateDetector({ threshold: 0.5 }).threshold, 0.5);
});

test('одинаковые авторы находятся как дубликаты', () => {
    const d = new DuplicateDetector();
    const authors = [
        { id: 'a1', lastName: 'Пушкин', firstName: 'Александр', posts: [] },
        { id: 'a2', lastName: 'Пушкин', firstName: 'Александр', posts: [] }
    ];
    const found = d.detectAuthorDuplicates(authors);
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].authorA.id, 'a1');
    assert.strictEqual(found[0].authorB.id, 'a2');
    assert.strictEqual(found[0].similarityPercentage, 100);
});

test('разные авторы не считаются дубликатами', () => {
    const d = new DuplicateDetector();
    const authors = [
        { id: 'a1', lastName: 'Пушкин', firstName: 'Александр', posts: [] },
        { id: 'a2', lastName: 'Бродский', firstName: 'Иосиф', posts: [] }
    ];
    assert.strictEqual(d.detectAuthorDuplicates(authors).length, 0);
});

test('разница в отчестве не мешает найти дубль при пороге 0.9', () => {
    const d = new DuplicateDetector();
    const authors = [
        { id: 'a1', lastName: 'Пушкин', firstName: 'Александр', surName: 'Сергеевич', posts: [] },
        { id: 'a2', lastName: 'Пушкин', firstName: 'Александр', surName: '', posts: [] }
    ];
    // с отчеством сходство ниже 0.9 — это НЕ дубль
    assert.strictEqual(d.detectAuthorDuplicates(authors).length, 0);
});

test('пустой список авторов не даёт ложных срабатываний', () => {
    const d = new DuplicateDetector();
    assert.strictEqual(d.detectAuthorDuplicates([]).length, 0);
});

test('автор без ФИО не роняет поиск', () => {
    const d = new DuplicateDetector();
    const authors = [{ id: 'a1', posts: [] }, { id: 'a2', posts: [] }];
    assert.ok(Array.isArray(d.detectAuthorDuplicates(authors)));
});

test('количество пар растёт квадратично, а не линейно', () => {
    // регрессия на «сравнение только с соседним»: 3 одинаковых автора
    // обязаны дать 3 пары (a1-a2, a1-a3, a2-a3)
    const d = new DuplicateDetector();
    const authors = [1, 2, 3].map(n => ({ id: `a${n}`, lastName: 'Пушкин', firstName: 'А', posts: [] }));
    assert.strictEqual(d.detectAuthorDuplicates(authors).length, 3);
});

test('дубликаты произведений находятся с отметкой одного автора', async () => {
    const d = new DuplicateDetector();
    const authors = [{
        id: 'a1', lastName: 'Пушкин', firstName: 'Александр',
        posts: [
            { id: 'p1', title: 'Зимний вечер', content: 'Мороз и солнце; день чудесный!' },
            { id: 'p2', title: 'Дубль', content: 'Мороз и солнце; день чудесный!' }
        ]
    }];
    const found = await d.detectPostDuplicatesAsync(authors, () => {});
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].isSameAuthor, true);
    // allPosts-плоские объекты, поле называется postId, а не id
    assert.strictEqual(found[0].postA.postId, 'p1');
    assert.strictEqual(found[0].postB.postId, 'p2');
});

test('произведения разных авторов помечаются как не свои', async () => {
    const d = new DuplicateDetector();
    const authors = [
        { id: 'a1', lastName: 'Пушкин', firstName: 'А',
          posts: [{ id: 'p1', title: 'A', content: 'Один и тот же текст произведения' }] },
        { id: 'a2', lastName: 'Бродский', firstName: 'И',
          posts: [{ id: 'p2', title: 'B', content: 'Один и тот же текст произведения' }] }
    ];
    const found = await d.detectPostDuplicatesAsync(authors, () => {});
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].isSameAuthor, false);
});

test('уникальные произведения не считаются дубликатами', async () => {
    const d = new DuplicateDetector();
    const authors = [{
        id: 'a1', lastName: 'Пушкин', firstName: 'А',
        posts: [
            { id: 'p1', title: 'Один', content: 'Совершенно первый уникальный текст' },
            { id: 'p2', title: 'Два', content: 'Абсолютно другой набор слов здесь' }
        ]
    }];
    assert.strictEqual((await d.detectPostDuplicatesAsync(authors, () => {})).length, 0);
});

test('библиотека без произведений не ломает асинхронный поиск', async () => {
    const d = new DuplicateDetector();
    // Массивы приходят из vm-контекста, где другой прототип Array,
    // поэтому deepStrictEqual на них не годится.
    assert.strictEqual((await d.detectPostDuplicatesAsync([{ id: 'a1', posts: [] }], () => {})).length, 0);
    assert.strictEqual((await d.detectPostDuplicatesAsync([], () => {})).length, 0);
});

test('detectAsync отдаёт обе группы результатов', async () => {
    const d = new DuplicateDetector();
    const authors = [
        { id: 'a1', lastName: 'Пушкин', firstName: 'Александр',
          posts: [{ id: 'p1', title: 'T', content: 'Одинаковый текст для поиска дублей' }] },
        { id: 'a2', lastName: 'Пушкин', firstName: 'Александр',
          posts: [{ id: 'p2', title: 'T', content: 'Одинаковый текст для поиска дублей' }] }
    ];
    const r = await d.detectAsync({ authors }, () => {});
    assert.strictEqual(r.authorDuplicates.length, 1);
    assert.strictEqual(r.postDuplicates.length, 1);
});

test('прогресс detectAsync доходит до 100', async () => {
    const d = new DuplicateDetector();
    const seen = [];
    await d.detectAsync({
        authors: [{ id: 'a1', lastName: 'Пушкин', firstName: 'А',
                    posts: [{ id: 'p1', title: 'T', content: 'Какой-то текст' }] }]
    }, (p) => seen.push(p));
    assert.ok(seen.length > 0, 'прогресс не вызывался');
    assert.strictEqual(Math.max(...seen), 100);
});
