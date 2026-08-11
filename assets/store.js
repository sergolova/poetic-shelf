class PoemStore {
    constructor(storageKey = 'stih_app_data') {
        this.storageKey = storageKey;
        this.data = { authors: [] };
        this.selectedAuthorId = null;
        this.selectedPostId = null;
        this.authorSortMode = 'none'; // none, az, recent
        this.lastViewed = {}; // { authorId: timestamp }
    }

    async init() {
        const local = localStorage.getItem(this.storageKey);
        if (local) {
            try {
                const parsed = JSON.parse(local);
                this.data = parsed.data || parsed;
                this.lastViewed = parsed.lastViewed || {};
                this.authorSortMode = parsed.authorSortMode || 'none';
            } catch (e) {
                console.error('Ошибка чтения из localStorage', e);
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
            this.save();
        } catch (err) {
            this.data = { authors: [] };
        }
    }

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify({
            data: this.data,
            lastViewed: this.lastViewed,
            authorSortMode: this.authorSortMode
        }));
    }

    getAuthors(searchQuery = '') {
        let authors = searchQuery && searchQuery.trim()
            ? this.data.authors.filter(author => {
                const q = searchQuery.toLowerCase().trim();
                const fullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.toLowerCase();
                if (fullName.includes(q)) return true;
                if (author.posts && author.posts.length > 0) {
                    return author.posts.some(post => {
                        const title = (post.title || '').toLowerCase();
                        const content = (post.content || '').toLowerCase();
                        const contentHtml = (post.contentHtml || '').toLowerCase();
                        const note = (post.note || '').toLowerCase();
                        return title.includes(q) || content.includes(q) || contentHtml.includes(q) || note.includes(q);
                    });
                }
                return false;
            })
            : [...this.data.authors];

        // Сортировка
        switch (this.authorSortMode) {
            case 'az':
                authors.sort((a, b) => {
                    const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
                    const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
                    return nameA.localeCompare(nameB, 'ru');
                });
                break;
            case 'recent':
                authors.sort((a, b) => {
                    const timeA = this.lastViewed[a.id] || 0;
                    const timeB = this.lastViewed[b.id] || 0;
                    return timeB - timeA;
                });
                break;
        }

        return authors;
    }

    markAsViewed(authorId) {
        this.lastViewed[authorId] = Date.now();
        this.save();
    }
    getAuthorById(id) {
        return this.data.authors.find(a => a.id === id);
    }

    saveAuthor(authorData) {
        if (authorData.id) {
            const idx = this.data.authors.findIndex(a => a.id === authorData.id);
            if (idx !== -1) {
                this.data.authors[idx] = { ...this.data.authors[idx], ...authorData };
            }
        } else {
            authorData.id = 'author_' + Date.now();
            authorData.posts = [];
            this.data.authors.push(authorData);
        }
        this.save();
        return authorData.id;
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
        if (!author) return;

        if (!author.posts) author.posts = [];

        if (postData.id) {
            const idx = author.posts.findIndex(p => p.id === postData.id);
            if (idx !== -1) {
                author.posts[idx] = { ...author.posts[idx], ...postData };
            }
        } else {
            postData.id = 'post_' + Date.now();
            author.posts.unshift(postData);
        }

        this.save();
    }

    deletePost(authorId, postId) {
        const author = this.getAuthorById(authorId);
        if (!author || !author.posts) return;

        author.posts = author.posts.filter(p => p.id !== postId);
        this.save();
    }

     async exportToEpub() {
        const data = JSON.parse(JSON.stringify(this.data));
        const zip = new JSZip();

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

        // Массивы для генерации content.opf и toc.ncx
        const manifestItems = [
            '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
        ];
        const spineItems = [];
        const navPoints = [];

        let navIndex = 1;

        // Функция очистки спецсимволов XML
        const escapeXml = (str) => (str || '')
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");

        // Перебираем всех авторов
        data.authors.forEach((author, aIdx) => {
            const authorFullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.trim();
            const authorId = `author_${aIdx}`;
            let imageFilename = null;

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

            // Страница автора
            const authorPageHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(authorFullName)}</title>
  <style>
    body { font-family: serif; margin: 5%; text-align: center; }
    img { max-width: 200px; height: auto; border-radius: 4px; margin-bottom: 1em; }
    h1 { margin-bottom: 0.2em; }
    .years { color: #555; font-style: italic; margin-bottom: 2em; }
  </style>
</head>
<body>
  ${imageFilename ? `<img src="images/${imageFilename}" alt="${escapeXml(authorFullName)}"/>` : ''}
  <h1>${escapeXml(authorFullName)}</h1>
  <p class="years" ${hideYears ? 'style="display: none"' : ''}>${author.birthYear || ''} — ${author.deathYear || ''}</p>
</body>
</html>`;

            const authorFileName = `${authorId}.html`;
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

            // Перебираем стихотворения автора
            (author.posts || []).forEach((post, pIdx) => {
                const postId = `post_${aIdx}_${pIdx}`;

                // Форматируем контент (если есть HTML — берем его, иначе разбиваем строки на параграфы)
                let postBody = post.contentHtml;
                if (!postBody && post.content) {
                    postBody = post.content
                        // 1. Разбиваем текст на строфы по двойному переносу строки
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
    .content { line-height: 1.3; }
    .stanza { margin: 0 0 1.2em 0; font-style: normal; }
    .line {display: block; font-style: normal; }
  </style>
</head>
<body>
  <h2>${escapeXml(post.title)}</h2>
  <div class="content">
    ${postBody}
  </div>
  ${post.year ? `<p class="p_year">${post.year}</p>` : ''}
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
            });

            navPoints.push(authorNavPoint);
        });

        // Генерация OEBPS/content.opf
        const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Каталог авторов и стихотворений</dc:title>
    <dc:language>uk</dc:language>
    <dc:identifier id="BookId">urn:uuid:${Date.now()}</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join("\n    ")}
  </spine>
</package>`;

        oebps.file("content.opf", contentOpf);

        // Helper для генерации иерархического NCX (оглавления)
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
    <text>Каталог авторов и стихотворений</text>
  </docTitle>
  <navMap>
    ${navPoints.map(renderNavPoint).join("\n    ")}
  </navMap>
</ncx>`;

        oebps.file("toc.ncx", tocNcx);

        // 3. Генерация архива и вызов скачивания
        const content = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
        saveAs(content, "authors_collection.epub");
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
