class PoemStore {
    constructor() {
        this.data = { authors: [] };
        this.selectedAuthorId = null;
        this.selectedPostId = null;
        this.authorSortMode = 'none'; // none, az, recent, len
        this.lastViewed = {}; // { authorId: timestamp }
        this.postBookmarks = {}; // { postId: timestamp }
    }

    async init() {
        this.authorSortMode = localStorage.getItem('authorSortMode') || 'none';

        // Безопасный парсинг lastViewed
        try {
            const parsedViewed = JSON.parse(localStorage.getItem('lastViewed'));
            this.lastViewed = (parsedViewed && typeof parsedViewed === 'object') ? parsedViewed : {};
        } catch (e) {
            this.lastViewed = {};
        }

        try {
            const parsedPostBookmarks = JSON.parse(localStorage.getItem('postBookmarks'));
            this.postBookmarks = (parsedPostBookmarks && typeof parsedPostBookmarks === 'object') ? parsedPostBookmarks : {};
        } catch (e) {
            this.postBookmarks = {};
        }

        const local = localStorage.getItem('stih_app_data');
        if (local) {
            try {
                const parsed = JSON.parse(local);
                // Поддержка обеих структур (с оберткой { data: ... } и без)
                this.data = parsed.data || parsed;
                if (!this.data.authors) {
                    this.data.authors = [];
                }
            } catch (e) {
                console.error('Ошибка чтения из localStorage:', e);
                await this.loadDefaultJson();
            }
        } else {
            await this.loadDefaultJson();
        }
    }

    async loadDefaultJson() {
        try {
            const res = await fetch('data.json');
            this.data = await res.json();
            this.saveData();
        } catch (err) {
            this.data = { authors: [] };
        }
    }

    saveData() {
        localStorage.setItem('stih_app_data', JSON.stringify({data: this.data}));
        this.markAsChanged();
        this.updateExportWarningStatus();
    }

    save() {
        this.saveData();
        this.saveSettings();
    }

    saveSettings() {
        localStorage.setItem('postBookmarks', JSON.stringify(this.postBookmarks));
        localStorage.setItem('lastViewed', JSON.stringify(this.lastViewed));
        localStorage.setItem('authorSortMode', this.authorSortMode);
    }

    markAsChanged() {
        // Увеличиваем счетчик изменений
        const currentCount = parseInt(localStorage.getItem('unsavedChangesCount') || '0', 10);
        localStorage.setItem('unsavedChangesCount', currentCount + 1);

        localStorage.setItem('lastChangeTimestamp', Date.now());
        this.updateExportWarningStatus();
    }

    markAsExported() {
        // При экспорте сбрасываем счетчик
        localStorage.setItem('unsavedChangesCount', '0');
        localStorage.setItem('lastExportTimestamp', Date.now());
        this.updateExportWarningStatus();
    }

    hasUnsavedChanges() {
        const count = parseInt(localStorage.getItem('unsavedChangesCount') || '0', 10);
        return count > 0;
    }

    getUnsavedChangesCount() {
        return parseInt(localStorage.getItem('unsavedChangesCount') || '0', 10);
    }

    updateExportWarningStatus() {
        const $dataBtn = $('#dataActionsDropdown');
        const count = this.getUnsavedChangesCount();

        if (count > 0) {
            // Форматируем текст: если больше 99, пишем 99+
            const badgeText = count > 99 ? '99+' : count;

            let $badge = $dataBtn.find('.unsaved-badge');

            if (!$badge.length) {
                $badge = $('<span class="unsaved-badge badge rounded-pill bg-danger position-absolute top-0 start-100 translate-middle"></span>');
                $dataBtn.append($badge);
            }

            $badge
                .text(badgeText)
                .attr('title', `Несохранённых изменений: ${count}`);
        } else {
            $dataBtn.find('.unsaved-badge').remove();
        }
    }

    toggleBookmark(postId, state = true) {
        this.postBookmarks[postId] = state;
        this.saveSettings();
    }

    getPostBookmark(postId) {
        return Boolean(this.postBookmarks[postId]);
    }

    getAuthors(searchQuery = '') {
        let authors = searchQuery && searchQuery.trim()
            ? this.data.authors.filter(author => {
                const q = searchQuery.toLowerCase().trim();
                if (isAuthorMatch(author, q)) {
                    return true;
                }
                if (author.posts && author.posts.length > 0) {
                    return author.posts.some(post => isPostMatch(post, q));
                }
                return false;
            })
            : [...this.data.authors];

        const sortAuthorsAZ = (a,b) => {
            const nameA = `${a.lastName || ''} ${a.firstName || ''}`.toLowerCase();
            const nameB = `${b.lastName || ''} ${b.firstName || ''}`.toLowerCase();
            return nameA.localeCompare(nameB, 'ru');
        }

        // Сортировка
        switch (this.authorSortMode) {
            case 'birthday':
                authors.sort((a, b) => {
                    if (!a.birthYear && !b.birthYear) {
                        return sortAuthorsAZ(a,b)
                    }

                    const lA = a.birthYear || 9999;
                    const lB = b.birthYear || 9999;

                    if (lA === lB) {
                        return sortAuthorsAZ(a,b)
                    }

                    return lA - lB;
                });
                break;
            case 'len':
                authors.sort((a, b) => {
                    if ((!a.posts && !b.posts) ) {
                        return sortAuthorsAZ(a,b)
                    }
                    const lA = a.posts ? a.posts.length : 0;
                    const lB = b.posts ? b.posts.length : 0;

                    if (lA === lB) {
                        return sortAuthorsAZ(a,b)
                    }

                    return lB - lA;
                });
                break;
            case 'az':
                authors.sort((a, b) => {
                    return sortAuthorsAZ(a,b)
                });
                break;
            case 'recent':
                authors.sort((a, b) => {
                    const timeA = this.lastViewed[a.id] || 0;
                    const timeB = this.lastViewed[b.id] || 0;

                    if (!timeA && !timeB) {
                        return sortAuthorsAZ(a,b)
                    }

                    return timeB - timeA;
                });
                break;
        }

        return authors;
    }

    markAsViewed(authorId) {
        this.lastViewed[authorId] = Date.now();
        this.saveSettings();
    }
    getAuthorById(id) {
        return this.data.authors.find(a => a.id === id);
    }

    saveAuthor(authorData) {
    let isModified = false;

        if (authorData.id) {
            const idx = this.data.authors.findIndex(a => a.id === authorData.id);
            if (idx !== -1) {
            const current = this.data.authors[idx];

            // Проверяем, изменились ли поля (игнорируя массив posts при сравнении)
            const hasChanges = Object.keys(authorData).some(key => {
                if (key === 'posts') return false; // стихи сравниваются отдельно
                return JSON.stringify(current[key]) !== JSON.stringify(authorData[key]);
            });

            if (hasChanges) {
                this.data.authors[idx] = { ...current, ...authorData };
                isModified = true;
            }
            }
        } else {
        // Новый автор — это всегда новое изменение
            authorData.id = 'author_' + Date.now();
        authorData.posts = authorData.posts || [];
            this.data.authors.push(authorData);
        isModified = true;
        }

    // Сохраняем и фиксируем изменения ТОЛЬКО если они реально были
    if (isModified) {
        this.save();
    }

    return {
        id: authorData.id,
        isModified // флаг, чтобы в UI понять — была ли реальная правка
    };
}
    deleteAuthor(id) {
        this.data.authors = this.data.authors.filter(a => a.id !== id);
        if (this.selectedAuthorId === id) {
            this.selectedAuthorId = this.data.authors.length > 0 ? this.data.authors[0].id : null;
        }
        this.save();
    }

    getPostById(authorId, postId) {
        const author = this.getAuthorById(authorId);
        if (!author || !author.posts) return null;
        return author.posts.find(p => p.id === postId);
    }

    savePost(authorId, postData) {
        const author = this.getAuthorById(authorId);
        if (!author) return { id: null, isModified: false };

        if (!author.posts) author.posts = [];

        let isModified = false;

        if (postData.id) {
            const idx = author.posts.findIndex(p => p.id === postData.id);
            if (idx !== -1) {
                const currentPost = author.posts[idx];

                // Сравниваем свойства текущего стиха с пришедшими данными
                const hasChanges = Object.keys(postData).some(key => {
                    return JSON.stringify(currentPost[key]) !== JSON.stringify(postData[key]);
                });

                if (hasChanges) {
                    author.posts[idx] = { ...currentPost, ...postData };
                    isModified = true;
                }
            }
        } else {
            postData.id = 'post_' + Date.now();
            author.posts.unshift(postData);
            isModified = true;
        }

        if (isModified) {
            this.save();
        }

        return {
            id: postData.id,
            isModified
        };
    }
    deletePost(authorId, postId) {
        const author = this.getAuthorById(authorId);
        if (!author || !author.posts) return;

        author.posts = author.posts.filter(p => p.id !== postId);
        this.save();
    }

     stripTags(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    }

    async exportToEpub() {
        const data = JSON.parse(JSON.stringify(this.data));
        const zip = new JSZip();
        const mainTitle = 'Буквы по центру';
        const mainSubtitle = 'Eщё буквы';

        // Функция очистки спецсимволов XML
        const escapeXml = (str) => (str || '')
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/ >/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");

        // 1. Обязательный mimetype (должен идти без сжатия)
        zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

        // 2. META-INF/container.xml
        zip.folder("META-INF").file("container.xml",
            `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
        );

        const oebps = zip.folder("OEBPS");

        // Сортировка авторов по алфавиту (ФИО)
        const sortedAuthors = (data.authors || []).sort((a, b) => {
            const nameA = `${a.lastName || ''} ${a.firstName || ''} ${a.surName || ''}`.trim();
            const nameB = `${b.lastName || ''} ${b.firstName || ''} ${b.surName || ''}`.trim();
            return nameA.localeCompare(nameB, 'uk', { sensitivity: 'base' });
        });

        // Массивы для генерации content.opf и toc.ncx
        const manifestItems = [
            '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
            '<item id="cover" href="cover.html" media-type="application/xhtml+xml"/>',
            '<item id="authors_page" href="authors.html" media-type="application/xhtml+xml"/>',
            '<item id="toc_page" href="toc.html" media-type="application/xhtml+xml"/>'
        ];

        // Порядок чтения: Титулка -> Список авторов -> Оглавление
        const spineItems = [
            '<itemref idref="cover" linear="yes"/>',
            '<itemref idref="authors_page" linear="yes"/>',
            '<itemref idref="toc_page" linear="yes"/>'
        ];

        let navIndex = 1;

        // Пункты бокового меню ридера (NCX)
        const navPoints = [
            { id: 'cover', order: navIndex++, title: 'Титульная страница', src: 'cover.html' },
            { id: 'authors_page', order: navIndex++, title: 'Список авторов', src: 'authors.html' },
            { id: 'toc_page', order: navIndex++, title: 'Оглавление', src: 'toc.html' }
        ];

        let authorsListHtml = '';
        let tocHtmlItems = '';

        // Перебираем отсортированных авторов
        sortedAuthors.forEach((author, aIdx) => {
            const authorFullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.trim();
            const authorId = `author_${aIdx}`;
            const authorFileName = `${authorId}.html`;
            const postsCount = (author.posts || []).length;
            let imageFilename = null;

            // Элемент для страницы списка авторов
            authorsListHtml += `
            <li>
                <a href="${authorFileName}">${escapeXml(authorFullName)}</a> 
                <span class="count">(${postsCount})</span>
            </li>`;

            // Сохраняем фото автора, если оно есть в base64
            if (author.photo && author.photo.includes("base64,")) {
                const parts = author.photo.split("base64,");
                const mimeMatch = parts[0].match(/:(.*?);/);
                const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
                const ext = mimeType.split("/")[1] || "jpg";
                const base64Data = parts[1];

                imageFilename = `img_${authorId}.${ext}`;
                oebps.file(`images/${imageFilename}`, base64Data, { base64: true });
                manifestItems.push(`<item id="img_${authorId}" href="images/${imageFilename}" media-type="${mimeType}"/>`);
            }

            const hideYears = !author.birthYear && !author.deathYear;

            // Страница автора (кругле фото + центрированные года)
            const authorPageHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(authorFullName)}</title>
  <style>
    body { font-family: serif; margin: 5%; text-align: center; }
    .author-photo { width: 180px; height: 180px; border-radius: 50%; object-fit: cover; margin: 0 auto 1em auto; display: block; }
    .avatar-style { filter: grayscale(100%) hue-rotate(-15deg) saturate(0.7) contrast(0.95); opacity: 0.95; }
    h1 { margin-bottom: 0.2em; text-align: center; }
    .years { color: #555; font-style: italic; margin: 0 auto 2em auto; text-align: center; display: block; width: 100%; }
    .author-photo-wrapper { width: 180px; height: 180px; margin: 0 auto 1em auto; display: block; text-align: center; }
.author-photo { display: block; width: 180px; height: 180px; border-radius: 50%; -webkit-border-radius: 50%; clip-path: circle(50%); -webkit-clip-path: circle(50%); object-fit: cover; -webkit-object-fit: cover; }
  </style>
</head>
<body>
  ${imageFilename ? `
<div class="author-photo-wrapper">
  <img
    src="images/${imageFilename}"
    alt="${escapeXml(authorFullName)}"
    class="author-photo avatar-style"
  >
</div>
` : ''}

  <h1>${escapeXml(authorFullName)}</h1>
  <p class="years" ${hideYears ? 'style="display: none"' : ''}>
    ${author.birthYear || ''} — ${author.deathYear || ''}
  </p>
</body>
</html>`;
            oebps.file(authorFileName, authorPageHtml);
            manifestItems.push(`<item id="${authorId}" href="${authorFileName}" media-type="application/xhtml+xml"/>`);
            spineItems.push(`<itemref idref="${authorId}"/>`);

            const authorNavPoint = {
                id: authorId,
                order: navIndex++,
                title: authorFullName,
                src: authorFileName,
                children: []
            };

            let postsTocHtml = '';

            // Перебираем стихотворения автора
            (author.posts || []).forEach((post, pIdx) => {
                const postId = `post_${aIdx}_${pIdx}`;

                // Форматируем контент
                let postBody = post.contentHtml ? this.stripTags(post.contentHtml) : post.content;

                if (postBody) {
                    postBody = postBody
                        .split(/\n\s*\n/)
                        .map(stanza => {
                            const lines = stanza
                                .trim()
                                .split(/\n/)
                                .map(line => `<span class="line">${escapeXml(line)}</span>`)
                                .join("");

                            return `<div class="stanza">${lines}</div>`;
                        })
                        .join("\n");
                }

                const postHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(post.title)}</title>
  <style>
    body { font-family: serif; margin: 5%; line-height: 1.4; }
    h2 { text-align: center; margin-bottom: 0.2em; }
    .note { text-align: left; font-size: 0.85em; color: #666; margin-bottom: 2em; font-style: italic}
    .p_year { text-align: left; font-size: 0.85em; color: #666; margin-bottom: 2em; font-style: italic}
    .content { line-height: 1.3; margin-top: 1em }
    .stanza { margin: 0 0 1.2em 0; font-style: normal; }
    .line { display: block; font-style: normal; }
  </style>
</head>
<body>
  <h2>${escapeXml(post.title)}</h2>
  <div class="content">
    ${postBody}
  </div>
  ${(post.year && (!post.note || !post.note.includes(String(post.year)))) ? `<p class="p_year">${post.year}</p>` : ''}
  ${post.note ? `<p class="note">${escapeXml(post.note)}</p>` : ''}
</body>
</html>`;

                const postFileName = `${postId}.html`;
                oebps.file(postFileName, postHtml);
                manifestItems.push(`<item id="${postId}" href="${postFileName}" media-type="application/xhtml+xml"/>`);
                spineItems.push(`<itemref idref="${postId}"/>`);

                authorNavPoint.children.push({
                    id: postId,
                    order: navIndex++,
                    title: post.title,
                    src: postFileName
                });
                postsTocHtml += `<li><a href="${postFileName}">${escapeXml(post.title)}</a></li>`;
            });

            navPoints.push(authorNavPoint);

            tocHtmlItems += `
            <li>
                <a href="${authorFileName}"><strong>${escapeXml(authorFullName)}</strong></a>
                ${postsTocHtml ? `<ul>${postsTocHtml}</ul>` : ''}
            </li>
        `;
        });

        // 1. ТИТУЛЬНАЯ СТРАНИЦА (cover.html)
        const coverHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${mainTitle}</title>
  <style>
    body { font-family: serif; text-align: center; margin: 20% 5% 5% 5%; }
    h1 { font-size: 2.2em; margin-bottom: 0.5em; }
    p.subtitle { font-size: 1.2em; color: #555; font-style: italic; }
    .divider { margin: 2em auto; width: 60px; border-bottom: 2px solid #333; }
  </style>
</head>
<body>
  <h1>${mainTitle}</h1>
  <div class="divider"></div>
  <p class="subtitle">${mainSubtitle}</p>
</body>
</html>`;

        oebps.file("cover.html", coverHtml);

        // 2. СТРАНИЦА СПИСКА АВТОРОВ (authors.html)
        const authorsPageHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Список авторов</title>
  <style>
    body { font-family: serif; margin: 5%; line-height: 1.6; }
    h1 { text-align: center; margin-bottom: 1.5em; }
    ul { list-style-type: none; padding-left: 0; }
    li { margin-bottom: 0.8em; border-bottom: 1px dashed #ccc; padding-bottom: 0.4em; }
    a { color: #000; text-decoration: none; font-weight: bold; }
    .count { color: #666; font-size: 0.9em; font-weight: normal; }
  </style>
</head>
<body>
  <h1>Список авторов</h1>
  <ul>
    ${authorsListHtml}
  </ul>
</body>
</html>`;

        oebps.file("authors.html", authorsPageHtml);

        // 3. СТРАНИЦА ОГЛАВЛЕНИЯ (toc.html)
        const tocPageHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Оглавление</title>
  <style>
    body { font-family: serif; margin: 5%; line-height: 1.5; }
    h1 { text-align: center; margin-bottom: 1.5em; }
    ul { list-style-type: none; padding-left: 1.2em; }
    ul.root-toc { padding-left: 0; }
    li { margin-bottom: 0.5em; }
    a { color: #000; text-decoration: none; }
  </style>
</head>
<body>
  <h1>Оглавление</h1>
  <ul class="root-toc">
    ${tocHtmlItems}
  </ul>
</body>
</html>`;

        oebps.file("toc.html", tocPageHtml);

        // Генерация OEBPS/content.opf
        const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${mainTitle}</dc:title>
    <dc:language>uk</dc:language>
    <dc:identifier id="BookId">urn:uuid:${Date.now()}</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join("\n    ")}
  </spine>
  <guide>
    <reference type="title-page" title="Титульная страница" href="cover.html"/>
    <reference type="toc" title="Оглавление" href="toc.html"/>
  </guide>
</package>`;

        oebps.file("content.opf", contentOpf);

        // Helper для генерации иерархического NCX
        function renderNavPoint(np) {
            let childrenHtml = '';
            if (np.children && np.children.length > 0) {
                childrenHtml = np.children.map(renderNavPoint).join("\n");
            }
            return `<navPoint id="${np.id}" playOrder="${np.order}">
      <navLabel><text>${escapeXml(np.title)}</text></navLabel>
      <content src="${np.src}"/>
      ${childrenHtml}
    </navPoint>`;
        }

        // Генерация OEBPS/toc.ncx
        const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${Date.now()}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${mainTitle}</text>
  </docTitle>
  <navMap>
    ${navPoints.map(renderNavPoint).join("\n    ")}
  </navMap>
</ncx>`;

        oebps.file("toc.ncx", tocNcx);

        // 3. Генерация архива и вызов скачивания
        const content = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
        saveAs(content, `authors_collection_${new Date().toISOString().slice(0,10)}.epub`);
    }

    exportJson() {
        // Нормализуем все текстовые данные перед экспортом
        const normalizedData = JSON.parse(JSON.stringify(this.data));
        
        const normalizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = normalizeUnicode(obj[key]);
                } else if (typeof obj[key] === 'object') {
                    normalizeObject(obj[key]);
                }
            }

            if (typeof obj.title === 'string' && typeof obj.url === 'string' && obj.title === obj.url) {
                obj.title = "";
            }
        };
        
        normalizeObject(normalizedData);
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(normalizedData, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `stih_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    }

    importJson(jsonData) {
        this.data = jsonData;
        this.selectedAuthorId = this.data.authors.length > 0 ? this.data.authors[0].id : null;
        this.save();
    }
}

/**
 * 2. UI RENDERER: Отрисовка элементов и работа с модалками
 */
