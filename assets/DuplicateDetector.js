/**
 * ==========================================================================
 * assets/DuplicateDetector.js
 * Класс детектора дубликатов (DuplicateDetector).
 *
 * Ищет два вида дубликатов:
 *   - авторы с почти одинаковым ФИО (порог по умолчанию 0.90);
 *   - произведения с почти одинаковым текстом (в т.ч. внутри одного
 *     автора — частый случай при импорте библиотеки).
 *
 * Сравнение строк — расстояние Левенштейна по нормализованному тексту.
 * Рендер результатов работает с DOM и требует глобальной escapeHtml()
 * из assets/utilities.js (вызывается на этапе работы, не загрузки,
 * поэтому порядок подключения файлов на это не влияет).
 * ==========================================================================
 */
class DuplicateDetector {
    /**
     * @param {Object} [options] - Настройки детектора.
     * @param {number} [options.threshold=0.90] - Порог сходства 0..1,
     *        при котором пара считается дубликатом.
     */
    constructor(options = {}) {
        this.threshold = options.threshold || 0.90; // Порог совпадения 90%
    }



    /**
     * Очистка текста от мусора, знаков препинания, ударений.
     * Приводит к нижнему регистру, убирает «ё» и комбинирующие диакритики.
     * @param {string} str - Исходная строка.
     * @returns {string} Нормализованная строка ('' для пустого входа).
     */
    normalizeText(str) {
        if (!str) return '';
        return str
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\sа-яа-щьюяїієґ]/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Считает сходство двух строк в диапазоне 0..1.
     * Пустые строки всегда дают 0: иначе два произведения без текста
     * выглядели бы как дубликаты друг друга.
     * @param {string} str1 - Первая строка.
     * @param {string} str2 - Вторая строка.
     * @returns {number} Сходство 0..1.
     */
    calculateSimilarity(str1, str2) {
        const s1 = this.normalizeText(str1);
        const s2 = this.normalizeText(str2);

        // Пустые тексты проверяем ДО сравнения на равенство, иначе два
        // произведения без текста дают сходство 1.0 («100 %») и
        // показываются в отчёте как дубликаты друг друга.
        if (!s1 || !s2) return 0.0;
        if (s1 === s2) return 1.0;

        const maxLength = Math.max(s1.length, s2.length);
        const minLength = Math.min(s1.length, s2.length);

        // Дешёвый выход: при большой разнице длин точного сходства
        // выше порога уже не получить, Левенштейн можно не считать.
        if (minLength / maxLength < (this.threshold - 0.15)) return 0.0;

        const distance = this._levenshteinDistance(s1, s2);
        return 1 - (distance / maxLength);
    }

    /**
     * Расстояние Левенштейна между двумя строками (число правок:
     * вставка, удаление, замена). Считается в две строки по памяти.
     * @param {string} a - Первая строка.
     * @param {string} b - Вторая строка.
     * @returns {number} Расстояние (0 для равных строк).
     */
    _levenshteinDistance(a, b) {
        if (a === b) return 0;
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        let row0 = new Array(a.length + 1);
        let row1 = new Array(a.length + 1);

        for (let i = 0; i <= a.length; i++) row0[i] = i;

        for (let i = 0; i < b.length; i++) {
            row1[0] = i + 1;
            for (let j = 0; j < a.length; j++) {
                const cost = a[j] === b[i] ? 0 : 1;
                row1[j + 1] = Math.min(
                    row1[j] + 1,
                    row0[j + 1] + 1,
                    row0[j] + cost
                );
            }
            for (let j = 0; j <= a.length; j++) row0[j] = row1[j];
        }

        return row1[a.length];
    }

    /**
     * Запускает оба поиска и сообщает прогресс.
     * @param {Object} data - Данные библиотеки ({ authors: [...] }).
     * @param {function(number): void} [onProgress] - Колбэк прогресса 0..100.
     * @returns {Promise<{authorDuplicates: Array, postDuplicates: Array}>}
     */
    async detectAsync(data, onProgress = () => {}) {
        const authors = data?.authors || [];

        // 1. Поиск дубликатов авторов (занимает первые 20% прогресса)
        onProgress(5);
        const authorDuplicates = this.detectAuthorDuplicates(authors);
        onProgress(20);

        // 2. Поиск дубликатов постов (занимает остальные 80% прогресса)
        const postDuplicates = await this.detectPostDuplicatesAsync(authors, (postsPercent) => {
            // Масштабируем 0..100% постов в диапазон 20..100% общего прогресса
            const totalPercent = Math.round(20 + (postsPercent * 0.8));
            onProgress(totalPercent);
        });

        return { authorDuplicates, postDuplicates };
    }

    /**
     * Ищет авторов с почти одинаковым ФИО. Сравнивает все пары
     * (не только соседние), поэтому три одинаковых автора дают три пары.
     * @param {Array<Object>} authors - Список авторов.
     * @returns {Array<{similarityPercentage: number, authorA: Object, authorB: Object}>}
     */
    detectAuthorDuplicates(authors) {
        const duplicates = [];
        for (let i = 0; i < authors.length; i++) {
            for (let j = i + 1; j < authors.length; j++) {
                const a1 = authors[i];
                const a2 = authors[j];
                const name1 = `${a1.lastName || ''} ${a1.firstName || ''} ${a1.surName || ''}`.trim();
                const name2 = `${a2.lastName || ''} ${a2.firstName || ''} ${a2.surName || ''}`.trim();

                const similarity = this.calculateSimilarity(name1, name2);
                if (similarity >= this.threshold) {
                    duplicates.push({
                        similarityPercentage: Math.round(similarity * 100),
                        authorA: { id: a1.id, name: name1, postsCount: a1.posts?.length || 0 },
                        authorB: { id: a2.id, name: name2, postsCount: a2.posts?.length || 0 }
                    });
                }
            }
        }
        return duplicates;
    }

    /**
     * Ищет произведения с почти одинаковым текстом — в том числе
     * внутри одного автора. Асинхронная, потому что каждые N сравнений
     * уступает поток браузеру, чтобы progress-бар успевал перерисоваться.
     * @param {Array<Object>} authors - Список авторов с их posts.
     * @param {function(number): void} onProgress - Колбэк прогресса 0..100.
     * @returns {Promise<Array<Object>>} Найденные пары дубликатов.
     */
    async detectPostDuplicatesAsync(authors, onProgress) {
        const allPosts = [];
        authors.forEach(author => {
            const fullName = `${author.lastName || ''} ${author.firstName || ''}`.trim();
            (author.posts || []).forEach(post => {
                allPosts.push({
                    postId: post.id,
                    title: post.title || 'Без названия',
                    content: post.content || '',
                    authorId: author.id,
                    authorName: fullName
                });
            });
        });

        const duplicates = [];
        const totalPosts = allPosts.length;
        if (totalPosts === 0) return duplicates;

        // Полное число сравнений по формуле N * (N - 1) / 2
        const totalComparisons = (totalPosts * (totalPosts - 1)) / 2;
        let processedComparisons = 0;

        for (let i = 0; i < totalPosts; i++) {
            for (let j = i + 1; j < totalPosts; j++) {
                const p1 = allPosts[i];
                const p2 = allPosts[j];

                const similarity = this.calculateSimilarity(p1.content, p2.content);
                if (similarity >= this.threshold) {
                    duplicates.push({
                        similarityPercentage: Math.round(similarity * 100),
                        postA: p1,
                        postB: p2,
                        isSameAuthor: p1.authorId === p2.authorId
                    });
                }

                processedComparisons++;
            }

            // Каждую итерацию по первому циклу даем браузеру паузу (0 мс),
            // чтобы он перерисовал ProgressBar и обновим процент.
            // При одном произведении сравнений нет (0/0), и без этой
            // проверки прогрессбар получал NaN% и зависал.
            const currentPercent = totalComparisons > 0
                ? Math.round((processedComparisons / totalComparisons) * 100)
                : 100;
            onProgress(currentPercent);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return duplicates;
    }

    /**
     * Рендерит результаты поиска в модальное окно.
     * Все данные пользователя экранируются: они попадают в innerHTML.
     * @param {{authorDuplicates: Array, postDuplicates: Array}} results -
     *        Результат detectAsync().
     */
    renderDuplicateResults(results) {
        const authorListEl = document.getElementById('authorDuplicatesList');
        const postListEl = document.getElementById('postDuplicatesList');

        document.getElementById('dupAuthorsCount').textContent = results.authorDuplicates.length;
        document.getElementById('dupPostsCount').textContent = results.postDuplicates.length;

        // 1. Отрисовка авторов
        if (results.authorDuplicates.length === 0) {
            authorListEl.innerHTML = `<div class="alert alert-success m-0">Дубликатов авторов не найдено.</div>`;
        } else {
            authorListEl.innerHTML = results.authorDuplicates.map(item => `
            <div class="card shadow-sm border">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-warning text-dark">Сходство: ${item.similarityPercentage}%</span>
                    </div>
                    <div class="row align-items-center g-2">
                        <div class="col-5 border-end pe-2">
                            <div class="fw-bold text-truncate">${escapeHtml(item.authorA.name)}</div>
                            <small class="posts-count-badge">Произведений: ${item.authorA.postsCount}</small>
                        </div>
                        <div class="col-2 text-center text-muted">
                            <i class="bi bi-arrow-left-right"></i>
                        </div>
                        <div class="col-5 ps-2">
                            <div class="fw-bold text-truncate">${escapeHtml(item.authorB.name)}</div>
                            <small class="posts-count-badge">Произведений: ${item.authorB.postsCount}</small>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        }

        // 2. Отрисовка постов
        if (results.postDuplicates.length === 0) {
            postListEl.innerHTML = `<div class="alert alert-success m-0">Дубликатов произведений не найдено.</div>`;
        } else {
            postListEl.innerHTML = results.postDuplicates.map(item => `
            <div class="card shadow-sm border">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-danger">Сходство: ${item.similarityPercentage}%</span>
                        <small class="badge ${item.isSameAuthor ? 'bg-info text-dark' : 'bg-secondary'}">
                            ${item.isSameAuthor ? 'Один автор' : 'Разные авторы'}
                        </small>
                    </div>
                    <div class="row g-2">
                        <div class="col-6 border-end pe-2">
                            <div class="fw-bold text-truncate">${escapeHtml(item.postA.title)}</div>
                            <h6 class="author-name mb-0 text-truncate">${escapeHtml(item.postA.authorName)}</h6>
                            <div class="bg-light p-2 rounded text-muted small" style="max-height: 80px; overflow-y: auto; white-space: pre-wrap;">${escapeHtml(item.postA.content.substring(0, 150))}...</div>
                        </div>
                        <div class="col-6 ps-2">
                            <div class="fw-bold text-truncate">${escapeHtml(item.postB.title)}</div>
                            <h6 class="author-name mb-0 text-truncate">${escapeHtml(item.postB.authorName)}</h6>
                            <div class="bg-light p-2 rounded text-muted small" style="max-height: 80px; overflow-y: auto; white-space: pre-wrap;">${escapeHtml(item.postB.content.substring(0, 150))}...</div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        }
    }
}
