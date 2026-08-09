/**
 * Утилита: Сжатие изображения через Canvas в Base64 (JPEG)
 */
function compressImage(file, maxWidth = 300, maxHeight = 300, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * Утилита: Загрузка изображения по URL и конвертация в сжатый Base64
 */
function imageUrlToBase64(url, maxWidth = 300, maxHeight = 300, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            try {
                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            } catch (err) {
                reject(new Error('CORS запрещает сжатие этой картинки на клиенте'));
            }
        };

        img.onerror = () => reject(new Error('Не удалось загрузить изображение по указанному URL'));
    });
}

/**
 * Утилита: Очистка текста от мусорных хвостов сайтов и линков из буфера
 */
function cleanPastedText(text) {
    if (!text) return '';
    console.log('cleanPastedText'); // del
    return text
        // 1. Удаляем приставки источников ("Источник: https://...", "Подробнее: http...", "Взято с: ...")
        .replace(/(?:Источник|Подробнее|Взято с|Read more)?\s*:?\s*https?:\/\/\S+/gi, '')
        // 2. Убираем лишние пустые строки на концах, оставшиеся после вырезания
        .trim();
}

/**
 * Утилита: Парсинг строки ФИО и годов жизни
 */
function parseAuthorText(rawText) {
    console.log('parseAuthorText');
    const result = {
        lastName: '',
        firstName: '',
        surName: '',
        birthYear: null,
        deathYear: null
    };

    if (!rawText || !rawText.trim()) return result;

    // Чистим ссылки и копирайты
    let text = cleanPastedText(rawText);

    // Удаляем знаки ударения (Unicode combining characters)
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');

    // Парсим годы
    const yearsRegex = /(?:\(?\s*(\d{3,4})\s*(?:[\–\—\−\-]\s*(\d{3,4})?)?\s*\)?)/;
    const yearsMatch = text.match(yearsRegex);

    if (yearsMatch) {
        if (yearsMatch[1]) result.birthYear = parseInt(yearsMatch[1], 10);
        if (yearsMatch[2]) result.deathYear = parseInt(yearsMatch[2], 10);
        text = text.replace(yearsRegex, '').trim();
    }

    text = text.replace(/[(),]/g, '').trim();
    const parts = text.split(/\s+/).filter(Boolean);

    if (parts.length >= 1) result.lastName = parts[0];
    if (parts.length >= 2) result.firstName = parts[1];
    if (parts.length >= 3) result.surName = parts.slice(2).join(' ');

    return result;
}

/**
 * 1. STORE: Хранилище данных и CRUD
 */

function extractFirstLine(textOrHtml, isHtml = false) {
    if (!textOrHtml) return 'Без названия';

    let text = textOrHtml;

    if (isHtml) {
        // Временный элемент для очистки HTML-тегов и считывания чистого текста
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = textOrHtml;
        text = tempDiv.textContent || tempDiv.innerText || '';
    }

    // Разбиваем по переносам строк и берем первую непустую
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length > 0) {
        // Обрезаем знаки препинания в конце, если это заголовок
        return lines[0].replace(/[.,;:!?—–\-]+$/, '').trim();
    }

    return 'Без названия';
}

class PoemStore {
    constructor(storageKey = 'stih_app_data') {
        this.storageKey = storageKey;
        this.data = { authors: [] };
        this.selectedAuthorId = null;
    }

    async init() {
        const local = localStorage.getItem(this.storageKey);
        if (local) {
            try {
                this.data = JSON.parse(local);
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
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    }

    getAuthors(searchQuery = '') {
        if (!searchQuery || !searchQuery.trim()) return this.data.authors;

        const q = searchQuery.toLowerCase().trim();

        return this.data.authors.filter(author => {
            // 1. Поиск по ФИО автора
            const fullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.toLowerCase();
            if (fullName.includes(q)) return true;

            // 2. Поиск по стихам автора (заголовок, чистый текст, HTML-текст, примечание)
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
        });
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

    exportJson() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data, null, 2));
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
class PoemUI {
    constructor() {
        this.$authorsList = $('#authorsList');
        this.$authorsCount = $('#authorsCount');
        this.$mainContent = $('#mainContent');

        this.authorModal = new bootstrap.Modal(document.getElementById('authorModal'));
        this.postModal = new bootstrap.Modal(document.getElementById('postModal'));
    }

    renderAuthorsList(authors, selectedId) {
        this.$authorsList.empty();
        this.$authorsCount.text(authors.length);

        if (authors.length === 0) {
            this.$authorsList.html('<div class="p-3 text-muted small">Авторы не найдены</div>');
            return;
        }

        authors.forEach(author => {
            const isActive = author.id === selectedId;
            const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);
            const postsCount = author.posts ? author.posts.length : 0;

            const html = `
        <a href="#" class="list-group-item list-group-item-action author-card ${isActive ? 'active' : ''} d-flex align-items-center gap-3 py-3 border-bottom" data-id="${author.id}">
          <div class="author-avatar-wrapper">
            <img src="${avatar}" class="author-avatar-img" alt="${author.lastName}">
          </div>
          <div class="author-info flex-grow-1 overflow-hidden">
            <h6 class="author-name mb-0 text-truncate">${this.escape(author.lastName)} ${this.escape(author.firstName)}</h6>
            <span class="author-years text-muted">${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'}</span>
          </div>
          <span class="posts-count-badge">${postsCount}</span>
        </a>
      `;
            this.$authorsList.append(html);
        });
    }

    renderAuthorMain(author, searchQuery = '') {
        if (!author) {
            this.$mainContent.html(`
        <div class="text-center text-muted my-5 py-5">
          <span class="display-1">📚</span>
          <h4 class="mt-3">Выберите автора из списка слева или добавьте нового</h4>
        </div>
      `);
            return;
        }

        const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);
        let posts = author.posts || [];

        // Если есть поисковый запрос — фильтруем и подсвечиваем стихи
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            posts = posts.filter(post => {
                const title = (post.title || '').toLowerCase();
                const content = (post.content || '').toLowerCase();
                const contentHtml = (post.contentHtml || '').toLowerCase();
                const note = (post.note || '').toLowerCase();

                return title.includes(q) || content.includes(q) || contentHtml.includes(q) || note.includes(q);
            });
        }

        const postsHtml = posts.length > 0
            ? posts.map(p => this.createPoemCardHtml(p, q)).join('')
            : `<div class="alert alert-light text-center border py-4 text-muted">
          ${searchQuery ? 'В произведениях этого автора совпадений не найдено' : 'У этого автора пока нет сохранённых стихов'}
         </div>`;

        const html = `
      <div class="author-profile-hero card border-0 shadow-sm mb-4">
        <div class="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-4">
          <div class="d-flex align-items-center gap-4">
            <img src="${avatar}" class="hero-avatar-img" alt="${author.lastName}">
            <div>
              <h2 class="hero-author-name mb-1">${this.escape(author.lastName)} ${this.escape(author.firstName)} ${this.escape(author.surName || '')}</h2>
              <div class="hero-author-meta d-flex align-items-center gap-2 text-muted">
                <span>📅 ${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'} гг.</span>
                <span>•</span>
                <span>📖 ${author.posts ? author.posts.length : 0} произведений ${q ? `(найдено: ${posts.length})` : ''}</span>
              </div>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-vintage-outline btn-sm" id="editAuthorBtn">Редактировать автора</button>
            <button class="btn btn-accent btn-sm rounded-pill px-3" id="addPostBtn">+ Добавить стих</button>
          </div>
        </div>
      </div>
      <div class="posts-feed">${postsHtml}</div>
    `;

        this.$mainContent.html(html);
    }

    createPoemCardHtml(post, query = '') {
        let bodyContent = post.contentHtml
            ? post.contentHtml
            : `<pre class="poem-content">${this.escape(post.content)}</pre>`;

        // Вспомогательная подсвечивалка совпадений <mark>
        if (query) {
            const reg = new RegExp(`(${this.escapeRegExp(query)})`, 'gi');
            bodyContent = bodyContent.replace(reg, '<mark class="bg-warning text-dark p-0">$1</mark>');
        }

        const linksHtml = (post.links && post.links.length > 0)
            ? `<div class="poem-links d-flex align-items-center gap-2 flex-wrap pt-2 border-top mt-3">
           <small class="text-muted fw-bold">Ссылки:</small>
           ${post.links.map(l => `<a href="${l.url}" target="_blank" class="poem-link-badge">🔗 ${this.escape(l.title)} ↗</a>`).join('')}
         </div>`
            : '';

        return `
      <article class="poem-card card border-0 shadow-sm mb-4" data-post-id="${post.id}">
        <div class="card-body p-4">
          <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
            <h3 class="poem-title mb-0">${this.escape(post.title)}</h3>
            <div class="d-flex align-items-center gap-2">
              ${post.year ? `<span class="poem-year-tag">${post.year} г.</span>` : ''}
              <button class="btn btn-link text-muted p-0 ms-2 edit-post-btn" data-post-id="${post.id}" title="Редактировать">✏️</button>
            </div>
          </div>
          <div class="poem-text-container my-4">${bodyContent}</div>
          ${post.note ? `<div class="poem-note-box p-3 rounded-3 mb-3"><span class="note-icon">💡</span> ${this.escape(post.note)}</div>` : ''}
          ${linksHtml}
        </div>
      </article>
    `;
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    openAuthorModal(author = null) {
        $('#authorForm')[0].reset();
        $('#authorId').val('');
        $('#authorPhotoBase64').val('');
        $('#authorPhotoUrlInput').val('');
        $('#photoModeFile').prop('checked', true).trigger('change');

        const defaultPlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23d8c8b8'/><text x='50%' y='55%' font-size='35' text-anchor='middle' dominant-baseline='middle' fill='%235c4a3e'>📷</text></svg>";

        if (author) {
            $('#authorModalLabel').text('Редактировать автора');
            $('#authorId').val(author.id);
            $('#authorLastName').val(author.lastName);
            $('#authorFirstName').val(author.firstName);
            $('#authorSurName').val(author.surName || '');
            $('#authorBirthYear').val(author.birthYear || '');
            $('#authorDeathYear').val(author.deathYear || '');

            if (author.photo) {
                $('#authorPhotoBase64').val(author.photo);
                $('#authorPhotoPreview').attr('src', author.photo);
                $('#removePhotoBtn').removeClass('d-none');
            } else {
                $('#authorPhotoPreview').attr('src', defaultPlaceholder);
                $('#removePhotoBtn').addClass('d-none');
            }

            $('#deleteAuthorBtn').removeClass('d-none');
        } else {
            $('#authorModalLabel').text('Добавить автора');
            $('#authorPhotoPreview').attr('src', defaultPlaceholder);
            $('#removePhotoBtn').addClass('d-none');
            $('#deleteAuthorBtn').addClass('d-none');
        }

        this.authorModal.show();
    }

    closeAuthorModal() {
        this.authorModal.hide();
    }

    openPostModal(post = null) {
        $('#postForm')[0].reset();
        $('#postId').val('');
        $('#linksListContainer').empty();

        if (post) {
            $('#postModalLabel').text('Редактировать произведение');
            $('#postId').val(post.id);
            $('#postTitle').val(post.title);
            $('#postYear').val(post.year || '');
            $('#postNote').val(post.note || '');

            if (post.contentHtml) {
                $('#useHtmlToggle').prop('checked', true);
                $('#plainTextContainer').addClass('d-none');
                $('#htmlTextContainer').removeClass('d-none');
                $('#postContentHtml').val(post.contentHtml);
                $('#postContent').val('');
            } else {
                $('#useHtmlToggle').prop('checked', false);
                $('#plainTextContainer').removeClass('d-none');
                $('#htmlTextContainer').addClass('d-none');
                $('#postContent').val(post.content || '');
                $('#postContentHtml').val('');
            }

            if (post.links && post.links.length > 0) {
                post.links.forEach(l => this.addLinkRow(l.title, l.url));
            }

            $('#deletePostBtn').removeClass('d-none');
        } else {
            $('#postModalLabel').text('Добавить произведение');
            $('#useHtmlToggle').prop('checked', false);
            $('#plainTextContainer').removeClass('d-none');
            $('#htmlTextContainer').addClass('d-none');
            $('#deletePostBtn').addClass('d-none');
        }

        this.postModal.show();
    }

    closePostModal() {
        this.postModal.hide();
    }

    addLinkRow(title = '', url = '') {
        const rowHtml = `
      <div class="link-row d-flex gap-2 align-items-center">
        <input type="text" class="form-control form-control-sm link-title-input" placeholder="Название (напр. Википедия)" value="${this.escape(title)}">
        <input type="url" class="form-control form-control-sm link-url-input" placeholder="https://..." value="${this.escape(url)}">
        <button type="button" class="btn btn-outline-danger btn-sm remove-link-btn py-0 px-2">✕</button>
      </div>
    `;
        $('#linksListContainer').append(rowHtml);
    }

    getInitialsAvatar(name) {
        const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
        return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23d8c8b8'/><text x='50%' y='55%' font-size='35' text-anchor='middle' dominant-baseline='middle' fill='%235c4a3e'>${initials || '?'}</text></svg>`;
    }

    escape(str) {
        if (!str) return '';
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
}

/**
 * 3. CONTROLLER: Обработка событий
 */
class PoemApp {
    constructor() {
        this.store = new PoemStore();
        this.ui = new PoemUI();
    }

    async init() {
        await this.store.init();
        this.bindEvents();
        this.refresh();
    }

    refresh() {
        const searchQuery = $('#searchInput').val();
        const authors = this.store.getAuthors(searchQuery);

        if (!this.store.selectedAuthorId && authors.length > 0) {
            this.store.selectedAuthorId = authors[0].id;
        }

        // Если текущий выбранный автор не попал в результаты поиска, переключаемся на первого найденного
        if (searchQuery && !authors.some(a => a.id === this.store.selectedAuthorId) && authors.length > 0) {
            this.store.selectedAuthorId = authors[0].id;
        }

        this.ui.renderAuthorsList(authors, this.store.selectedAuthorId);

        const currentAuthor = this.store.getAuthorById(this.store.selectedAuthorId);
        this.ui.renderAuthorMain(currentAuthor, searchQuery);
    }
    
    bindEvents() {
        // Переключение автора в списке
        $(document).on('click', '.author-card', (e) => {
            e.preventDefault();
            const id = $(e.currentTarget).data('id');
            this.store.selectedAuthorId = id;
            this.refresh();
        });

        // Поиск
        $('#searchInput').on('input', () => this.refresh());

        // --- События Автора ---
        $('#addAuthorBtn').on('click', () => {
            this.ui.openAuthorModal();
        });

        $(document).on('click', '#editAuthorBtn', () => {
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) this.ui.openAuthorModal(author);
        });

        // 📋 ПАРСИНГ ИЗ БУФЕРА ОБМЕНА
        $('#parseClipboardBtn').on('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text) {
                    alert('Буфер обмена пуст!');
                    return;
                }

                const parsed = parseAuthorText(text);

                if (parsed.lastName) $('#authorLastName').val(parsed.lastName);
                if (parsed.firstName) $('#authorFirstName').val(parsed.firstName);
                if (parsed.surName) $('#authorSurName').val(parsed.surName);
                if (parsed.birthYear) $('#authorBirthYear').val(parsed.birthYear);
                if (parsed.deathYear) $('#authorDeathYear').val(parsed.deathYear);

            } catch (err) {
                alert('Не удалось прочитать буфер обмена. Разрешите доступ к буферу в браузере.');
            }
        });

        // Переключение источника фото (Файл / URL / Буфер)
        $('input[name="photoSourceMode"]').on('change', (e) => {
            const mode = $(e.target).val();

            $('#photoFileInputContainer').toggleClass('d-none', mode !== 'file');
            $('#photoUrlInputContainer').toggleClass('d-none', mode !== 'url');
            $('#photoBufferInputContainer').toggleClass('d-none', mode !== 'buffer');
        });

        // 📋 Загрузка изображения из буфера обмена
        $('#pastePhotoFromBufferBtn').on('click', async () => {
            try {
                if (!navigator.clipboard || !navigator.clipboard.read) {
                    alert('Ваш браузер не поддерживает чтение файлов из буфера обмена.');
                    return;
                }

                const items = await navigator.clipboard.read();
                let imageFile = null;

                for (const item of items) {
                    // Ищем тип, начинающийся с image/ (image/png, image/jpeg и т.д.)
                    const imageType = item.types.find(type => type.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        imageFile = new File([blob], 'clipboard_image.png', { type: imageType });
                        break;
                    }
                }

                if (!imageFile) {
                    alert('В буфере обмена нет изображения! Скопируйте картинку или скриншот.');
                    return;
                }

                // Используем готовую функцию сжатия
                const compressedBase64 = await compressImage(imageFile, 300, 300, 0.8);
                $('#authorPhotoBase64').val(compressedBase64);
                $('#authorPhotoPreview').attr('src', compressedBase64);
                $('#removePhotoBtn').removeClass('d-none');

            } catch (err) {
                console.error(err);
                alert('Не удалось прочитать изображение из буфера. Убедитесь, что разрешили доступ к буферу в браузере.');
            }
        });

        // Автоматическая вставка картинки по Ctrl+V внутри модалки автора
        $('#authorModal').on('paste', async (e) => {
            const clipboardData = e.originalEvent.clipboardData;
            if (!clipboardData || !clipboardData.items) return;

            for (let i = 0; i < clipboardData.items.length; i++) {
                const item = clipboardData.items[i];
                if (item.type.indexOf('image') !== -1) {
                    e.preventDefault(); // Предотвращаем стандартную вставку

                    const file = item.getAsFile();
                    if (file) {
                        try {
                            const compressedBase64 = await compressImage(file, 300, 300, 0.8);
                            $('#authorPhotoBase64').val(compressedBase64);
                            $('#authorPhotoPreview').attr('src', compressedBase64);
                            $('#removePhotoBtn').removeClass('d-none');

                            // Включаем радиобаттон "Буфер" для визуального подтверждения
                            $('#photoModeBuffer').prop('checked', true).trigger('change');
                        } catch (err) {
                            alert('Ошибка сжатия изображения из буфера');
                        }
                    }
                    break;
                }
            }
        });

        $('#authorModal').on('shown.bs.modal', () => {
            $('#authorLastName').focus();
        });

        // 🔗 Загрузка фото по URL
        $('#loadPhotoFromUrlBtn').on('click', async () => {
            const url = $('#authorPhotoUrlInput').val().trim();
            if (!url) {
                alert('Введите URL картинки!');
                return;
            }

            const $btn = $('#loadPhotoFromUrlBtn');
            $btn.prop('disabled', true).text('Загрузка...');

            try {
                const compressedBase64 = await imageUrlToBase64(url, 300, 300, 0.8);
                $('#authorPhotoBase64').val(compressedBase64);
                $('#authorPhotoPreview').attr('src', compressedBase64);
                $('#removePhotoBtn').removeClass('d-none');
            } catch (err) {
                alert('Ошибка загрузки по URL: ' + err.message);
            } finally {
                $btn.prop('disabled', false).text('Загрузить');
            }
        });

        // 1. Двойной клик по аватарке в главном профиле автора (Hero-секция)
        $(document).on('dblclick', '.hero-avatar-img', () => {
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) {
                this.ui.openAuthorModal(author);
            }
        });

// 2. (Опционально) Двойной клик по аватарке автора в левом списке
        $(document).on('dblclick', '.author-avatar-img', (e) => {
            e.stopPropagation(); // Предотвращаем лишние срабатывания
            const authorId = $(e.currentTarget).closest('.author-card').data('id');
            const author = this.store.getAuthorById(authorId);
            if (author) {
                this.store.selectedAuthorId = authorId;
                this.refresh();
                this.ui.openAuthorModal(author);
            }
        });

        // Удаление фото в модалке
        $('#removePhotoBtn').on('click', () => {
            $('#authorPhotoInput').val('');
            $('#authorPhotoUrlInput').val('');
            $('#authorPhotoBase64').val('');
            const defaultPlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23d8c8b8'/><text x='50%' y='55%' font-size='35' text-anchor='middle' dominant-baseline='middle' fill='%235c4a3e'>📷</text></svg>";
            $('#authorPhotoPreview').attr('src', defaultPlaceholder);
            $('#removePhotoBtn').addClass('d-none');
        });

        // Сохранение формы автора
        $('#authorForm').on('submit', (e) => {
            e.preventDefault();

            const authorData = {
                id: $('#authorId').val() || null,
                lastName: $('#authorLastName').val().trim(),
                firstName: $('#authorFirstName').val().trim(),
                surName: $('#authorSurName').val().trim(),
                birthYear: $('#authorBirthYear').val() ? parseInt($('#authorBirthYear').val(), 10) : null,
                deathYear: $('#authorDeathYear').val() ? parseInt($('#authorDeathYear').val(), 10) : null,
                photo: $('#authorPhotoBase64').val() || ''
            };

            const newId = this.store.saveAuthor(authorData);
            this.store.selectedAuthorId = newId;
            this.ui.closeAuthorModal();
            this.refresh();
        });

        // Удаление автора
        $('#deleteAuthorBtn').on('click', () => {
            const authorId = $('#authorId').val();
            if (!authorId) return;

            if (confirm('Вы уверены, что хотите удалить автора и все его произведения?')) {
                this.store.deleteAuthor(authorId);
                this.ui.closeAuthorModal();
                this.refresh();
            }
        });

        // --- События Стиха ---
        $(document).on('click', '#addPostBtn', () => {
            if (!this.store.selectedAuthorId) {
                alert('Сначала выберите или создайте автора!');
                return;
            }
            this.ui.openPostModal();
        });

        $(document).on('click', '.edit-post-btn', (e) => {
            const postId = $(e.currentTarget).data('post-id');
            const post = this.store.getPostById(this.store.selectedAuthorId, postId);
            if (post) this.ui.openPostModal(post);
        });

        // Переключение тумблера HTML
        $('#useHtmlToggle').on('change', (e) => {
            const isHtml = $(e.target).is(':checked');
            if (isHtml) {
                $('#plainTextContainer').addClass('d-none');
                $('#htmlTextContainer').removeClass('d-none');
            } else {
                $('#plainTextContainer').removeClass('d-none');
                $('#htmlTextContainer').addClass('d-none');
            }
        });

        // Добавление / удаление строк ссылок
        $('#addLinkRowBtn').on('click', () => this.ui.addLinkRow());
        $(document).on('click', '.remove-link-btn', (e) => {
            $(e.currentTarget).closest('.link-row').remove();
        });

        // Сохранение формы стиха
// Сохранение формы стиха
        $('#postForm').on('submit', (e) => {
            e.preventDefault();

            const isHtml = $('#useHtmlToggle').is(':checked');
            const contentText = $('#postContent').val().trim();
            const contentHtml = $('#postContentHtml').val().trim();

            if (!isHtml && !contentText) {
                alert('Заполните текст произведения!');
                return;
            }

            if (isHtml && !contentHtml) {
                alert('Заполните HTML код произведения!');
                return;
            }

            // Если название не заполнено — парсим первую строку из текста
            let title = $('#postTitle').val().trim();
            if (!title) {
                title = extractFirstLine(isHtml ? contentHtml : contentText, isHtml);
            }

            const links = [];
            $('#linksListContainer .link-row').each((_, el) => {
                const titleLink = $(el).find('.link-title-input').val().trim();
                const url = $(el).find('.link-url-input').val().trim();
                if (url) {
                    links.push({ title: titleLink || url, url: url });
                }
            });

            const postData = {
                id: $('#postId').val() || null,
                title: title,
                year: $('#postYear').val() ? parseInt($('#postYear').val(), 10) : null,
                note: $('#postNote').val().trim(),
                links: links
            };

            if (isHtml) {
                postData.contentHtml = contentHtml;
                postData.content = '';
            } else {
                postData.content = contentText;
                postData.contentHtml = '';
            }

            this.store.savePost(this.store.selectedAuthorId, postData);
            this.ui.closePostModal();
            this.refresh();
        });

        // Удаление стиха
        $('#deletePostBtn').on('click', () => {
            const postId = $('#postId').val();
            if (!postId) return;

            if (confirm('Удалить это произведение?')) {
                this.store.deletePost(this.store.selectedAuthorId, postId);
                this.ui.closePostModal();
                this.refresh();
            }
        });

        // --- Экспорт / Импорт ---
        $('#exportBtn').on('click', () => this.store.exportJson());
        $('#importBtn').on('click', () => $('#importFileInput').click());

        $('#importFileInput').on('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    this.store.importJson(json);
                    this.refresh();
                } catch (err) {
                    alert('Ошибка чтения файла JSON');
                }
            };
            reader.readAsText(file);
        });

        // Селектор всех инпутов и текстовых областей в модалках автора и стиха
        const $modalFields = $('#authorModal input[type="text"], #authorModal textarea, #postModal input[type="text"], #postModal textarea');

        // Перехват прямой вставки из буфера (Ctrl+V или правый клик -> Вставить)
        $modalFields.on('paste', function(e) {
            const clipboardData = e.originalEvent.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            const pastedText = clipboardData.getData('text/plain');

            // Если в тексте есть ссылки или слово "Источник"
            if (pastedText && /(?:https?:\/\/|Источник|Подробнее)/i.test(pastedText)) {
                e.preventDefault(); // Отменяем стандартное вставление

                const cleaned = cleanPastedText(pastedText);

                // Вставляем очищенный текст в текущую позицию курсора
                const input = this;
                const start = input.selectionStart || 0;
                const end = input.selectionEnd || 0;
                const currentVal = $(input).val();

                const newVal = currentVal.substring(0, start) + cleaned + currentVal.substring(end);
                $(input).val(newVal);

                // Возвращаем курсор в конец вставленного текста
                const newCursorPos = start + cleaned.length;
                input.setSelectionRange(newCursorPos, newCursorPos);

                // Генерируем событие input для корректной работы реактивных обработчиков
                $(input).trigger('input');
            }
        });
    }
}

// Старт
$(document).ready(() => {
    window.app = new PoemApp();
    window.app.init();
});