/**
 * Класс детектора дубликатов
 */
class DuplicateDetector {
    constructor(options = {}) {
        this.threshold = options.threshold || 0.90; // Порог совпадения 90%
    }

    /**
     * Очистка текста от мусора, знаков препинания, ударений
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

    calculateSimilarity(str1, str2) {
        const s1 = this.normalizeText(str1);
        const s2 = this.normalizeText(str2);

        if (s1 === s2) return 1.0;
        if (!s1 || !s2) return 0.0;

        const maxLength = Math.max(s1.length, s2.length);
        const minLength = Math.min(s1.length, s2.length);

        if (minLength / maxLength < (this.threshold - 0.15)) return 0.0;

        const distance = this._levenshteinDistance(s1, s2);
        return 1 - (distance / maxLength);
    }

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
            // чтобы он перерисовал ProgressBar и обновляем процент
            const currentPercent = Math.round((processedComparisons / totalComparisons) * 100);
            onProgress(currentPercent);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return duplicates;
    }

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
                            <div class="fw-bold text-truncate">${item.authorA.name}</div>
                            <small class="posts-count-badge">Стихов: ${item.authorA.postsCount}</small>
                        </div>
                        <div class="col-2 text-center text-muted">
                            <i class="bi bi-arrow-left-right"></i>
                        </div>
                        <div class="col-5 ps-2">
                            <div class="fw-bold text-truncate">${item.authorB.name}</div>
                            <small class="posts-count-badge">Стихов: ${item.authorB.postsCount}</small>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        }

        // 2. Отрисовка постов
        if (results.postDuplicates.length === 0) {
            postListEl.innerHTML = `<div class="alert alert-success m-0">Дубликатов стихотворений не найдено.</div>`;
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
                            <div class="fw-bold text-truncate">${item.postA.title}</div>
                            <h6 class="author-name mb-0 text-truncate">${item.postA.authorName}</h6>
                            <div class="bg-light p-2 rounded text-muted small" style="max-height: 80px; overflow-y: auto; white-space: pre-wrap;">${item.postA.content.substring(0, 150)}...</div>
                        </div>
                        <div class="col-6 ps-2">
                            <div class="fw-bold text-truncate">${item.postB.title}</div>
                            <h6 class="author-name mb-0 text-truncate">${item.postB.authorName}</h6>
                            <div class="bg-light p-2 rounded text-muted small" style="max-height: 80px; overflow-y: auto; white-space: pre-wrap;">${item.postB.content.substring(0, 150)}...</div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        }
    }
}