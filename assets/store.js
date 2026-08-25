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
        this.authorSortMode = 'none';  // none | az | birthday | len | recent
        this.lastViewed = {};           // { authorId: timestamp }
        this.postBookmarks = {};        // { postId: true }
    }

    /**
     * Инициализирует хранилище из localStorage.
     */
    async init() {
        this.authorSortMode = localStorage.getItem('authorSortMode') || 'none';

        try {
            const v = JSON.parse(localStorage.getItem('lastViewed'));
            this.lastViewed = (v && typeof v === 'object') ? v : {};
        } catch { this.lastViewed = {}; }

        try {
            const v = JSON.parse(localStorage.getItem('postBookmarks'));
            this.postBookmarks = (v && typeof v === 'object') ? v : {};
        } catch { this.postBookmarks = {}; }

        const local = localStorage.getItem('stih_app_data');
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
     */
    async loadDefaultJson() {
        try {
            const res = await fetch('data.json');
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
        localStorage.setItem('stih_app_data', JSON.stringify({ data: this.data }));
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
        localStorage.setItem('postBookmarks', JSON.stringify(this.postBookmarks));
        localStorage.setItem('lastViewed',    JSON.stringify(this.lastViewed));
        localStorage.setItem('authorSortMode', this.authorSortMode);
    }

    /** Сохраняет ширину сайдбара. */
    saveSidebar(width) {
        localStorage.setItem('authorsSidebarWidth', width);
    }

    /** Загружает ширину сайдбара. */
    loadSidebar() {
        return parseInt(localStorage.getItem('authorsSidebarWidth'), 10);
    }

    /** Помечает данные как изменённые. */
    markAsChanged() {
        const count = parseInt(localStorage.getItem('unsavedChangesCount') || '0', 10);
        localStorage.setItem('unsavedChangesCount', count + 1);
        localStorage.setItem('lastChangeTimestamp', Date.now());
        this.updateExportWarningStatus();
    }

    /** Помечает данные как экспортированные (сбрасывает счётчик). */
    markAsExported() {
        localStorage.setItem('unsavedChangesCount', '0');
        localStorage.setItem('lastExportTimestamp', Date.now());
        this.updateExportWarningStatus();
    }

    /** Возвращает true, если есть несохранённые изменения. */
    hasUnsavedChanges() {
        return parseInt(localStorage.getItem('unsavedChangesCount') || '0', 10) > 0;
    }

    /** Возвращает количество несохранённых изменений. */
    getUnsavedChangesCount() {
        return parseInt(localStorage.getItem('unsavedChangesCount') || '0', 10);
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

        const sortAZ = (a, b) =>
            `${a.lastName} ${a.firstName}`.toLowerCase()
                .localeCompare(`${b.lastName} ${b.firstName}`.toLowerCase(), 'ru');

        switch (this.authorSortMode) {
            case 'birthday':
                authors.sort((a, b) => {
                    if (!a.birthYear && !b.birthYear) return sortAZ(a, b);
                    return (a.birthYear || 9999) - (b.birthYear || 9999) || sortAZ(a, b);
                });
                break;
            case 'len':
                authors.sort((a, b) => {
                    const la = a.posts?.length || 0;
                    const lb = b.posts?.length || 0;
                    return lb - la || sortAZ(a, b);
                });
                break;
            case 'az':
                authors.sort(sortAZ);
                break;
            case 'recent':
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

    /**
     * Экспортирует библиотеку в формат EPUB.
     */
    async exportToEpub() {
        const data = JSON.parse(JSON.stringify(this.data));
        const zip = new JSZip();
        const mainTitle = 'Поэтическая Полка';
        const mainSubtitle = 'Сборник произведений';

        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

        zip.folder('META-INF').file('container.xml',
            `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

        const oebps = zip.folder('OEBPS');

        const sortedAuthors = (data.authors || []).sort((a, b) => {
            const nameA = `${a.lastName} ${a.firstName} ${a.surName || ''}`.trim();
            const nameB = `${b.lastName} ${b.firstName} ${b.surName || ''}`.trim();
            return nameA.localeCompare(nameB, 'uk', { sensitivity: 'base' });
        });

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

        sortedAuthors.forEach((author, aIdx) => {
            const authorFullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.trim();
            const authorId       = `author_${aIdx}`;
            const authorFileName = `${authorId}.html`;
            const postsCount     = (author.posts || []).length;
            let imageFilename    = null;

            authorsListHtml += `<li><a href="${authorFileName}">${escapeHtml(authorFullName)}</a> <span class="count">(${postsCount})</span></li>`;

            if (author.photo && author.photo.includes('base64,')) {
                const parts     = author.photo.split('base64,');
                const mimeMatch = parts[0].match(/:(.*?);/);
                const mimeType  = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                const ext       = mimeType.split('/')[1] || 'jpg';
                imageFilename   = `img_${authorId}.${ext}`;
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
    .years { color: #555; font-style: italic; display: block; }
  </style>
</head>
<body>
  ${imageFilename ? `<div class="author-photo-wrapper"><img src="images/${imageFilename}" alt="${escapeHtml(authorFullName)}" class="author-photo"></div>` : ''}
  <h1>${escapeHtml(authorFullName)}</h1>
  <p class="years" ${hideYears ? 'style="display:none"' : ''}>${author.birthYear || ''} — ${author.deathYear || ''}</p>
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
    .stanza { margin: 0 0 1.2em; }
    .line { display: block; }
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
                postsTocHtml += `<li><a href="${postFileName}">${escapeHtml(post.title)}</a></li>`;
            });

            navPoints.push(authorNavPoint);
            tocHtmlItems += `<li><a href="${authorFileName}"><strong>${escapeHtml(authorFullName)}</strong></a>${postsTocHtml ? `<ul>${postsTocHtml}</ul>` : ''}</li>`;
        });

        const xhtmlHead = (title, style) =>
            `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title><style>${style}</style></head>`;

        oebps.file('cover.html', xhtmlHead(mainTitle,
            'body{font-family:serif;text-align:center;margin:20% 5%} h1{font-size:2.2em} p{color:#555;font-style:italic}')
            + `<body><h1>${mainTitle}</h1><hr/><p>${mainSubtitle}</p></body></html>`);

        oebps.file('authors.html', xhtmlHead('Список авторов',
            'body{font-family:serif;margin:5%;line-height:1.6} ul{list-style:none;padding:0} li{margin-bottom:.8em;border-bottom:1px dashed #ccc;padding-bottom:.4em} a{color:#000;font-weight:bold} .count{color:#666;font-size:.9em;font-weight:normal}')
            + `<body><h1>Список авторов</h1><ul>${authorsListHtml}</ul></body></html>`);

        oebps.file('toc.html', xhtmlHead('Оглавление',
            'body{font-family:serif;margin:5%;line-height:1.5} ul{list-style:none;padding-left:1.2em} ul.root-toc{padding-left:0} a{color:#000;text-decoration:none}')
            + `<body><h1>Оглавление</h1><ul class="root-toc">${tocHtmlItems}</ul></body></html>`);

        oebps.file('content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${mainTitle}</dc:title>
    <dc:language>uk</dc:language>
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

        const exportData = {
            meta: {
                appName:      'Поэтическая Полка',
                version:      '1.0',
                createdAt:    new Date().toISOString(),
                authorsCount: (normalizedData.authors || []).length,
                postsCount,
            },
            authors: normalizedData.authors,
        };

        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
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
        this.data = jsonData.authors ? { authors: jsonData.authors } : jsonData;
        this.selectedAuthorId = this.data.authors.length > 0 ? this.data.authors[0].id : null;
        this.save();
    }
}
