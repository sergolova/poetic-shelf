/**
 * ==========================================================================
 * assets/store.js
 * Хранилище данных приложения (PoemStore).
 *
 * Также содержит модульные хелперы поиска isAuthorMatch / isPostMatch,
 * т.к. они являются функциями фильтрации данных модели и используются
 * как внутри PoemStore.getAuthors(), так и в PoemUI при рендере.
 * ==========================================================================
 */

/* ==========================================================================
   Хелперы поиска по данным модели
   (используются PoemStore.getAuthors, PoemUI.renderAuthorsList,
    PoemUI.renderAuthorSearchDropdown, PoemApp.refresh)
   ========================================================================== */

/**
 * Проверяет, соответствует ли ФИО автора поисковому запросу.
 * @param {Object} author - Объект автора.
 * @param {string} q - Поисковый запрос (нижний регистр).
 * @returns {boolean}
 */
function isAuthorMatch(author, q) {
    const fullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.toLowerCase();
    return fullName.includes(q);
}

/**
 * Проверяет, соответствуют ли поля произведения поисковому запросу.
 * @param {Object} post - Объект произведения.
 * @param {string} q - Поисковый запрос (нижний регистр).
 * @returns {boolean}
 */
function isPostMatch(post, q) {
    const title       = (post.title       || '').toLowerCase();
    const content     = (post.content     || '').toLowerCase();
    const contentHtml = (post.contentHtml || '').toLowerCase();
    const note        = (post.note        || '').toLowerCase();
    return title.includes(q) || content.includes(q) || contentHtml.includes(q) || note.includes(q);
}


/* ==========================================================================
   Класс PoemStore
   ========================================================================== */

class PoemStore {

    /* ==========================================================================
       1. Конструктор и Инициализация / Constructor & Init
       ========================================================================== */

    constructor() {
        this.data = { authors: [] };
        this.selectedAuthorId = null;
        this.selectedPostId = null;
        this.authorSortMode = SORT_AUTHORS.NONE;  // см. SORT_AUTHORS в storage-keys.js
        this.lastViewed = {};           // { authorId: timestamp }
        this.postBookmarks = {};        // { postId: true }
    }

    /**
     * Инициализирует хранилище из localStorage.
     */
    async init() {
        this.authorSortMode = localStorage.getItem(STORAGE_KEYS.AUTHOR_SORT) || SORT_AUTHORS.NONE;

        try {
            const v = JSON.parse(localStorage.getItem(STORAGE_KEYS.LAST_VIEWED));
            this.lastViewed = (v && typeof v === 'object') ? v : {};
        } catch { this.lastViewed = {}; }

        try {
            const v = JSON.parse(localStorage.getItem(STORAGE_KEYS.POST_BOOKMARKS));
            this.postBookmarks = (v && typeof v === 'object') ? v : {};
        } catch { this.postBookmarks = {}; }

        const local = localStorage.getItem(STORAGE_KEYS.DATA);
        if (local) {
            try {
                const parsed = JSON.parse(local);
                this.data = parsed.data || parsed;
                if (!this.data.authors) this.data.authors = [];
            } catch (e) {
                console.error('Ошибка чтения localStorage:', e);
                await this.loadDefaultJson();
            }
        } else {
            await this.loadDefaultJson();
        }
    }

    /**
     * Загружает данные по умолчанию из data.json.
     *
     * Файла data.json в проекте нет — он необязателен, и его отсутствие
     * это норма (в репозиторий бэкапы не попадают). Проверяем статус
     * ответа явно: иначе при 404 попытались бы разобрать HTML-страницу
     * ошибки как JSON. Ошибка ответа — ожидаемый путь, а не сбой,
     * поэтому в консоль не пишем.
     *
     * @returns {Promise<void>}
     */
    async loadDefaultJson() {
        try {
            const res = await fetch('data.json');
            if (!res.ok) {
                this.data = { authors: [] };
                return;
            }
            this.data = await res.json();
            this.saveData();
        } catch {
            this.data = { authors: [] };
        }
    }


    /* ==========================================================================
       2. Работа с хранилищем и Настройками / Storage & Settings
       ========================================================================== */

    /** Сохраняет данные авторов в localStorage. */
    saveData() {
        const postsCount = (this.data.authors || []).reduce((sum, a) => sum + (a.posts?.length || 0), 0);

        if (!this.data.meta) {
            this.data.meta = {
                appName: 'Поэтическая Полка',
                version: '1.0',
                createdAt: new Date().toISOString()
            };
        }

        this.data.meta.modifiedAt = new Date().toISOString();
        this.data.meta.modifiedBy = 'user';
        this.data.meta.authorsCount = (this.data.authors || []).length;
        this.data.meta.postsCount = postsCount;

        localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify({ data: this.data }));
        this.markAsChanged();
        this.updateExportWarningStatus();
    }

    /** Сохраняет данные + настройки. */
    save() {
        this.saveData();
        this.saveSettings();
    }

    /** Сохраняет пользовательские настройки и состояние просмотров. */
    saveSettings() {
        localStorage.setItem(STORAGE_KEYS.POST_BOOKMARKS, JSON.stringify(this.postBookmarks));
        localStorage.setItem(STORAGE_KEYS.LAST_VIEWED,    JSON.stringify(this.lastViewed));
        localStorage.setItem(STORAGE_KEYS.AUTHOR_SORT,    this.authorSortMode);
    }

    /** Сохраняет ширину сайдбара. */
    saveSidebar(width) {
        localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, width);
    }

    /** Загружает ширину сайдбара. */
    loadSidebar() {
        return parseInt(localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH), 10);
    }

    /** Помечает данные как изменённые. */
    markAsChanged() {
        localStorage.setItem(STORAGE_KEYS.UNSAVED_COUNT, this.getUnsavedChangesCount() + 1);
        localStorage.setItem(STORAGE_KEYS.LAST_CHANGE, Date.now());
        this.updateExportWarningStatus();
    }

    /** Помечает данные как экспортированные (сбрасывает счётчик). */
    markAsExported() {
        localStorage.setItem(STORAGE_KEYS.UNSAVED_COUNT, '0');
        localStorage.setItem(STORAGE_KEYS.LAST_EXPORT, Date.now());
        this.updateExportWarningStatus();
    }

    /** Возвращает true, если есть несохранённые изменения. */
    hasUnsavedChanges() {
        return this.getUnsavedChangesCount() > 0;
    }

    /** Возвращает количество несохранённых изменений. */
    getUnsavedChangesCount() {
        return parseInt(localStorage.getItem(STORAGE_KEYS.UNSAVED_COUNT) || '0', 10) || 0;
    }

    /** Обновляет бейдж несохранённых изменений в шапке. */
    updateExportWarningStatus() {
        const $dataBtn = $('#dataActionsDropdown');
        const count = this.getUnsavedChangesCount();

        if (count > 0) {
            const badgeText = count > 99 ? '99+' : count;
            let $badge = $dataBtn.find('.unsaved-badge');
            if (!$badge.length) {
                $badge = $('<span class="unsaved-badge badge rounded-pill bg-danger position-absolute top-0 start-100 translate-middle"></span>');
                $dataBtn.append($badge);
            }
            $badge.text(badgeText).attr('title', `Несохранённых изменений: ${count}`);
        } else {
            $dataBtn.find('.unsaved-badge').remove();
        }
    }


    /* ==========================================================================
       3. Закладки произведений / Post Bookmarks
       ========================================================================== */

    /**
     * Переключает закладку произведения.
     * @param {string} postId
     * @param {boolean} state
     */
    toggleBookmark(postId, state = true) {
        this.postBookmarks[postId] = state;
        this.saveSettings();
    }

    /** @param {string} postId @returns {boolean} */
    getPostBookmark(postId) {
        return Boolean(this.postBookmarks[postId]);
    }


    /* ==========================================================================
       4. Операции с Авторами / Author CRUD
       ========================================================================== */

    /**
     * Возвращает список авторов с фильтрацией и сортировкой.
     * @param {string} searchQuery
     * @returns {Array<Object>}
     */
    getAuthors(searchQuery = '') {
        let authors = searchQuery.trim()
            ? this.data.authors.filter(author => {
                const q = searchQuery.toLowerCase().trim();
                return isAuthorMatch(author, q) ||
                    (author.posts || []).some(post => isPostMatch(post, q));
            })
            : [...this.data.authors];

        switch (this.authorSortMode) {
            case SORT_AUTHORS.BIRTHDAY:
                authors.sort((a, b) => {
                    if (!a.birthYear && !b.birthYear) return sortAZ(a, b);
                    return (a.birthYear || 9999) - (b.birthYear || 9999) || sortAZ(a, b);
                });
                break;
            case SORT_AUTHORS.POSTS_COUNT:
                authors.sort((a, b) => {
                    const la = a.posts?.length || 0;
                    const lb = b.posts?.length || 0;
                    return lb - la || sortAZ(a, b);
                });
                break;
            case SORT_AUTHORS.ALPHABET:
                authors.sort(sortAZ);
                break;
            case SORT_AUTHORS.RECENT:
                authors.sort((a, b) => {
                    const ta = this.lastViewed[a.id] || 0;
                    const tb = this.lastViewed[b.id] || 0;
                    if (!ta && !tb) return sortAZ(a, b);
                    return tb - ta;
                });
                break;
        }

        return authors;
    }

    /** Помечает автора как просмотренного. */
    markAsViewed(authorId) {
        this.lastViewed[authorId] = Date.now();
        this.saveSettings();
    }

    /**
     * Возвращает автора по ID.
     * @param {string} id
     * @returns {Object|undefined}
     */
    getAuthorById(id) {
        return this.data.authors.find(a => a.id === id);
    }

    /**
     * Создаёт или обновляет автора.
     * @param {Object} authorData
     * @returns {{ id: string, isModified: boolean }}
     */
    saveAuthor(authorData) {
        let isModified = false;

        if (authorData.id) {
            const idx = this.data.authors.findIndex(a => a.id === authorData.id);
            if (idx !== -1) {
                const current = this.data.authors[idx];
                const hasChanges = Object.keys(authorData).some(k =>
                    k !== 'posts' && JSON.stringify(current[k]) !== JSON.stringify(authorData[k])
                );
                if (hasChanges) {
                    this.data.authors[idx] = { ...current, ...authorData };
                    isModified = true;
                }
            }
        } else {
            authorData.id = 'author_' + Date.now();
            authorData.posts = authorData.posts || [];
            this.data.authors.push(authorData);
            isModified = true;
        }

        if (isModified) this.save();
        return { id: authorData.id, isModified };
    }

    /**
     * Удаляет автора и все его произведения.
     * @param {string} id
     */
    deleteAuthor(id) {
        this.data.authors = this.data.authors.filter(a => a.id !== id);
        if (this.selectedAuthorId === id) {
            this.selectedAuthorId = this.data.authors.length > 0 ? this.data.authors[0].id : null;
        }
        this.save();
    }


    /* ==========================================================================
       5. Операции с Произведениями / Post CRUD
       ========================================================================== */

    /**
     * Возвращает произведение по ID автора и ID поста.
     * @param {string} authorId
     * @param {string} postId
     * @returns {Object|null}
     */
    getPostById(authorId, postId) {
        const author = this.getAuthorById(authorId);
        return author?.posts?.find(p => p.id === postId) ?? null;
    }

    /**
     * Создаёт или обновляет произведение.
     * @param {string} authorId
     * @param {Object} postData
     * @returns {{ id: string, isModified: boolean }}
     */
    savePost(authorId, postData) {
        const author = this.getAuthorById(authorId);
        if (!author) return { id: null, isModified: false };

        if (!author.posts) author.posts = [];
        let isModified = false;

        if (postData.id) {
            const idx = author.posts.findIndex(p => p.id === postData.id);
            if (idx !== -1) {
                const hasChanges = Object.keys(postData).some(k =>
                    JSON.stringify(author.posts[idx][k]) !== JSON.stringify(postData[k])
                );
                if (hasChanges) {
                    author.posts[idx] = { ...author.posts[idx], ...postData };
                    isModified = true;
                }
            }
        } else {
            postData.id = 'post_' + Date.now();
            author.posts.unshift(postData);
            isModified = true;
        }

        if (isModified) this.save();
        return { id: postData.id, isModified };
    }

    /**
     * Удаляет произведение автора.
     * @param {string} authorId
     * @param {string} postId
     */
    deletePost(authorId, postId) {
        const author = this.getAuthorById(authorId);
        if (!author?.posts) return;
        author.posts = author.posts.filter(p => p.id !== postId);
        this.save();
    }


    /* ==========================================================================
       6. Импорт и Экспорт / Import & Export
       ========================================================================== */

    /**
     * Вспомогательный метод: извлекает plain-text из HTML для EPUB.
     * @param {string} html
     * @returns {string}
     */
    stripTags(html) {
        return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
    }

    async cropImageToCircle(base64Data) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { alpha: true }); // Включаем прозрачность явно

                const size = Math.min(img.width, img.height);
                canvas.width = size;
                canvas.height = size;

                const offsetX = (img.width - size) / 2;
                const offsetY = (img.height - size) / 2;

                // КРИТИЧНО: Полностью очищаем холст до абсолютной прозрачности (RGBA 0,0,0,0)
                ctx.clearRect(0, 0, size, size);

                // Настройка сглаживания краев
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Рисуем круговую маску
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); // -1px от края убирает лесенку
                ctx.closePath();
                ctx.clip();

                ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);

                // Экспортируем ЧИСТЫЙ PNG с поддержкой альфа-канала
                resolve(canvas.toDataURL('image/png'));
            };

            img.onerror = () => resolve(base64Data);
            img.src = base64Data;
        });
    }
    
    /**
     * Преобразует Base64-изображение в градацию серого (Grayscale)
     */
    async convertToGrayscale(base64Data) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = img.width;
                canvas.height = img.height;

                // Используем нативный фильтр Canvas для максимальной производительности
                ctx.filter = 'grayscale(100%)';
                ctx.drawImage(img, 0, 0);

                resolve(canvas.toDataURL('image/png'));
            };

            img.onerror = () => resolve(base64Data);
            img.src = base64Data;
        });
    }

    /**
     * Экспортирует библиотеку в формат EPUB.
     * @param {string[]} [selectedAuthorIds] - ID выбранных авторов. Если не указано — экспортируются все.
     */
    async exportToEpub(selectedAuthorIds) {
        const data = JSON.parse(JSON.stringify(this.data));
        const zip = new JSZip();
        const mainTitle = 'Буквы по центру';
        const mainSubtitle = 'Eщё буквы';

        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

        zip.folder('META-INF').file('container.xml',
            `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

        const oebps = zip.folder('OEBPS');
        let sortedAuthors = (data.authors || []).sort(sortAZ);

        // Фильтруем авторов, если передан список выбранных ID
        if (Array.isArray(selectedAuthorIds) && selectedAuthorIds.length > 0) {
            const selectedSet = new Set(selectedAuthorIds);
            sortedAuthors = sortedAuthors.filter(a => selectedSet.has(a.id));
        }

        const manifestItems = [
            '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
            '<item id="cover" href="cover.html" media-type="application/xhtml+xml"/>',
            '<item id="authors_page" href="authors.html" media-type="application/xhtml+xml"/>',
            '<item id="toc_page" href="toc.html" media-type="application/xhtml+xml"/>',
        ];
        const spineItems = [
            '<itemref idref="cover" linear="yes"/>',
            '<itemref idref="authors_page" linear="yes"/>',
            '<itemref idref="toc_page" linear="yes"/>',
        ];
        let navIndex = 1;
        const navPoints = [
            { id: 'cover',       order: navIndex++, title: 'Титульная страница', src: 'cover.html' },
            { id: 'authors_page',order: navIndex++, title: 'Список авторов',     src: 'authors.html' },
            { id: 'toc_page',    order: navIndex++, title: 'Оглавление',         src: 'toc.html' },
        ];

        let authorsListHtml = '';
        let tocHtmlItems    = '';

        for (let aIdx = 0; aIdx < sortedAuthors.length; aIdx++) {
            const author = sortedAuthors[aIdx];
            const authorFullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.trim();
            const authorId       = `author_${aIdx}`;
            const authorFileName = `${authorId}.html`;
            const postsCount     = (author.posts || []).length;
            let imageFilename    = null;

            authorsListHtml += `<li><a href="${authorFileName}">${escapeHtml(authorFullName)}</a> <span class="count">(${postsCount})</span></li>`;

            if (author.photo && author.photo.includes('base64,')) {
                const bwPhoto = await this.convertToGrayscale(author.photo);
                const roundBase64 = await this.cropImageToCircle(bwPhoto);

                const parts = roundBase64.split('base64,');
                const mimeType = 'image/png';
                const ext = 'png';

                imageFilename = `img_${authorId}.${ext}`;

                oebps.file(`images/${imageFilename}`, parts[1], { base64: true });
                manifestItems.push(`<item id="img_${authorId}" href="images/${imageFilename}" media-type="${mimeType}"/>`);
            }

            const hideYears = !author.birthYear && !author.deathYear;

            oebps.file(authorFileName, `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeHtml(authorFullName)}</title>
  <style>
    body { font-family: serif; margin: 5%; text-align: center; }
    .author-photo-wrapper { width: 180px; height: 180px; margin: 0 auto 1em; display: block; }
    .author-photo { display: block; width: 180px; height: 180px; border-radius: 50%; -webkit-border-radius: 50%; clip-path: circle(50%); object-fit: cover; filter: grayscale(100%) }
    h1 { margin-bottom: 0.2em; }
    .years { color: #555; font-style: italic; display: block; font-size: 0.8em}
  </style>
</head>
<body>
  ${imageFilename ? `<div class="author-photo-wrapper"><img src="images/${imageFilename}" alt="${escapeHtml(authorFullName)}" class="author-photo"></div>` : ''}
  <h1>${escapeHtml(authorFullName)}</h1>
  <h2 class="years" ${hideYears ? 'style="display:none"' : ''}>${author.birthYear || ''} — ${author.deathYear || 'наст.вр.'}</h2>
</body>
</html>`);
            manifestItems.push(`<item id="${authorId}" href="${authorFileName}" media-type="application/xhtml+xml"/>`);
            spineItems.push(`<itemref idref="${authorId}"/>`);

            const authorNavPoint = { id: authorId, order: navIndex++, title: authorFullName, src: authorFileName, children: [] };
            let postsTocHtml = '';

            (author.posts || []).forEach((post, pIdx) => {
                const postId   = `post_${aIdx}_${pIdx}`;
                let postBody   = post.contentHtml ? this.stripTags(post.contentHtml) : post.content;

                if (postBody) {
                    postBody = postBody.split(/\n\s*\n/).map(stanza =>
                        `<div class="stanza">${stanza.trim().split(/\n/).map(l => `<span class="line">${escapeHtml(l)}</span>`).join('')}</div>`
                    ).join('\n');
                }

                const postFileName = `${postId}.html`;
                oebps.file(postFileName, `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeHtml(post.title)}</title>
  <style>
    body { font-family: serif; margin: 5%; line-height: 1.4; }
    h2 { text-align: center; }
    .note, .p_year { font-size: 0.85em; color: #666; font-style: italic; }
    .stanza { margin: 0 0 1.2em; font-style: normal }
    .line { display: block; font-style: normal }
  </style>
</head>
<body>
  <h2>${escapeHtml(post.title)}</h2>
  <div class="content">${postBody}</div>
  ${(post.year && (!post.note || !post.note.includes(String(post.year)))) ? `<p class="p_year">${post.year}</p>` : ''}
  ${post.note ? `<p class="note">${escapeHtml(post.note)}</p>` : ''}
</body>
</html>`);
                manifestItems.push(`<item id="${postId}" href="${postFileName}" media-type="application/xhtml+xml"/>`);
                spineItems.push(`<itemref idref="${postId}"/>`);
                authorNavPoint.children.push({ id: postId, order: navIndex++, title: post.title, src: postFileName });
                postsTocHtml += `<li><a href="${postFileName}">• ${escapeHtml(post.title)}</a></li>`;
            });

            navPoints.push(authorNavPoint);
            tocHtmlItems += `<li><a href="${authorFileName}"><strong>${escapeHtml(authorFullName)}:</strong></a>${postsTocHtml ? `<ul>${postsTocHtml}</ul>` : ''}</li>`;
        }

        const xhtmlHead = (title, style) =>
            `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title><style>${style}</style></head>`;

        oebps.file('cover.html', xhtmlHead(mainTitle,
            'body{font-family:serif;text-align:center;margin:20% 5%} h1{font-size:2.2em} h2{font-size:1.5em; color:#555;font-style:normal;text-align:center}')
            + `<body><h1>${mainTitle}</h1><h2>${mainSubtitle}</h2></body></html>`);

        oebps.file('authors.html', xhtmlHead('Список авторов',
            'body{font-family:serif;margin:5%;line-height:1.6} ul{list-style:none;padding:0} li{margin-bottom:.8em;border-bottom:1px dashed #ccc;padding-bottom:.4em} a{color:#000;font-weight:bold} .count{color:#666;font-size:.9em;font-weight:normal}')
            + `<body><h1>Список авторов</h1><ul>${authorsListHtml}</ul></body></html>`);

        oebps.file('toc.html', xhtmlHead('Оглавление',
            'body{font-family:serif;margin:5%;line-height:1.5} ul{list-style:none;padding-left:1.2em} ul.root-toc{padding-left:0} a{color:#000;text-decoration:none}')
            + `<body><h1>Оглавление</h1><ul class="root-toc">${tocHtmlItems}</ul></body></html>`);

        oebps.file('content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeHtml(mainTitle)}</dc:title>
    <dc:language>ru</dc:language>
    <dc:identifier id="BookId">urn:uuid:${Date.now()}</dc:identifier>
  </metadata>
  <manifest>${manifestItems.join('\n    ')}</manifest>
  <spine toc="ncx">${spineItems.join('\n    ')}</spine>
  <guide>
    <reference type="title-page" title="Титульная страница" href="cover.html"/>
    <reference type="toc" title="Оглавление" href="toc.html"/>
  </guide>
</package>`);

        const renderNavPoint = (np) => {
            const children = (np.children || []).map(renderNavPoint).join('');
            return `<navPoint id="${np.id}" playOrder="${np.order}">
      <navLabel><text>${escapeHtml(np.title)}</text></navLabel>
      <content src="${np.src}"/>${children}
    </navPoint>`;
        };

        oebps.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${Date.now()}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${mainTitle}</text></docTitle>
  <navMap>${navPoints.map(renderNavPoint).join('\n    ')}</navMap>
</ncx>`);

        const content = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
        saveAs(content, `authors_collection_${new Date().toISOString().slice(0, 10)}.epub`);
    }

    /**
     * Экспортирует библиотеку в JSON-файл (с нормализацией Unicode).
     */
    exportJson() {
        const normalizedData = JSON.parse(JSON.stringify(this.data));

        const normalizeObj = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = normalizeUnicode(obj[key]);
                } else if (typeof obj[key] === 'object') {
                    normalizeObj(obj[key]);
                }
            }
            if (typeof obj.title === 'string' && obj.title === obj.url) obj.title = '';
        };

        normalizeObj(normalizedData);

        const postsCount = (normalizedData.authors || []).reduce((sum, a) => sum + (a.posts?.length || 0), 0);

        if (!normalizedData.meta) {
            normalizedData.meta = {
                appName:      'Поэтическая Полка',
                version:      '1.0',
                createdAt:    new Date().toISOString()
            };
        }
        normalizedData.meta.modifiedAt = new Date().toISOString();
        normalizedData.meta.modifiedBy = 'user';
        normalizedData.meta.authorsCount = (normalizedData.authors || []).length;
        normalizedData.meta.postsCount = postsCount;

        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(normalizedData, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `stih_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    }

    /**
     * Импортирует библиотеку из JSON-файла.
     * @param {Object} jsonData
     */
    importJson(jsonData) {
        if (jsonData.authors) {
            this.data = {
                meta: jsonData.meta || null,
                authors: jsonData.authors
            };
        } else {
            this.data = {
                authors: Array.isArray(jsonData) ? jsonData : (jsonData.authors || [])
            };
        }
        this.selectedAuthorId = this.data.authors.length > 0 ? this.data.authors[0].id : null;
        this.save();
    }
}