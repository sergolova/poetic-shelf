class PoemApp {
    constructor() {
        this.store = new PoemStore();
        this.ui = new PoemUI();
    }

    async init() {
        await this.store.init();
        this.bindEvents();
        this.toggleClearButton();
        this.applySort();
        this.applyFontSize();
        this.refresh();
    }

    applyFontSize() {
        const fontSize = localStorage.getItem('fontSize') || 'normal';
        $('body').removeClass('font-small font-normal font-large').addClass(`font-${fontSize}`);
        $(`input[name="fontSize"][value="${fontSize}"]`).prop('checked', true);
    }

    applySort() {
        $(`input[name="authorSort"][value="${this.store.authorSortMode}"]`).prop('checked', true);
    }

    toggleClearButton() {
        const hasValue = $('#searchInput').val().trim().length > 0;
        $('#clearSearchBtn').toggleClass('d-none', !hasValue);
    }

    refresh() {
        const searchQuery = $('#searchInput').val();
        const authors = this.store.getAuthors(searchQuery);
        const prevSearchQuery = this._prevSearchQuery || '';
        const searchChanged = searchQuery !== prevSearchQuery;
        this._prevSearchQuery = searchQuery;

        if (!this.store.selectedAuthorId && authors.length > 0) {
            this.store.selectedAuthorId = authors[0].id;
        }

        if (searchQuery && !authors.some(a => a.id === this.store.selectedAuthorId) && authors.length > 0) {
            this.store.selectedAuthorId = authors[0].id;
        }

        if (searchChanged && searchQuery && searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            let firstFoundPostId = null;
            
            for (const author of authors) {
                if (author.posts && author.posts.length > 0) {
                    const foundPost = author.posts.find(post => {
                        const title = (post.title || '').toLowerCase();
                        const content = (post.content || '').toLowerCase();
                        const contentHtml = (post.contentHtml || '').toLowerCase();
                        const note = (post.note || '').toLowerCase();
                        return title.includes(q) || content.includes(q) || contentHtml.includes(q) || note.includes(q);
                    });
                    if (foundPost) {
                        firstFoundPostId = foundPost.id;
                        this.store.selectedAuthorId = author.id;
                        break;
                    }
                }
            }
            
            if (firstFoundPostId) {
                this.store.selectedPostId = firstFoundPostId;
            } else {
                this.store.selectedPostId = null;
            }
        }

        // При очистке поиска сбрасываем selectedPostId
        if (searchChanged && (!searchQuery || !searchQuery.trim())) {
            this.store.selectedPostId = null;
        }

        this.ui.renderAuthorsList(authors, this.store.selectedAuthorId, this.store.selectedPostId, searchQuery);

        // Плавное раскрытие списка произведений
        $('.author-posts-list').slideDown(250);

        const currentAuthor = this.store.getAuthorById(this.store.selectedAuthorId);
        this.ui.renderAuthorMain(currentAuthor, searchQuery, this.store.selectedPostId);
    }
    
    bindEvents() {
        // Переключение автора в списке
        $(document).on('click', '.author-card', (e) => {
            e.preventDefault();
            const id = $(e.currentTarget).data('id');
            this.store.selectedAuthorId = id;
            this.store.selectedPostId = null;
            this.store.markAsViewed(id);
            this.refresh();
        });

        // Сортировка авторов
        $(document).on('change', 'input[name="authorSort"]', (e) => {
            this.store.authorSortMode = $(e.target).val();
            this.store.save();
            this.refresh();
        });

        // Размер шрифта
        $(document).on('change', 'input[name="fontSize"]', (e) => {
            const fontSize = $(e.target).val();
            localStorage.setItem('fontSize', fontSize);
            this.applyFontSize();
        });

        // Клик по списку произведений в сайдбаре
        $(document).on('click', '.author-post-item', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const postId = $(e.currentTarget).data('post-id');
            
            // Получаем автора, которому принадлежит этот стих
            const $authorCard = $(e.currentTarget).closest('.author-card-wrapper').find('.author-card');
            const authorId = $authorCard.data('id');
            
            // Переключаемся на этого автора
            if (authorId) {
                this.store.selectedAuthorId = authorId;
                this.store.markAsViewed(authorId);
            }
            
            this.store.selectedPostId = postId || null;
            this.refresh();
        });

        // Поиск
        $('#searchInput').on('input', () => {
            this.refresh();
            this.toggleClearButton();
        });

        // Выделение всего текста при фокусе на поле поиска
        $('#searchInput').on('focus', function() {
            $(this).select();
        });

        // Очистка поиска
        $('#clearSearchBtn').on('click', () => {
            $('#searchInput').val('').trigger('input').focus();
        });

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
                let text = await navigator.clipboard.readText();
                if (!text) {
                    alert('Буфер обмена пуст!');
                    return;
                }

                // Нормализуем Unicode (приводим составные символы к единым)
                text = normalizeUnicode(text);

                const parsed = parseAuthorText(text);
                
                // Сохраняем исходные части для перераспределения
                $('#authorForm').data('parsedParts', parsed.parts);
                
                const order = $('input[name="nameOrder"]:checked').val();
                const distributed = distributeNameParts(parsed.parts, order);

                if (distributed.lastName) $('#authorLastName').val(distributed.lastName);
                if (distributed.firstName) $('#authorFirstName').val(distributed.firstName);
                if (distributed.surName) $('#authorSurName').val(distributed.surName);
                if (parsed.birthYear) $('#authorBirthYear').val(parsed.birthYear);
                if (parsed.deathYear) $('#authorDeathYear').val(parsed.deathYear);

            } catch (err) {
                alert('Не удалось прочитать буфер обмена. Разрешите доступ к буферу в браузере.');
            }
        });

        // Переключатель порядка ФИО — перераспределяет значения из исходных parts
        $(document).on('change', 'input[name="nameOrder"]', () => {
            const parts = $('#authorForm').data('parsedParts');
            if (!parts || parts.length === 0) return;
            
            const order = $('input[name="nameOrder"]:checked').val();
            const distributed = distributeNameParts(parts, order);
            
            $('#authorLastName').val(distributed.lastName);
            $('#authorFirstName').val(distributed.firstName);
            $('#authorSurName').val(distributed.surName);
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
                birthYear: cleanNumericValue($('#authorBirthYear').val()) ? parseInt(cleanNumericValue($('#authorBirthYear').val()), 10) : null,
                deathYear: cleanNumericValue($('#authorDeathYear').val()) ? parseInt(cleanNumericValue($('#authorDeathYear').val()), 10) : null,
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
            this.ui.openPostModal(null, this.store.selectedAuthorId, this.store.data.authors);
        });

        $(document).on('click', '.edit-post-btn', (e) => {
            const postId = $(e.currentTarget).data('post-id');
            // Ищем пост у всех авторов
            let post = null;
            let postAuthorId = null;
            for (const author of this.store.data.authors) {
                const found = author.posts?.find(p => p.id === postId);
                if (found) {
                    post = found;
                    postAuthorId = author.id;
                    break;
                }
            }
            if (post) {
                post.authorId = postAuthorId;
                this.ui.openPostModal(post, this.store.selectedAuthorId, this.store.data.authors);
            }
        });

        // Поиск автора в модалке произведения
        $(document).on('input', '#postAuthorSearch', () => {
            const query = $('#postAuthorSearch').val();
            this.ui.renderAuthorSearchDropdown(this.store.data.authors, query);
        });

        // Выделение всего текста при фокусе на поле автора
        $(document).on('focus', '#postAuthorSearch', function() {
            $(this).select();
        });

        // Клик по элементу списка авторов
        $(document).on('click', '.author-search-item', (e) => {
            const authorId = $(e.currentTarget).data('author-id');
            const author = this.store.getAuthorById(authorId);
            if (author) {
                $('#postAuthorId').val(author.id);
                $('#postAuthorSearch').val(`${author.lastName} ${author.firstName}`);
                $('#authorSearchDropdown').addClass('d-none');
            }
        });

        // Скрыть dropdown при клике вне его
        $(document).on('click', (e) => {
            if (!$(e.target).closest('.author-search-wrapper').length) {
                $('#authorSearchDropdown').addClass('d-none');
            }
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
        $('#addLinkRowBtn').on('click', () => this.ui.addLinkRow('', '', true));
        $(document).on('click', '.remove-link-btn', (e) => {
            $(e.currentTarget).closest('.link-row').remove();
        });

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

            // Проверяем что выбран автор
            const authorId = $('#postAuthorId').val();
            if (!authorId) {
                alert('Выберите автора!');
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
                year: cleanNumericValue($('#postYear').val()) ? parseInt(cleanNumericValue($('#postYear').val()), 10) : null,
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

            // Сохраняем пост к выбранному автору
            this.store.savePost(authorId, postData);
            
            // Если автор изменился, удаляем пост у старого автора
            const originalPostId = $('#postId').val();
            if (originalPostId) {
                // Ищем пост у других авторов и удаляем
                for (const author of this.store.data.authors) {
                    if (author.id !== authorId && author.posts) {
                        const postIdx = author.posts.findIndex(p => p.id === originalPostId);
                        if (postIdx !== -1) {
                            author.posts.splice(postIdx, 1);
                            this.store.save();
                            break;
                        }
                    }
                }
            }
            
            this.ui.closePostModal();
            this.refresh();
        });

        // Удаление стиха
        $('#deletePostBtn').on('click', () => {
            const postId = $('#postId').val();
            const authorId = $('#postAuthorId').val();
            if (!postId || !authorId) return;

            if (confirm('Удалить это произведение?')) {
                this.store.deletePost(authorId, postId);
                this.ui.closePostModal();
                this.refresh();
            }
        });

        // --- RAND (Случайное произведение) ---
        $('#randBtn').on('click', () => {
            // Собираем все произведения всех авторов в плоский массив для равномерного распределения
            const allPosts = [];
            for (const author of this.store.data.authors) {
                if (author.posts && author.posts.length > 0) {
                    author.posts.forEach(post => {
                        allPosts.push({ post, authorId: author.id });
                    });
                }
            }

            if (allPosts.length === 0) {
                alert('Нет ни одного произведения!');
                return;
            }

            const random = allPosts[Math.floor(Math.random() * allPosts.length)];
            this.store.selectedAuthorId = random.authorId;
            this.store.selectedPostId = random.post.id;
            this.store.markAsViewed(random.authorId);
            this.refresh();
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
            if (pastedText) {
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
