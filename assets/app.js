/**
 * ==========================================================================
 * assets/app.js
 * Главный класс приложения (PoemApp). Координирует PoemStore, PoemUI
 * и TimelineBar, управляет инициализацией, обновлением и всеми событиями.
 * ==========================================================================
 */

class PoemApp {
    /* ==========================================================================
       1. Конструктор и Инициализация / Constructor & Init
       ========================================================================== */

    constructor() {
        this.store = new PoemStore();
        this.ui = new PoemUI();
        this.titleChangeInterval = null;
        this.searchTimer = null;
        this.poemResizeObserver = null;
        this._prevSearchQuery = '';
    }

    /**
     * Основной метод инициализации приложения.
     */
    async init() {
        await this.store.init();

        // Восстанавливаем последнее выбранное состояние из localStorage
        this.store.selectedPostId = localStorage.getItem('selectedPostId') ?? null;
        this.store.selectedAuthorId = localStorage.getItem('selectedAuthorId') ?? null;

        // Применяем настройки внешнего вида
        this.updateTheme();
        this.applyFontSize();
        this.applyColumns();
        this.applyAuthorsSort();
        this.applySidebarWidth();
        this.applyRandomPoeticTitle();
        this.resetTitleChangeTimer();
        this.toggleClearButton();
        this.store.updateExportWarningStatus();

        // Инициализируем временную шкалу
        this.timeline = new TimelineBar('timeline-bar', this.store, {
            onPostClick: (postId) => {
                this.resetSearchQuery();
                let a;
                for (const author of this.store.data.authors) {
                    const found = author.posts?.find(p => p.id === postId);
                    if (found) {
                        a = author;
                        this.store.selectedAuthorId = author.id;
                        this.store.markAsViewed(author.id);
                        break;
                    }
                }
                this.store.selectedPostId = postId;
                this.refresh();
                scrollPostToView(a?.id, postId);
            }
        });

        // Привязываем все события
        this.bindEvents();

        // Первый рендер
        this.refresh(true);
    }


    /* ==========================================================================
       2. Рендеринг и Обновление интерфейса / Rendering & UI Refresh
       ========================================================================== */

    /**
     * Полное обновление интерфейса: список авторов, тайм-бар, главная область.
     * @param {boolean} animate - Включить анимацию списка постов.
     */
    refresh(animate = true) {
        let searchQuery = $('#searchInput').val();
        searchQuery = window.convertEngToRus(searchQuery);

        const authors = this.store.getAuthors(searchQuery);
        const prevSearchQuery = this._prevSearchQuery || '';
        const searchChanged = searchQuery !== prevSearchQuery;
        this._prevSearchQuery = searchQuery;

        // Выбираем первого автора по умолчанию
        if (!this.store.selectedAuthorId && authors.length > 0) {
            this.store.selectedAuthorId = authors[0].id;
        }

        // Если выбранный автор не в результатах поиска — переключаемся на первого
        if (searchQuery && !authors.some(a => a.id === this.store.selectedAuthorId) && authors.length > 0) {
            this.store.selectedAuthorId = authors[0].id;
        }

        // При изменении поиска — выбираем первое совпавшее произведение
        if (searchChanged && searchQuery && searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            let firstFoundPostId = null;

            for (const author of authors) {
                if (author.posts && author.posts.length > 0) {
                    const foundPost = author.posts.find(post => isPostMatch(post, q));
                    if (foundPost) {
                        firstFoundPostId = foundPost.id;
                        this.store.selectedAuthorId = author.id;
                        break;
                    }
                }
            }

            this.store.selectedPostId = firstFoundPostId || null;
        }

        // При очистке поиска — сбрасываем выбранное произведение
        if (searchChanged && (!searchQuery || !searchQuery.trim())) {
            this.store.selectedPostId = null;
        }

        // Рендерим список авторов в сайдбаре
        this.ui.renderAuthorsList(authors, this.store.selectedAuthorId, this.store.selectedPostId, searchQuery);

        if (animate) {
            $('.author-posts-list').slideDown(250);
        } else {
            $('.author-posts-list').show();
        }

        // Рендерим тайм-бар
        const allPosts = [];
        for (const author of this.store.data.authors) {
            if (author.posts) {
                for (const post of author.posts) {
                    allPosts.push({ ...post, authorId: author.id });
                }
            }
        }
        this.timeline.render(allPosts, this.store.selectedAuthorId, authors, this.store.selectedPostId);

        // Рендерим главную область
        const currentAuthor = this.store.getAuthorById(this.store.selectedAuthorId);
        this.ui.renderAuthorMain(currentAuthor, searchQuery, this.store.selectedPostId);

        this.applyColumns();
        this.initPoemLineBreakMarkers();

        // Сохраняем текущее состояние в localStorage
        if (this.store.selectedPostId) {
            localStorage.setItem('selectedPostId', this.store.selectedPostId);
        } else {
            localStorage.removeItem('selectedPostId');
        }
        if (this.store.selectedAuthorId) {
            localStorage.setItem('selectedAuthorId', this.store.selectedAuthorId);
        } else {
            localStorage.removeItem('selectedAuthorId');
        }
    }

    /**
     * Обновляет иконку закладки в сайдбаре для конкретного поста.
     */
    updateSidebarBookmarkIcon(postId, isBookmarked) {
        const $postItem = $(`.author-post-item[data-post-id="${postId}"]`);
        if (!$postItem.length) return;

        const $titleSpan = $postItem.find('.author-post-title');
        $titleSpan.find('.bookmark-icon').remove();

        if (isBookmarked) {
            $titleSpan.append(this.ui.renderBookmarkIcon(postId, true));
        }
    }


    /* ==========================================================================
       3. Применение Настроек / Settings Appliers
       ========================================================================== */

    /**
     * Инициализирует тему оформления (тёмная/светлая) и обработчик её переключения.
     */
    updateTheme() {
        const $themeBtn = $('#themeToggleBtn');
        const $themeIcon = $('#themeIcon');

        const setTheme = (theme) => {
            if (theme === 'dark') {
                $('body').attr('data-theme', 'dark');
                $themeIcon.text('☀️');
                localStorage.setItem('appTheme', 'dark');
            } else {
                $('body').removeAttr('data-theme');
                $themeIcon.text('🌙');
                localStorage.setItem('appTheme', 'light');
            }
        };

        const savedTheme = localStorage.getItem('appTheme') ||
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTheme(savedTheme);

        $themeBtn.on('click', function () {
            const currentTheme = $('body').attr('data-theme') === 'dark' ? 'dark' : 'light';
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    /**
     * Применяет сохранённый размер шрифта.
     */
    applyFontSize() {
        const fontSize = localStorage.getItem('fontSize') || 'normal';
        $('body').removeClass('font-small font-normal font-large').addClass(`font-${fontSize}`);
        $(`input[name="fontSize"][value="${fontSize}"]`).prop('checked', true);
    }

    /**
     * Применяет сохранённую ширину сайдбара.
     */
    applySidebarWidth() {
        const $sidebar = $('.authors-sidebar');
        const savedWidth = this.store.loadSidebar();
        if (Number.isFinite(savedWidth)) {
            $sidebar.css('flex-basis', `${savedWidth}px`);
        }
    }

    /**
     * Устанавливает галочку у текущего режима сортировки авторов.
     */
    applyAuthorsSort() {
        $(`input[name="authorSort"][value="${this.store.authorSortMode}"]`).prop('checked', true);
    }

    /**
     * Применяет сохранённое количество колонок к карточкам стихов.
     * Автоматически выбирает оптимальное количество исходя из длины произведения.
     */
    applyColumns() {
        const maxColumns = parseInt(localStorage.getItem('columns'), 10) || 1;

        $('.poem-card').each((index, card) => {
            const $content = $(card).find('.poem-content');
            if (!$content.length) return;

            $content.removeClass('cols-1 cols-2 cols-3 cols-4');

            const text = $content.text().trim();
            const lineCount = text ? text.split('\n').length : 0;

            let targetCols;
            if (lineCount > 50) {
                targetCols = 4;
            } else if (lineCount > 32) {
                targetCols = 3;
            } else if (lineCount >= 16) {
                targetCols = 2;
            } else {
                targetCols = 1;
            }

            const finalCols = Math.min(targetCols, maxColumns);
            $content.addClass(`cols-${finalCols}`);
        });
    }

    /**
     * Применяет случайный заголовок и подзаголовок из массива.
     */
    applyRandomPoeticTitle() {
        const title = this.randomFromArray(window.poeticTitles || [], 'poeticTitleIndex');
        const subtitle = this.randomFromArray(window.poeticSubtitles || [], 'poeticSubtitleIndex');

        this.rollText($('.brand-title'), title, 500);
        this.rollText($('.small-subtitle'), subtitle, 500);
    }


    /* ==========================================================================
       4. Вспомогательные методы / Utility Methods
       ========================================================================== */

    /**
     * Выбирает случайный элемент из массива, избегая повторного выбора предыдущего.
     */
    randomFromArray(array, storageKey) {
        const previous = localStorage.getItem(storageKey);
        let index;

        do {
            index = Math.floor(Math.random() * array.length);
        } while (array.length > 1 && String(index) === previous);

        localStorage.setItem(storageKey, index);
        return array[index];
    }

    /**
     * Сбрасывает строку поиска.
     */
    resetSearchQuery() {
        $('#searchInput').val('');
        $('.btn-clear-search').addClass('d-none');
        this._prevSearchQuery = '';
    }

    /**
     * Показывает/скрывает кнопку очистки поиска.
     */
    toggleClearButton() {
        const hasValue = $('#searchInput').val().trim().length > 0;
        $('#clearSearchBtn').toggleClass('d-none', !hasValue);
    }

    /**
     * Перезапускает таймер автоматической смены заголовка приложения.
     */
    resetTitleChangeTimer() {
        clearInterval(this.titleChangeInterval);
        this.titleChangeInterval = setInterval(() => {
            this.applyRandomPoeticTitle();
        }, 30000);
    }

    /**
     * Анимация «прокрутки» текста (fade up/down) для заголовков.
     */
    rollText($el, targetText, duration = 500) {
        if (!$el || !$el.length) return;

        const halfDuration = duration / 2;

        // Фаза 1: уводим старый текст вверх с затуханием
        $el.css({
            transition: `transform ${halfDuration}ms ease-in, opacity ${halfDuration}ms ease-in`,
            transform: 'translateY(-10px)',
            opacity: 0
        });

        setTimeout(() => {
            // Меняем текст и сбрасываем позицию вниз без анимации
            $el.text(targetText).css({
                transition: 'none',
                transform: 'translateY(10px)'
            });

            // Принудительный reflow для применения сброса
            $el[0].offsetHeight;

            // Фаза 2: проявляем новый текст снизу вверх
            $el.css({
                transition: `transform ${halfDuration}ms ease-out, opacity ${halfDuration}ms ease-out`,
                transform: 'translateY(0)',
                opacity: 1
            });
        }, halfDuration);
    }


    /* ==========================================================================
       5. Маркеры переноса строк стихов / Poem Line Break Markers
       ========================================================================== */

    /**
     * Расставляет визуальные маркеры переноса строк стихотворения.
     * Применяется для многоколоночного режима.
     */
    markPoemLineBreaks($poemContent) {
        const container = $poemContent[0];
        if (!container) return;

        const markersParent = container.closest('.poem-text-container') || container.parentElement;
        if (!markersParent) return;

        // Удаляем старые маркеры
        markersParent.querySelectorAll('.poem-line-break-marker').forEach(marker => marker.remove());

        const parentRect = markersParent.getBoundingClientRect();

        container.querySelectorAll('.poem-line').forEach(line => {
            const rects = [];
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null, false);

            let textNode;
            while ((textNode = walker.nextNode())) {
                if (!textNode.textContent.trim()) continue;

                const range = document.createRange();
                range.selectNode(textNode);
                const nodeRects = range.getClientRects();

                for (let r = 0; r < nodeRects.length; r++) {
                    if (nodeRects[r].width > 0) {
                        rects.push(nodeRects[r]);
                    }
                }
            }

            if (rects.length === 0) return;

            // Группируем rect'ы по визуальным строкам с учётом колонок
            const visualLines = [];
            const EPSILON = 4;

            rects.forEach(rect => {
                const currentGroup = visualLines[visualLines.length - 1];
                if (!currentGroup || Math.abs(currentGroup.top - rect.top) > EPSILON) {
                    visualLines.push({ top: rect.top, bottom: rect.bottom, right: rect.right });
                } else {
                    currentGroup.right = Math.max(currentGroup.right, rect.right);
                    currentGroup.bottom = Math.max(currentGroup.bottom, rect.bottom);
                }
            });

            // Если строка помещается целиком — маркеры не нужны
            if (visualLines.length < 2) return;

            // Ставим маркеры в конце каждой визуальной строки, кроме последней
            for (let i = 0; i < visualLines.length - 1; i++) {
                const lineGroup = visualLines[i];
                const marker = document.createElement('span');
                marker.className = 'poem-line-break-marker';
                marker.setAttribute('aria-hidden', 'true');
                marker.style.left = `${lineGroup.right - parentRect.left}px`;
                marker.style.top = `${lineGroup.bottom - parentRect.top}px`;
                markersParent.appendChild(marker);
            }
        });
    }

    /**
     * Обновляет маркеры переноса строк для всех видимых карточек.
     */
    updatePoemLineBreakMarkers() {
        $('.poem-content').each((index, element) => {
            this.markPoemLineBreaks($(element));
        });
    }

    /**
     * Инициализирует ResizeObserver для автоматического обновления маркеров.
     */
    initPoemLineBreakMarkers() {
        this.poemResizeObserver?.disconnect();

        const mainContent = document.querySelector('#mainContent');
        if (!mainContent) return;

        this.poemResizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                this.updatePoemLineBreakMarkers();
            });
        });

        this.poemResizeObserver.observe(mainContent);

        requestAnimationFrame(() => {
            this.updatePoemLineBreakMarkers();
        });
    }

    /**
     * Динамически пересчитывает высоту сайдбара.
     */
    updateSidebarHeight() {
        const $sidebar = $('.authors-sidebar');
        const $resizer = $('.sidebar-resizer');
        const $layout = $('.content-layout');

        if (!$layout.length || !$sidebar.length) return;

        const layoutTop = $layout[0].getBoundingClientRect().top;
        const stickyTop = 20; // совпадает с top: 20px в CSS
        const offset = Math.max(stickyTop, layoutTop);
        const height = window.innerHeight - offset;

        $sidebar.css('height', height + 'px');
        $resizer.css('height', height + 'px');
    }


    /* ==========================================================================
       6. Привязка событий / Event Binding (разделено по группам)
       ========================================================================== */

    /**
     * Точка входа: привязывает все события приложения.
     */
    bindEvents() {
        this.bindResizer();
        this.bindGlobalEvents();
        this.bindHeaderEvents();
        this.bindSidebarEvents();
        this.bindAuthorEvents();
        this.bindPostEvents();
        this.bindDataEvents();
    }

    /**
     * Ресайзер сайдбара (drag-to-resize).
     */
    bindResizer() {
        const $layout = $('.content-layout');
        const $sidebar = $('.authors-sidebar');
        const $resizer = $('.sidebar-resizer');

        let isResizing = false;

        $resizer.on('mousedown', function (e) {
            e.preventDefault();
            isResizing = true;
            $('body').addClass('is-resizing');

            $(document).on('mousemove.sidebarResize', function (e) {
                if (!isResizing) return;

                const layoutLeft = $layout.offset().left;
                const newWidth = e.clientX - layoutLeft;
                const width = Math.max(220, Math.min(600, newWidth));

                $sidebar.css('flex-basis', `${width}px`);
            });

            $(document).on('mouseup.sidebarResize', function () {
                isResizing = false;
                $('body').removeClass('is-resizing');
                $(document).off('.sidebarResize');
                app.store.saveSidebar(Math.round($sidebar.outerWidth()));
            });
        });
    }

    /**
     * Глобальные события: Esc, кнопка «наверх», хедер при скролле,
     * меню закладок, клики по строкам стихов.
     */
    bindGlobalEvents() {
        // Кнопка прокрутки наверх
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollTopBtn.classList.remove('d-none');
            } else {
                scrollTopBtn.classList.add('d-none');
            }
        });
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Класс «scrolled» на хедер при прокрутке + пересчёт высоты сайдбара
        this.updateSidebarHeight();
        window.addEventListener('scroll', () => {
            const header = document.querySelector('.app-header');
            if (window.scrollY > 100) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            this.updateSidebarHeight();
        });
        window.addEventListener('resize', () => this.updateSidebarHeight());

        // Клавиша Esc — сброс поиска
        $(document).on('keydown', (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                if ($('#searchInput').val() !== '') {
                    e.preventDefault();
                    this.resetSearchQuery();
                    this.refresh(true);
                }
            }
        });

        // Меню закладок в шапке: открытие, навигация по стихам, закрытие по клику мимо
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.js-toggle-bookmarks');
            const wrapper = e.target.closest('.bookmark-dropdown-wrapper');
            const postLink = e.target.closest('.timeline-post-link');

            if (btn) {
                app.ui.toggleBookmarksMenu(wrapper);
            } else if (postLink) {
                const postId = postLink.dataset.postId;
                if (postId) {
                    document.querySelectorAll('.bookmarks-dropdown-container').forEach(el => el.innerHTML = '');
                    for (const author of app.store.data.authors) {
                        const found = author.posts?.find(p => p.id === postId);
                        if (found) {
                            app.store.selectedAuthorId = author.id;
                            app.store.selectedPostId = postId;
                            app.store.markAsViewed(author.id);
                            app.refresh();
                            scrollPostToView(author.id, postId);
                            break;
                        }
                    }
                }
            } else if (!e.target.closest('.bookmarks-dropdown-container')) {
                document.querySelectorAll('.bookmarks-dropdown-container').forEach(el => el.innerHTML = '');
            }
        });

        // Закладка на строку стиха по клику
        $(document).on('click', '.poem-line', (e) => {
            const $line = $(e.target);
            const $container = $line.closest('.poem-content');
            const $card = $line.closest('.poem-card');
            const $searchInput = $('#searchInput');
            const postId = $card.data('post-id');
            const authorId = $card.data('author-id');

            // При активном поиске — первый клик на строку переключает вид на конкретный стих
            if (authorId && postId && $searchInput.length && $searchInput.val()) {
                this.store.selectedPostId = postId;
                this.store.selectedAuthorId = authorId;
                this.resetSearchQuery();
                this.refresh(false);
            }

            if ($line.hasClass('active-bookmark')) {
                $line.removeClass('active-bookmark');
                return;
            }

            $container.find('.poem-line.active-bookmark').removeClass('active-bookmark');
            $line.addClass('active-bookmark');
        });
    }

    /**
     * События шапки: логотип (смена заголовка), поиск, размер шрифта, колонки.
     */
    bindHeaderEvents() {
        // Клик по логотипу — случайный новый заголовок
        $('.clickable-logo').on('click', () => {
            this.applyRandomPoeticTitle();
            this.resetTitleChangeTimer();
        });

        // Поиск (с задержкой debounce)
        $('#searchInput').on('input', () => {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                this.refresh();
            }, 400);
            this.toggleClearButton();
        });

        // Выделение текста поиска при фокусе
        $('#searchInput').on('focus', function () {
            $(this).select();
        });

        // Очистка поиска кнопкой ×
        $('#clearSearchBtn').on('click', () => {
            this.resetSearchQuery();
            $('#searchInput').trigger('input').focus();
        });

        // Переключение размера шрифта
        $(document).on('change', 'input[name="fontSize"]', (e) => {
            const fontSize = $(e.target).val();
            localStorage.setItem('fontSize', fontSize);
            this.applyFontSize();
        });

        // Переключение числа колонок
        $(document).on('change', 'input[name="columns"]', (e) => {
            const columns = $(e.target).val();
            localStorage.setItem('columns', columns);
            this.applyColumns();
        });
    }

    /**
     * События сайдбара: выбор автора, переход по стиху, сортировка.
     */
    bindSidebarEvents() {
        // Выбор автора в списке
        $(document).on('click', '.author-card', (e) => {
            e.preventDefault();
            const id = $(e.currentTarget).data('id');
            this.store.selectedAuthorId = id;
            this.store.selectedPostId = null;
            this.store.markAsViewed(id);
            this.refresh();
        });

        // Клик по произведению в списке автора
        $(document).on('click', '.author-post-item', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const postId = $(e.currentTarget).data('post-id');
            const $authorCard = $(e.currentTarget).closest('.author-card-wrapper').find('.author-card');
            const authorId = $authorCard.data('id');

            if (authorId) {
                this.store.selectedAuthorId = authorId;
                this.store.markAsViewed(authorId);
            }

            this.store.selectedPostId = postId || null;
            this.refresh(false);
        });

        // Изменение режима сортировки
        $(document).on('change', 'input[name="authorSort"]', (e) => {
            this.store.authorSortMode = $(e.target).val();
            this.store.saveSettings();
            this.refresh();
        });
    }

    /**
     * События, связанные с авторами: добавление, редактирование, удаление,
     * загрузка фото (файл, URL, буфер обмена), парсинг ФИО.
     */
    bindAuthorEvents() {
        // Кнопка «Добавить автора»
        $('#addAuthorBtn').on('click', () => {
            this.ui.openAuthorModal();
        });

        // Кнопка «Редактировать автора» (в главной области)
        $(document).on('click', '#editAuthorBtn', () => {
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) this.ui.openAuthorModal(author);
        });

        // Двойной клик по аватару в Hero — открыть модалку автора
        $(document).on('dblclick', '.hero-avatar-img', () => {
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) this.ui.openAuthorModal(author);
        });

        // Одиночный клик по аватару — прокрутить до автора в сайдбаре (или сбросить поиск)
        $(document).on('click', '.hero-avatar-img', (e) => {
            e.preventDefault();
            if ($('#searchInput').val()) {
                this.resetSearchQuery();
                this.refresh();
            }
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) scrollToAuthorInSidebar(author.id);
        });

        // Ссылка «Смотреть все» → сброс поиска и selectedPost
        $(document).on('click', 'a.view-all', (e) => {
            e.preventDefault();
            this.resetSearchQuery();
            this.store.selectedPostId = null;
            this.refresh();
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) scrollToAuthorInSidebar(author.id);
        });

        // Двойной клик по аватару в сайдбаре — открыть модалку
        $(document).on('dblclick', '.author-avatar-img', (e) => {
            e.stopPropagation();
            const authorId = $(e.currentTarget).closest('.author-card').data('id');
            const author = this.store.getAuthorById(authorId);
            if (author) {
                this.store.selectedAuthorId = authorId;
                this.refresh();
                this.ui.openAuthorModal(author);
            }
        });

        // Парсинг ФИО и дат из буфера обмена
        $('#parseClipboardBtn').on('click', async () => {
            try {
                let text = await navigator.clipboard.readText();
                if (!text) { alert('Буфер обмена пуст!'); return; }

                text = normalizeUnicode(text);
                const parsed = parseAuthorText(text);
                $('#authorForm').data('parsedParts', parsed.parts);

                const order = $('input[name="nameOrder"]:checked').val();
                const distributed = distributeNameParts(parsed.parts, order);

                if (distributed.lastName) $('#authorLastName').val(distributed.lastName);
                if (distributed.firstName) $('#authorFirstName').val(distributed.firstName);
                if (distributed.surName) $('#authorSurName').val(distributed.surName);
                if (parsed.birthYear) $('#authorBirthYear').val(parsed.birthYear);
                if (parsed.deathYear) $('#authorDeathYear').val(parsed.deathYear);
            } catch (err) {
                alert('Не удалось прочитать буфер обмена. Разрешите доступ в браузере.');
            }
        });

        // Переключатель порядка ФИО — перераспределяет поля
        $(document).on('change', 'input[name="nameOrder"]', () => {
            const parts = $('#authorForm').data('parsedParts');
            if (!parts || parts.length === 0) return;

            const order = $('input[name="nameOrder"]:checked').val();
            const distributed = distributeNameParts(parts, order);

            $('#authorLastName').val(distributed.lastName);
            $('#authorFirstName').val(distributed.firstName);
            $('#authorSurName').val(distributed.surName);
        });

        // Переключение источника фото: файл / URL / буфер
        $('input[name="photoSourceMode"]').on('change', (e) => {
            const mode = $(e.target).val();
            $('#photoFileInputContainer').toggleClass('d-none', mode !== 'file');
            $('#photoUrlInputContainer').toggleClass('d-none', mode !== 'url');
            $('#photoBufferInputContainer').toggleClass('d-none', mode !== 'buffer');
        });

        // Загрузка фото из буфера обмена (кнопка)
        $('#pastePhotoFromBufferBtn').on('click', async () => {
            try {
                if (!navigator.clipboard || !navigator.clipboard.read) {
                    alert('Ваш браузер не поддерживает чтение файлов из буфера обмена.');
                    return;
                }
                const items = await navigator.clipboard.read();
                let imageFile = null;

                for (const item of items) {
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

                const compressedBase64 = await compressImage(imageFile, 300, 300, 0.8);
                $('#authorPhotoBase64').val(compressedBase64);
                $('#authorPhotoPreview').attr('src', compressedBase64);
                $('#removePhotoBtn').removeClass('d-none');
            } catch (err) {
                console.error(err);
                alert('Не удалось прочитать изображение из буфера. Убедитесь, что разрешили доступ в браузере.');
            }
        });

        // Автовставка картинки по Ctrl+V внутри модалки автора
        $('#authorModal').on('paste', async (e) => {
            const clipboardData = e.originalEvent.clipboardData;
            if (!clipboardData || !clipboardData.items) return;

            for (let i = 0; i < clipboardData.items.length; i++) {
                const item = clipboardData.items[i];
                if (item.type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        try {
                            const compressedBase64 = await compressImage(file, 300, 300, 0.8);
                            $('#authorPhotoBase64').val(compressedBase64);
                            $('#authorPhotoPreview').attr('src', compressedBase64);
                            $('#removePhotoBtn').removeClass('d-none');
                            $('#photoModeBuffer').prop('checked', true).trigger('change');
                        } catch (err) {
                            alert('Ошибка сжатия изображения из буфера');
                        }
                    }
                    break;
                }
            }
        });

        // Автофокус на поле «Фамилия» при открытии модалки
        $('#authorModal').on('shown.bs.modal', () => {
            $('#authorLastName').focus();
        });

        // Загрузка фото по URL
        $('#loadPhotoFromUrlBtn').on('click', async () => {
            const url = $('#authorPhotoUrlInput').val().trim();
            if (!url) { alert('Введите URL картинки!'); return; }

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

        // Удаление фото
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

            const { id: newId, isModified } = this.store.saveAuthor(authorData);
            this.store.selectedAuthorId = newId;
            this.ui.closeAuthorModal();
            if (isModified) this.refresh();
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

        // Перехват вставки из буфера во всех полях модалок (очистка мусора)
        const $modalFields = $('#authorModal input[type="text"], #authorModal textarea, #postModal input[type="text"], #postModal textarea');
        $modalFields.on('paste', function (e) {
            const clipboardData = e.originalEvent.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            const pastedText = clipboardData.getData('text/plain');
            if (pastedText) {
                e.preventDefault();
                const cleaned = cleanPastedText(pastedText);
                const input = this;
                const start = input.selectionStart || 0;
                const end = input.selectionEnd || 0;
                const currentVal = $(input).val();
                const newVal = currentVal.substring(0, start) + cleaned + currentVal.substring(end);
                $(input).val(newVal);

                const newCursorPos = start + cleaned.length;
                input.setSelectionRange(newCursorPos, newCursorPos);
                $(input).trigger('input');
            }
        });
    }

    /**
     * События, связанные с произведениями: добавление, редактирование,
     * удаление, ссылки, закладки, переключение HTML-режима, случайный стих.
     */
    bindPostEvents() {
        // Кнопка «Добавить стих»
        $(document).on('click', '#addPostBtn', () => {
            if (!this.store.selectedAuthorId) {
                alert('Сначала выберите или создайте автора!');
                return;
            }
            this.ui.openPostModal(null, this.store.selectedAuthorId, this.store.data.authors);
        });

        // Кнопка «Редактировать стих» (в карточке)
        $(document).on('click', '.edit-post-btn', (e) => {
            const postId = $(e.currentTarget).data('post-id');
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

        // Поиск автора в поле автокомплита модалки стиха
        $(document).on('input', '#postAuthorSearch', () => {
            const query = $('#postAuthorSearch').val();
            this.ui.renderAuthorSearchDropdown(this.store.data.authors, query);
        });

        // Выделение всего текста при фокусе на поле автора
        $(document).on('focus', '#postAuthorSearch', function () {
            $(this).select();
        });

        // Клик по элементу в дропдауне авторов
        $(document).on('click', '.author-search-item', (e) => {
            const authorId = $(e.currentTarget).data('author-id');
            const author = this.store.getAuthorById(authorId);
            if (author) {
                $('#postAuthorId').val(author.id);
                $('#postAuthorSearch').val(`${author.lastName} ${author.firstName}`);
                $('#authorSearchDropdown').addClass('d-none');
            }
        });

        // Скрытие дропдауна при клике вне его
        $(document).on('click', (e) => {
            if (!$(e.target).closest('.author-search-wrapper').length) {
                $('#authorSearchDropdown').addClass('d-none');
            }
        });

        // Переключение HTML-режима в форме стиха
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

        // Управление строками ссылок
        $('#addLinkRowBtn').on('click', () => this.ui.addLinkRow('', '', true));
        $(document).on('click', '.remove-link-btn', (e) => {
            $(e.currentTarget).closest('.link-row').remove();
        });

        // Закладка на произведение (кнопка в карточке)
        $(document).on('click', '.bookmark-btn', (e) => {
            e.stopPropagation();
            const $btn = $(e.currentTarget);
            const postId = $btn.data('post-id');
            if (postId) {
                const isBookmarked = $btn.toggleClass('active').hasClass('active');
                $btn.attr('title', isBookmarked ? 'Убрать закладку' : 'Поставить закладку');
                $btn.find('.bookmark-empty').toggleClass('d-none', isBookmarked);
                $btn.find('.bookmark-filled').toggleClass('d-none', !isBookmarked);
                this.store.toggleBookmark(postId, isBookmarked);
                this.updateSidebarBookmarkIcon(postId, isBookmarked);
            }
        });

        // Сохранение формы стиха
        $('#postForm').on('submit', (e) => {
            e.preventDefault();

            const isHtml = $('#useHtmlToggle').is(':checked');
            const contentText = $('#postContent').val().trim();
            const contentHtml = $('#postContentHtml').val().trim();

            if (!isHtml && !contentText) { alert('Заполните текст произведения!'); return; }
            if (isHtml && !contentHtml) { alert('Заполните HTML код произведения!'); return; }

            const authorId = $('#postAuthorId').val();
            if (!authorId) { alert('Выберите автора!'); return; }

            let title = $('#postTitle').val().trim();
            if (!title) {
                title = extractFirstLine(isHtml ? contentHtml : contentText, isHtml);
            }

            const links = [];
            $('#linksListContainer .link-row').each((_, el) => {
                const titleLink = $(el).find('.link-title-input').val().trim();
                const url = $(el).find('.link-url-input').val().trim();
                if (url) links.push({ title: titleLink, url });
            });

            const postData = {
                id: $('#postId').val() || null,
                title,
                year: cleanNumericValue($('#postYear').val()) ? parseInt(cleanNumericValue($('#postYear').val()), 10) : null,
                note: $('#postNote').val().trim(),
                links
            };

            if (isHtml) {
                postData.contentHtml = contentHtml;
                postData.content = '';
            } else {
                postData.content = contentText;
                postData.contentHtml = '';
            }

            let { id: postId, isModified } = this.store.savePost(authorId, postData);

            // Если сменился автор — удаляем пост у старого автора
            const originalPostId = $('#postId').val();
            let authorChanged = false;

            if (originalPostId) {
                for (const author of this.store.data.authors) {
                    if (author.id !== authorId && author.posts) {
                        const postIdx = author.posts.findIndex(p => p.id === originalPostId);
                        if (postIdx !== -1) {
                            author.posts.splice(postIdx, 1);
                            authorChanged = true;
                            break;
                        }
                    }
                }
            }

            this.ui.closePostModal();

            if (isModified || authorChanged) {
                this.store.save();
                this.store.selectedPostId = postId;
                this.store.selectedAuthorId = authorId;
                this.refresh();
            }
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

        // Кнопка «Случайное произведение»
        $('#randBtn').on('click', () => {
            this.resetSearchQuery();

            const allPosts = [];
            for (const author of this.store.data.authors) {
                if (author.posts && author.posts.length > 0) {
                    author.posts.forEach(post => allPosts.push({ post, authorId: author.id }));
                }
            }

            if (allPosts.length === 0) { alert('Нет ни одного произведения!'); return; }

            const random = allPosts[Math.floor(Math.random() * allPosts.length)];
            this.store.selectedAuthorId = random.authorId;
            this.store.selectedPostId = random.post.id;
            this.store.markAsViewed(random.authorId);
            this.refresh();

            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /**
     * События данных: экспорт JSON, экспорт EPUB, импорт JSON.
     */
    bindDataEvents() {
        // Экспорт JSON
        $('#exportBtn').on('click', () => {
            this.store.exportJson();
            this.store.markAsExported();
        });

        // Экспорт EPUB
        $('#exportEpubBtn').on('click', () => {
            this.store.exportToEpub();
        });

        // Импорт JSON — открываем диалог выбора файла
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
    }
}


/* ==========================================================================
   Старт приложения
   ========================================================================== */

$(document).ready(() => {
    window.app = new PoemApp();
    window.app.init();
});
