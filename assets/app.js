/**
 * ==========================================================================
 * assets/app.js
 * Главный класс приложения (PoemApp).
 * Координирует PoemStore, PoemUI и TimelineBar, управляет инициализацией,
 * обновлением и всеми событиями.
 *
 * Хелперы, специфичные только для этого класса (parseAuthorText,
 * distributeNameParts, extractFirstLine, cleanNumericValue),
 * объявлены как приватные методы. Статические данные (poeticTitles,
 * poeticSubtitles) живут здесь же как свойства класса.
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

        this.store.selectedPostId = localStorage.getItem(STORAGE_KEYS.SELECTED_POST) ?? null;
        this.store.selectedAuthorId = localStorage.getItem(STORAGE_KEYS.SELECTED_AUTHOR) ?? null;

        this.updateTheme();
        this.applyFontSize();
        this.applyColumns();
        this.applyAuthorsSort();
        this.applySidebarWidth();
        this.applyRandomPoeticTitle();
        this.resetTitleChangeTimer();
        this.toggleClearButton();
        this.store.updateExportWarningStatus();

        this.timeline = new TimelineBar('timeline-bar', this.store, {
            onPostClick: (postId) => {
                this.resetSearchQuery();
                let foundAuthor;
                for (const author of this.store.data.authors) {
                    if (author.posts?.find(p => p.id === postId)) {
                        foundAuthor = author;
                        this.store.selectedAuthorId = author.id;
                        this.store.markAsViewed(author.id);
                        break;
                    }
                }
                this.store.selectedPostId = postId;
                this.refresh();
                this.ui.scrollToPost(foundAuthor?.id, postId);
            }
        });

        // Ленивая подгрузка превью YouTube. Делегирование на document, а не
        // наведение на каждый контейнер: карточки произведений перерисовываются
        // при каждом refresh, и обработчики пришлось бы вешать заново.
        $(document).on('mouseenter focusin', '.link-yt-tooltip', (e) => this.ui.loadYouTubeThumbnails(e));

        this.bindEvents();
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
        searchQuery = convertEngToRus(searchQuery);

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

        // При изменении поиска — переходим к первому совпавшему посту
        if (searchChanged && searchQuery?.trim()) {
            const q = searchQuery.toLowerCase().trim();
            let firstFoundPostId = null;

            for (const author of authors) {
                if (author.posts?.length > 0) {
                    const found = author.posts.find(post => isPostMatch(post, q));
                    if (found) {
                        firstFoundPostId = found.id;
                        this.store.selectedAuthorId = author.id;
                        break;
                    }
                }
            }
            this.store.selectedPostId = firstFoundPostId || null;
        }

        if (searchChanged && !searchQuery?.trim()) {
            this.store.selectedPostId = null;
        }

        this.ui.renderAuthorsList(authors, this.store.selectedAuthorId, this.store.selectedPostId, searchQuery);
        animate ? $('.author-posts-list').slideDown(250) : $('.author-posts-list').show();

        const allPosts = this.store.data.authors.flatMap(
            a => (a.posts || []).map(p => ({...p, authorId: a.id}))
        );
        this.timeline.render(allPosts, this.store.selectedAuthorId, authors, this.store.selectedPostId);

        const currentAuthor = this.store.getAuthorById(this.store.selectedAuthorId);
        this.ui.renderAuthorMain(currentAuthor, searchQuery, this.store.selectedPostId,
            this.store.data.authors.length === 0);

        this.applyColumns();
        this.initPoemLineBreakMarkers();

        if (this.store.selectedPostId) {
            localStorage.setItem(STORAGE_KEYS.SELECTED_POST, this.store.selectedPostId);
        } else {
            localStorage.removeItem(STORAGE_KEYS.SELECTED_POST);
        }
        if (this.store.selectedAuthorId) {
            localStorage.setItem(STORAGE_KEYS.SELECTED_AUTHOR, this.store.selectedAuthorId);
        } else {
            localStorage.removeItem(STORAGE_KEYS.SELECTED_AUTHOR);
        }
    }

    /**
     * Обновляет иконку закладки в сайдбаре для конкретного поста.
     */
    updateSidebarBookmarkIcon(postId, isBookmarked) {
        const $postItem = $(`.author-post-item[data-post-id="${postId}"]`);
        if (!$postItem.length) return;
        const $titleSpan = $postItem.find('.author-post-title-wrapper');
        $titleSpan.find('.bookmark-icon').remove();
        if (isBookmarked) $titleSpan.append(this.ui.renderBookmarkIcon(postId, true));
    }


    /* ==========================================================================
       3. Применение Настроек / Settings Appliers
       ========================================================================== */

    /**
     * Инициализирует тему оформления (светлая/тёмная/авто) и обработчики переключения.
     */
    updateTheme() {
        const $themeIcon = $('#themeIcon');
        const $themeMenuItems = $('#themeMenu [data-theme-value]');
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = (theme) => {
            const isDark = theme === THEME.DARK ||
                (theme === THEME.AUTO && mediaQuery.matches);

            if (isDark) {
                $('body').attr('data-theme', THEME.DARK);
                $themeIcon.text('☀️');
            } else {
                $('body').removeAttr('data-theme');
                $themeIcon.text('🌙');
            }

            // Подсвечиваем активный пункт меню
            $themeMenuItems.removeClass('active');
            const activeValue = theme === THEME.AUTO
                ? THEME.AUTO
                : (isDark ? THEME.DARK : THEME.LIGHT);
            $themeMenuItems.filter(`[data-theme-value="${activeValue}"]`).addClass('active');
        };

        const setTheme = (theme) => {
            localStorage.setItem(STORAGE_KEYS.THEME, theme);
            applyTheme(theme);
        };

        // Загружаем сохранённую тему или используем авто по умолчанию
        const saved = localStorage.getItem(STORAGE_KEYS.THEME) || THEME.AUTO;
        setTheme(saved);

        // Обработчики пунктов меню
        $themeMenuItems.on('click', function () {
            setTheme($(this).data('theme-value'));
        });

        // Следим за изменением системной темы в режиме "Авто"
        mediaQuery.addEventListener('change', () => {
            const current = localStorage.getItem(STORAGE_KEYS.THEME) || THEME.AUTO;
            if (current === THEME.AUTO) {
                applyTheme(THEME.AUTO);
            }
        });
    }

    /** Применяет сохранённый размер шрифта. */
    applyFontSize() {
        const fontSize = localStorage.getItem(STORAGE_KEYS.FONT_SIZE) || STORAGE_DEFAULTS.FONT_SIZE;
        $('body').removeClass('font-small font-normal font-large').addClass(`font-${fontSize}`);
        $(`input[name="fontSize"][value="${fontSize}"]`).prop('checked', true);
    }

    /** Применяет сохранённую ширину сайдбара. */
    applySidebarWidth() {
        const saved = this.store.loadSidebar();
        if (Number.isFinite(saved)) $('.authors-sidebar').css('flex-basis', `${saved}px`);
    }

    /** Восстанавливает радио-кнопку сортировки авторов. */
    applyAuthorsSort() {
        $(`input[name="authorSort"][value="${this.store.authorSortMode}"]`).prop('checked', true);
    }

    /**
     * Применяет количество колонок к карточкам произведений.
     * Число колонок определяется по длине произведения, но не превышает максимум.
     * Значение COLUMNS.PARALLEL переключает в режим оригинал|перевод.
     */
    applyColumns() {
        const columns = localStorage.getItem(STORAGE_KEYS.COLUMNS) || STORAGE_DEFAULTS.COLUMNS;
        $(`input[name="columns"][value="${columns}"]`).prop('checked', true);

        // Parallel-режим — стандартные колонки не применяются
        if (columns === 'parallel') {
            $('.poem-card').each((_, card) => {
                $(card).find('.poem-content').removeClass('cols-1 cols-2 cols-3 cols-4');
            });
            return;
        }

        const maxColumns = parseInt(columns, 10) || 1;

        $('.poem-card').each((_, card) => {
            const $content = $(card).find('.poem-content');
            if (!$content.length) return;

            $content.removeClass('cols-1 cols-2 cols-3 cols-4');
            const lineCount = $content.text().trim().split('\n').length;

            let targetCols;
            if (lineCount > 50) targetCols = 4;
            else if (lineCount > 32) targetCols = 3;
            else if (lineCount >= 16) targetCols = 2;
            else targetCols = 1;

            $content.addClass(`cols-${Math.min(targetCols, maxColumns)}`);
        });
    }

    /**
     * Применяет случайный заголовок и подзаголовок из встроенных массивов.
     */
    applyRandomPoeticTitle() {
        const title = this._randomFromArray(PoemApp.poeticTitles, STORAGE_KEYS.TITLE_INDEX);
        const subtitle = this._randomFromArray(PoemApp.poeticSubtitles, STORAGE_KEYS.SUBTITLE_INDEX);
        this._rollText($('.brand-title'), title, 500);
        this._rollText($('.small-subtitle'), subtitle, 500);
    }


    /* ==========================================================================
       4. Вспомогательные методы / Private Helpers
       ========================================================================== */

    /**
     * Выбирает случайный элемент из массива, избегая повтора.
     * @private
     */
    _randomFromArray(array, storageKey) {
        const previous = localStorage.getItem(storageKey);
        let index;
        do {
            index = Math.floor(Math.random() * array.length);
        } while (array.length > 1 && String(index) === previous);
        localStorage.setItem(storageKey, index);
        return array[index];
    }

    /** Сбрасывает поле поиска. */
    resetSearchQuery() {
        $('#searchInput').val('');
        $('.btn-clear-search').addClass('d-none');
        this._prevSearchQuery = '';
    }

    /** Показывает/скрывает кнопку × очистки поиска. */
    toggleClearButton() {
        const hasValue = $('#searchInput').val().trim().length > 0;
        $('#clearSearchBtn').toggleClass('d-none', !hasValue);
    }

    /** Перезапускает таймер авторотации заголовка. */
    resetTitleChangeTimer() {
        clearInterval(this.titleChangeInterval);
        this.titleChangeInterval = setInterval(() => this.applyRandomPoeticTitle(), 30000);
    }

    /**
     * Анимация «прокрутки» текста (fade up/down) для заголовков.
     * @private
     */
    _rollText($el, targetText, duration = 500) {
        if (!$el?.length) return;
        const half = duration / 2;
        $el.css({
            transition: `transform ${half}ms ease-in, opacity ${half}ms ease-in`,
            transform: 'translateY(-10px)',
            opacity: 0
        });
        setTimeout(() => {
            $el.text(targetText).css({transition: 'none', transform: 'translateY(10px)'});
            $el[0].offsetHeight; // reflow
            $el.css({
                transition: `transform ${half}ms ease-out, opacity ${half}ms ease-out`,
                transform: 'translateY(0)',
                opacity: 1
            });
        }, half);
    }

    /**
     * Парсит строку из буфера обмена с именем автора и годами жизни.
     * Используется только в bindAuthorEvents().
     * @private
     * @param {string} rawText
     * @returns {{ parts: string[], birthYear: number|null, deathYear: number|null }}
     */
    _parseAuthorText(rawText) {
        const result = {parts: [], birthYear: null, deathYear: null};
        if (!rawText?.trim()) return result;

        let text = cleanPastedText(rawText)
            .normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC');

        const allYears = text.match(/\b(\d{4})\b/g);
        if (allYears?.length >= 2) {
            result.birthYear = parseInt(allYears[0], 10);
            result.deathYear = parseInt(allYears[1], 10);
        } else if (allYears?.length === 1) {
            result.birthYear = parseInt(allYears[0], 10);
        }

        text = text.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
            .replace(/\b\d{4}\b.*$/, '').replace(/\b\d+\b/g, '')
            .replace(/[(),:;]/g, '').trim();

        result.parts = text.split(/\s+/).filter(Boolean).slice(0, 3);
        return result;
    }

    /**
     * Распределяет части имени по полям фамилии, имени, отчества
     * согласно выбранному порядку.
     * Используется только в bindAuthorEvents().
     * @private
     * @param {string[]} parts
     * @param {'FIO'|'IFO'|'IOF'} order
     * @returns {{ lastName: string, firstName: string, surName: string }}
     */
    _distributeNameParts(parts, order) {
        const r = {lastName: '', firstName: '', surName: ''};
        if (!parts?.length) return r;
        switch (order) {
            case 'FIO':
                [r.lastName, r.firstName, r.surName] = parts;
                break;
            case 'IFO':
                [r.firstName, r.lastName, r.surName] = parts;
                break;
            case 'IOF':
                [r.firstName, r.surName, r.lastName] = parts;
                break;
        }
        return r;
    }

    /**
     * Извлекает первую непустую строку текста как автозаголовок произведения.
     * Используется только в bindPostEvents() при сохранении.
     * @private
     * @param {string} textOrHtml
     * @param {boolean} isHtml
     * @returns {string}
     */
    _extractFirstLine(textOrHtml, isHtml = false) {
        if (!textOrHtml) return 'Без названия';
        let text = textOrHtml;
        if (isHtml) {
            const div = document.createElement('div');
            div.innerHTML = textOrHtml;
            text = div.textContent || div.innerText || '';
        }
        const first = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
        return first ? first.replace(/[.,;:!?—–\-]+$/, '').trim() : 'Без названия';
    }

    /**
     * Убирает все нецифровые символы из строки.
     * Используется только в bindAuthorEvents() и bindPostEvents().
     * @private
     * @param {any} value
     * @returns {string}
     */
    _cleanNumericValue(value) {
        if (!value) return '';
        return String(value).replace(/[^\d]/g, '');
    }


    /* ==========================================================================
       5. Маркеры переноса строк произведений / Poem Line Break Markers
       ========================================================================== */

    /**
     * Расставляет визуальные маркеры переноса строк в многоколоночном режиме.
     */
    markPoemLineBreaks($poemContent) {
        const container = $poemContent[0];
        if (!container) return;

        const markersParent = container.closest('.poem-text-container') || container.parentElement;
        if (!markersParent) return;

        markersParent.querySelectorAll('.poem-line-break-marker').forEach(m => m.remove());
        const parentRect = markersParent.getBoundingClientRect();
        const EPSILON = 4;

        container.querySelectorAll('.poem-line').forEach(line => {
            const rects = [];
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null, false);
            let textNode;

            while ((textNode = walker.nextNode())) {
                if (!textNode.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNode(textNode);
                Array.from(range.getClientRects()).forEach(r => {
                    if (r.width > 0) rects.push(r);
                });
            }

            if (!rects.length) return;

            const visualLines = [];
            rects.forEach(rect => {
                const group = visualLines[visualLines.length - 1];
                if (!group || Math.abs(group.top - rect.top) > EPSILON) {
                    visualLines.push({top: rect.top, bottom: rect.bottom, right: rect.right});
                } else {
                    group.right = Math.max(group.right, rect.right);
                    group.bottom = Math.max(group.bottom, rect.bottom);
                }
            });

            if (visualLines.length < 2) return;

            for (let i = 0; i < visualLines.length - 1; i++) {
                const {right, bottom} = visualLines[i];
                const marker = document.createElement('span');
                marker.className = 'poem-line-break-marker';
                marker.setAttribute('aria-hidden', 'true');
                marker.style.left = `${right - parentRect.left}px`;
                marker.style.top = `${bottom - parentRect.top}px`;
                markersParent.appendChild(marker);
            }
        });
    }

    /** Обновляет маркеры переноса для всех видимых карточек. */
    updatePoemLineBreakMarkers() {
        $('.poem-content').each((_, el) => this.markPoemLineBreaks($(el)));
    }

    /** Инициализирует ResizeObserver для автообновления маркеров. */
    initPoemLineBreakMarkers() {
        this.poemResizeObserver?.disconnect();
        const main = document.querySelector('#mainContent');
        if (!main) return;

        this.poemResizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => this.updatePoemLineBreakMarkers());
        });
        this.poemResizeObserver.observe(main);
        requestAnimationFrame(() => this.updatePoemLineBreakMarkers());
    }

    /** Пересчитывает высоту сайдбара при скролле/ресайзе. */
    updateSidebarHeight() {
        const $sidebar = $('.authors-sidebar');
        const $resizer = $('.sidebar-resizer');
        const $layout = $('.content-layout');
        if (!$layout.length || !$sidebar.length) return;

        const layoutTop = $layout[0].getBoundingClientRect().top;
        const stickyTop = 20;
        const height = window.innerHeight - Math.max(stickyTop, layoutTop) - 5;

        $sidebar.css('height', height + 'px');
        $resizer.css('height', height + 'px');
    }


    /* ==========================================================================
       6. Привязка событий / Event Bindings
       ========================================================================== */

    /** Точка входа: делегирует регистрацию событий по группам. */
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
                const width = Math.max(220, Math.min(600, e.clientX - $layout.offset().left));
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
     * Глобальные события: Esc, «наверх», хедер при скролле,
     * меню закладок, клики по строкам произведений.
     */
    bindGlobalEvents() {
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        window.addEventListener('scroll', () => {
            scrollTopBtn.classList.toggle('d-none', window.scrollY <= 300);
        });
        scrollTopBtn.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));

        this.updateSidebarHeight();
        window.addEventListener('scroll', () => {
            const header = document.querySelector('.app-header');
            header?.classList.toggle('scrolled', window.scrollY > 100);
            this.updateSidebarHeight();
        });
        window.addEventListener('resize', () => this.updateSidebarHeight());

        $(document).on('keydown', (e) => {
            if ((e.key === 'Escape' || e.keyCode === 27) && $('#searchInput').val() !== '') {
                e.preventDefault();
                this.resetSearchQuery();
                this.refresh(true);
            }
        });

        $(document).on('click', '#findDuplicatesBtn', async (e) => {
            const storageData = app.store.data;
            if (!storageData || !storageData.authors || storageData.authors.length === 0) {
                alert('База данных пуста или не загружена!');
                return;
            }

            $('body').css('cursor', 'wait');
            const $overlay = $(`
        <div id="appLoadingOverlay" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff;">
            <div style="width: 320px;" class="bg-dark p-4 rounded shadow text-center border border-secondary">
                <div class="fw-bold mb-1">Поиск дубликатов... </div><span id="dupPercent"></span>
                <div class="progress mb-1" style="height: 20px;">
                    <div id="dupProgressBar" class="progress-bar progress-bar-striped progress-bar-animated bg-accent" role="progressbar" style="width: 0"></div>
                </div>
            </div>
        </div>
    `).appendTo('body');
            const updateProgress = (percent) => {
                const clampedPercent = Math.min(100, Math.max(0, percent));
                $('#dupProgressBar').css('width', `${clampedPercent}%`);
                $('#dupPercent').text(`${clampedPercent}%`);
            };

            try {
                const detector = new DuplicateDetector({threshold: 0.90});
                const results = await detector.detectAsync(storageData, updateProgress);
                const modalEl = document.getElementById('duplicatesModal');
                const modal = new bootstrap.Modal(modalEl);

                detector.renderDuplicateResults(results);
                modal.show();
            } catch (err) {
                console.error('Ошибка при поиске дубликатов:', err);
                alert('Произошла ошибка при обработке данных.');
            } finally {
                $overlay.remove();
                $('body').css('cursor', 'default');
            }
        });

        // Меню закладок и навигация по произведениям из дропдауна
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.js-toggle-bookmarks');
            const wrapper = e.target.closest('.bookmark-dropdown-wrapper');
            const postLink = e.target.closest('.timeline-post-link');

            if (btn) {
                this.ui.toggleBookmarksMenu(wrapper);
            } else if (postLink) {
                const postId = postLink.dataset.postId;
                if (postId) {
                    document.querySelectorAll('.bookmarks-dropdown-container').forEach(el => el.innerHTML = '');
                    for (const author of this.store.data.authors) {
                        const found = author.posts?.find(p => p.id === postId);
                        if (found) {
                            this.resetSearchQuery();
                            this.store.selectedAuthorId = author.id;
                            this.store.selectedPostId = postId;
                            this.store.markAsViewed(author.id);
                            this.refresh();
                            this.ui.scrollToPost(author.id, postId);
                            break;
                        }
                    }
                }
            } else if (!e.target.closest('.bookmarks-dropdown-container')) {
                document.querySelectorAll('.bookmarks-dropdown-container').forEach(el => el.innerHTML = '');
            }
        });

        // Закладка на строку произведения (click toggle) с синхронизацией колонок
        $(document).on('click', '.poem-line', (e) => {
            const $line = $(e.target).closest('.poem-line');
            const $card = $line.closest('.poem-card');
            const $search = $('#searchInput');
            const postId = $card.data('post-id');
            const authorId = $card.data('author-id');

            if (authorId && postId) {
                if ($search.length && $search.val()) {
                    this.store.selectedPostId = postId;
                    this.store.selectedAuthorId = authorId;
                    this.resetSearchQuery();
                    this.refresh(false);
                }

                this.store.markAsViewed(authorId);
            }

            const $pair = this.getLinePair($card, $line);
            if ($pair.first().hasClass('active-bookmark')) {
                $pair.removeClass('active-bookmark');
                return;
            }
            $card.find('.poem-line.active-bookmark').removeClass('active-bookmark');
            $pair.addClass('active-bookmark');
        });

        $(document).on('mouseenter mouseleave', '.poem-line', (e) => {
            const $line = $(e.currentTarget);
            const $card = $line.closest('.poem-card');
            if (!$card[0]?.querySelector('.poem-parallel-container')) return;

            const $pair = this.getLinePair($card, $line);
            $pair.toggleClass('hover', e.type === 'mouseenter');
        });
    }

     getLinePair($card, $line) {
        if (!$card[0]?.querySelector('.poem-parallel-container')) return $line;

        const lineIndex = Number($line.data('line-index'));
        if (isNaN(lineIndex)) return $line;

        const isTranslation = $line.hasClass('poem-line--translation');
        const targetClass = isTranslation ? '.poem-line--original' : '.poem-line--translation';
        const $target = $card.find(`${targetClass}[data-line-index="${lineIndex}"]`).first();

        return $target.length ? $line.add($target) : $line;
    }

    /**
     * События шапки: логотип, поиск, шрифт, колонки.
     */
    bindHeaderEvents() {
        $('.clickable-logo').on('click', () => {
            this.applyRandomPoeticTitle();
            this.resetTitleChangeTimer();
        });

        $('#searchInput').on('input', () => {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.refresh(), 400);
            this.toggleClearButton();
        });

        $('#searchInput').on('focus', function () {
            $(this).select();
        });

        $('#clearSearchBtn').on('click', () => {
            this.resetSearchQuery();
            $('#searchInput').trigger('input').focus();
        });

        $(document).on('change', 'input[name="fontSize"]', (e) => {
            localStorage.setItem(STORAGE_KEYS.FONT_SIZE, $(e.target).val());
            this.applyFontSize();
        });

        $(document).on('change', 'input[name="columns"]', (e) => {
            localStorage.setItem(STORAGE_KEYS.COLUMNS, $(e.target).val());
            this.applyColumns();
            this.refresh();
        });
    }

    /**
     * События сайдбара: выбор автора, переход к произведению, сортировка.
     */
    bindSidebarEvents() {
        $(document).on('click', '.author-card', (e) => {
            e.preventDefault();
            const id = $(e.currentTarget).data('id');
            this.store.selectedAuthorId = id;
            this.store.selectedPostId = null;
            this.store.markAsViewed(id);
            this.refresh();
        });

        $(document).on('click', '.author-post-item', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const postId = $(e.currentTarget).data('post-id');
            const authorId = $(e.currentTarget).closest('.author-card-wrapper').find('.author-card').data('id');
            if (authorId) {
                this.store.selectedAuthorId = authorId;
                this.store.markAsViewed(authorId);
            }
            this.store.selectedPostId = postId || null;
            this.refresh(false);
        });

        $(document).on('change', 'input[name="authorSort"]', (e) => {
            this.store.authorSortMode = $(e.target).val();
            this.store.saveSettings();
            this.refresh();
        });
    }

    /**
     * События авторов: добавление, редактирование, удаление, фото, парсинг ФИО.
     */
    bindAuthorEvents() {
        $('#addAuthorBtn').on('click', () => this.ui.openAuthorModal());

        $(document).on('click', '#editAuthorBtn', () => {
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) this.ui.openAuthorModal(author);
        });

        // Двойной клик по аватару Hero — редактировать автора
        $(document).on('dblclick', '.hero-avatar-img', () => {
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) this.ui.openAuthorModal(author);
        });

        // Одиночный клик по аватару Hero — прокрутить сайдбар к автору
        $(document).on('click', '.hero-avatar-img', (e) => {
            e.preventDefault();
            if ($('#searchInput').val()) {
                this.resetSearchQuery();
                this.refresh();
            }
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) this.ui.scrollToAuthor(author.id);
        });

        // «Смотреть все» — сброс поиска и фокус в сайдбаре
        $(document).on('click', 'a.view-all', (e) => {
            e.preventDefault();
            this.resetSearchQuery();
            this.store.selectedPostId = null;
            this.refresh(false);
            const author = this.store.getAuthorById(this.store.selectedAuthorId);
            if (author) {
                this.ui.scrollToAuthor(author.id);
                this.store.markAsViewed(author.id);
            }
        });

        // Двойной клик по аватару в сайдбаре — редактировать автора
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
                if (!text) {
                    alert('Буфер обмена пуст!');
                    return;
                }

                text = normalizeUnicode(text);
                const parsed = this._parseAuthorText(text);
                const order = $('input[name="nameOrder"]:checked').val();
                const distributed = this._distributeNameParts(parsed.parts, order);

                $('#authorForm').data('parsedParts', parsed.parts);
                if (distributed.lastName) $('#authorLastName').val(distributed.lastName);
                if (distributed.firstName) $('#authorFirstName').val(distributed.firstName);
                if (distributed.surName) $('#authorSurName').val(distributed.surName);
                if (parsed.birthYear) $('#authorBirthYear').val(parsed.birthYear);
                if (parsed.deathYear) $('#authorDeathYear').val(parsed.deathYear);
            } catch {
                alert('Не удалось прочитать буфер обмена. Разрешите доступ в браузере.');
            }
        });

        // Переключатель порядка ФИО
        $(document).on('change', 'input[name="nameOrder"]', () => {
            const parts = $('#authorForm').data('parsedParts');
            if (!parts?.length) return;
            const distributed = this._distributeNameParts(parts, $('input[name="nameOrder"]:checked').val());
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
                if (!navigator.clipboard?.read) {
                    alert('Ваш браузер не поддерживает чтение файлов из буфера обмена.');
                    return;
                }
                const items = await navigator.clipboard.read();
                let imageFile = null;
                for (const item of items) {
                    const type = item.types.find(t => t.startsWith('image/'));
                    if (type) {
                        imageFile = new File([await item.getType(type)], 'clipboard_image.png', {type});
                        break;
                    }
                }
                if (!imageFile) {
                    alert('В буфере обмена нет изображения!');
                    return;
                }
                await this._setPhotoFromFile(imageFile);
            } catch (err) {
                console.error(err);
                alert('Не удалось прочитать изображение из буфера.');
            }
        });

        // Автовставка картинки по Ctrl+V в модалке автора
        $('#authorModal').on('paste', async (e) => {
            const items = e.originalEvent.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        try {
                            await this._setPhotoFromFile(file);
                            $('#photoModeBuffer').prop('checked', true).trigger('change');
                        } catch {
                            alert('Ошибка сжатия изображения');
                        }
                    }
                    break;
                }
            }
        });

        // Загрузка фото по URL
        $('#loadPhotoFromUrlBtn').on('click', async () => {
            const url = $('#authorPhotoUrlInput').val().trim();
            if (!url) {
                alert('Введите URL картинки!');
                return;
            }
            const $btn = $('#loadPhotoFromUrlBtn').prop('disabled', true).text('Загрузка...');
            try {
                const base64 = await imageUrlToBase64(url, 300, 300, 0.8);
                this._applyPhotoToForm(base64);
            } catch (err) {
                alert('Ошибка загрузки по URL: ' + err.message);
            } finally {
                $btn.prop('disabled', false).text('Загрузить');
            }
        });

        // Удаление фото
        $('#removePhotoBtn').on('click', () => {
            const placeholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23d8c8b8'/><text x='50%' y='55%' font-size='35' text-anchor='middle' dominant-baseline='middle' fill='%235c4a3e'>📷</text></svg>";
            $('#authorPhotoInput').val('');
            $('#authorPhotoUrlInput').val('');
            $('#authorPhotoBase64').val('');
            $('#authorPhotoPreview').attr('src', placeholder);
            $('#removePhotoBtn').addClass('d-none');
        });

        $('#authorModal').on('shown.bs.modal', () => $('#authorLastName').focus());

        // Сохранение формы автора
        $('#authorForm').on('submit', (e) => {
            e.preventDefault();
            const cleanInt = (id) => {
                const v = this._cleanNumericValue($(`#${id}`).val());
                return v ? parseInt(v, 10) : null;
            };
            const {id: newId, isModified} = this.store.saveAuthor({
                id: $('#authorId').val() || null,
                lastName: $('#authorLastName').val().trim(),
                firstName: $('#authorFirstName').val().trim(),
                surName: $('#authorSurName').val().trim(),
                birthYear: cleanInt('authorBirthYear'),
                deathYear: cleanInt('authorDeathYear'),
                photo: $('#authorPhotoBase64').val() || ''
            });
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

        // Очистка мусора при вставке во все текстовые поля модалок
        $('#authorModal input[type="text"], #authorModal textarea, #postModal input[type="text"], #postModal textarea')
            .on('paste', function (e) {
                const text = (e.originalEvent.clipboardData || window.clipboardData).getData('text/plain');
                if (!text) return;
                e.preventDefault();
                const input = this;
                const start = input.selectionStart || 0;
                const end = input.selectionEnd || 0;
                const cleaned = cleanPastedText(text);
                const newVal = $(input).val().substring(0, start) + cleaned + $(input).val().substring(end);
                $(input).val(newVal);
                input.setSelectionRange(start + cleaned.length, start + cleaned.length);
                $(input).trigger('input');
            });
    }

    /**
     * Сжимает файл изображения и устанавливает его в форму автора.
     * @private
     */
    async _setPhotoFromFile(file) {
        const base64 = await compressImage(file, 300, 300, 0.8);
        this._applyPhotoToForm(base64);
    }

    /**
     * Устанавливает base64-фото в поля формы автора.
     * @private
     */
    _applyPhotoToForm(base64) {
        $('#authorPhotoBase64').val(base64);
        $('#authorPhotoPreview').attr('src', base64);
        $('#removePhotoBtn').removeClass('d-none');
    }

    /**
     * События произведений: добавление, редактирование, удаление,
     * ссылки, закладки, HTML-режим, случайное произведение.
     */
    bindPostEvents() {
        $(document).on('click', '#addPostBtn', () => {
            if (!this.store.selectedAuthorId) {
                alert('Сначала выберите или создайте автора!');
                return;
            }
            this.ui.openPostModal(null, this.store.selectedAuthorId, this.store.data.authors);
        });

        $(document).on('click', '.edit-post-btn', (e) => {
            const postId = $(e.currentTarget).data('post-id');
            let post = null, postAuthorId = null;
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

        $(document).on('input', '#postAuthorSearch', () => {
            this.ui.renderAuthorSearchDropdown(this.store.data.authors, $('#postAuthorSearch').val());
        });
        $(document).on('focus', '#postAuthorSearch', function () {
            $(this).select();
        });

        $(document).on('click', '.author-search-item', (e) => {
            const author = this.store.getAuthorById($(e.currentTarget).data('author-id'));
            if (author) {
                $('#postAuthorId').val(author.id);
                $('#postAuthorSearch').val(`${author.lastName} ${author.firstName}`);
                $('#authorSearchDropdown').addClass('d-none');
            }
        });

        $(document).on('click', (e) => {
            if (!$(e.target).closest('.author-search-wrapper').length) $('#authorSearchDropdown').addClass('d-none');
        });

        $('#useHtmlToggle').on('change', (e) => {
            const isHtml = $(e.target).is(':checked');
            $('#plainTextContainer').toggleClass('d-none', isHtml);
            $('#htmlTextContainer').toggleClass('d-none', !isHtml);
        });

        $('#addLinkRowBtn').on('click', () => this.ui.addLinkRow('', '', true));
        $(document).on('click', '.remove-link-btn', (e) => $(e.currentTarget).closest('.link-row').remove());

        $(document).on('click', '.bookmark-btn', (e) => {
            e.stopPropagation();
            const $btn = $(e.currentTarget);
            const postId = $btn.data('post-id');
            if (!postId) return;
            const isBookmarked = $btn.toggleClass('active').hasClass('active');
            $btn.attr('title', isBookmarked ? 'Убрать закладку' : 'Поставить закладку');
            $btn.find('.bookmark-empty').toggleClass('d-none', isBookmarked);
            $btn.find('.bookmark-filled').toggleClass('d-none', !isBookmarked);
            this.store.toggleBookmark(postId, isBookmarked);
            this.updateSidebarBookmarkIcon(postId, isBookmarked);
        });

        // Сохранение формы произведения
        $('#postForm').on('submit', (e) => {
            e.preventDefault();
            const isHtml = $('#useHtmlToggle').is(':checked');
            const contentText = $('#postContent').val().trim();
            const contentHtml = $('#postContentHtml').val().trim();
            const authorId = $('#postAuthorId').val();

            if (!isHtml && !contentText) {
                alert('Заполните текст произведения!');
                return;
            }
            if (isHtml && !contentHtml) {
                alert('Заполните HTML код произведения!');
                return;
            }
            if (!authorId) {
                alert('Выберите автора!');
                return;
            }

            const rawTitle = $('#postTitle').val().trim();
            const title = rawTitle || this._extractFirstLine(isHtml ? contentHtml : contentText, isHtml);
            const yearRaw = this._cleanNumericValue($('#postYear').val());

            const links = [];
            $('#linksListContainer .link-row').each((_, el) => {
                const url = $(el).find('.link-url-input').val().trim();
                if (url) links.push({title: $(el).find('.link-title-input').val().trim(), url});
            });

            const postData = {
                id: $('#postId').val() || null,
                title,
                year: yearRaw ? parseInt(yearRaw, 10) : null,
                note: $('#postNote').val().trim(),
                links,
                content: isHtml ? '' : contentText,
                contentHtml: isHtml ? contentHtml : ''
            };

            let {id: postId, isModified} = this.store.savePost(authorId, postData);
            let authorChanged = false;
            const originalPostId = $('#postId').val();

            if (originalPostId) {
                for (const author of this.store.data.authors) {
                    if (author.id !== authorId && author.posts) {
                        const idx = author.posts.findIndex(p => p.id === originalPostId);
                        if (idx !== -1) {
                            author.posts.splice(idx, 1);
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

        // Случайное произведение
        $('#randBtn').on('click', () => {
            this.resetSearchQuery();
            const allPosts = this.store.data.authors.flatMap(a =>
                (a.posts || []).map(p => ({post: p, authorId: a.id}))
            );
            if (!allPosts.length) {
                alert('Нет ни одного произведения!');
                return;
            }
            const {post, authorId} = allPosts[Math.floor(Math.random() * allPosts.length)];
            this.store.selectedAuthorId = authorId;
            this.store.selectedPostId = post.id;
            this.store.markAsViewed(authorId);
            this.refresh();
            window.scrollTo({top: 0, behavior: 'smooth'});
        });
    }

    /**
     * События данных: экспорт JSON, экспорт EPUB, импорт JSON.
     */
    bindDataEvents() {
        $('#exportBtn').on('click', () => {
            this.store.exportJson();
            this.store.markAsExported();
        });

        $('#exportEpubBtn').on('click', () => this.openEpubAuthorsModal());

        $('#importBtn').on('click', () => $('#importFileInput').click());

        // Очистка хранилища с предупреждением
        $('#clearStorageBtn').on('click', () => {
            const authors = this.store.data.authors.length;
            const posts = this.store.data.authors.reduce((s, a) => s + (a.posts?.length || 0), 0);

            if (authors === 0) {
                alert('Хранилище уже пусто.');
                return;
            }

            const msg = 'Удалить всех авторов и произведения из хранилища?\n\n'
                + `Будёт удалено: авторов — ${authors}, произведений — ${posts}.\n`
                + 'Действие нельзя отменить. Рекомендуем сначала сохранить копию («Сохранить...»).';

            if (!confirm(msg)) return;

            this.store.clearAll();
            this.refresh();
        });

        // Загрузка демонстрационного файла из подсказки пустого хранилища.
        // Кнопка перерисовывается при каждом refresh, поэтому делегируем на document.
        $(document).on('click', '#loadExampleBtn', async (e) => {
            e.preventDefault();
            try {
                const res = await fetch('example.json');
                if (!res.ok) throw new Error('not found');
                this.store.importJson(await res.json());
                this.refresh();
            } catch {
                alert('Не удалось загрузить example.json.\n\n'
                    + 'Откройте приложение через локальный сервер (npx serve .) '
                    + 'или загрузите файл вручную через «Данные → Загрузить...».');
            }
        });

        $('#importFileInput').on('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    this.store.importJson(JSON.parse(evt.target.result));
                    this.refresh();
                } catch {
                    alert('Ошибка чтения файла JSON');
                }
            };
            reader.readAsText(file);
        });
    }

    /* ==========================================================================
       6.1 Модальное окно выбора авторов для EPUB
       ========================================================================== */

    /**
     * Открывает модальное окно выбора авторов для экспорта в EPUB.
     * Загружает сохранённый выбор из localStorage.
     */
    openEpubAuthorsModal() {
        const STORAGE_KEY = STORAGE_KEYS.EPUB_AUTHORS;
        const allAuthors = this.store.data.authors || [];

        // Загружаем сохранённый выбор
        let savedSelection = null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) savedSelection = JSON.parse(raw);
        } catch { /* ignore */ }

        // Если сохранённый выбор есть и это массив — используем его, иначе все авторы
        const selectedIds = (Array.isArray(savedSelection) && savedSelection.length > 0)
            ? new Set(savedSelection)
            : new Set(allAuthors.map(a => a.id));

        // Формируем список авторов с чекбоксами
        const listEl = $('#epubAuthorsList');
        listEl.empty();

        allAuthors.forEach(author => {
            const fullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.trim();
            const postsCount = (author.posts || []).length;
            const isChecked = selectedIds.has(author.id) ? 'checked' : '';

            const item = $(`
                <div class="form-check epub-author-item">
                    <input class="form-check-input epub-author-checkbox" type="checkbox"
                           id="epub_author_${author.id}" value="${author.id}" ${isChecked}>
                    <label class="form-check-label d-flex justify-content-between align-items-center w-100"
                           for="epub_author_${author.id}">
                        <span>${escapeHtml(fullName)}</span>
                        <span class="badge bg-secondary rounded-pill">${postsCount} ${this.ui.getPostWord(postsCount)}.</span>
                    </label>
                </div>
            `);
            listEl.append(item);
        });

        // Обработчик «Выбрать всех»
        $('#epubSelectAllBtn').off('click').on('click', () => {
            $('.epub-author-checkbox').prop('checked', true);
        });

        // Обработчик «Снять всех»
        $('#epubDeselectAllBtn').off('click').on('click', () => {
            $('.epub-author-checkbox').prop('checked', false);
        });

        // Обработчик «Скачать»
        $('#epubDownloadBtn').off('click').on('click', () => {
            // Собираем выбранных авторов
            const checkedIds = [];
            $('.epub-author-checkbox:checked').each(function () {
                checkedIds.push($(this).val());
            });

            if (checkedIds.length === 0) {
                alert('Выберите хотя бы одного автора для экспорта.');
                return;
            }

            // Сохраняем выбор в localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedIds));

            // Закрываем модалку и запускаем экспорт
            const modalEl = document.getElementById('epubAuthorsModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            this.store.exportToEpub(checkedIds);
        });

        // Показываем модалку
        const modalEl = document.getElementById('epubAuthorsModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }


    /* ==========================================================================
       7. Статические данные / Static Data
       ========================================================================== */

    /**
     * Список случайных заголовков приложения.
     * Используется только в applyRandomPoeticTitle().
     */
    static poeticTitles = [
        'Фонд хранения авторских мучений', 'Гении на хранении', 'Рифмы и последствия',
        'Шедевры местного значения', 'Архив возвышенного', 'Склад рифм',
        'Полка прекрасного', 'Полка великих и не очень', 'Полка душевного барахла',
        'Полка подозрительной поэзии', 'Полка поэтических происшествий',
        'Цех по переработке чувств', 'Кладбище хороших рифм', 'Государственный фонд страданий',
        'Гениальность на хранении', 'Рифмованные страдания', 'Стихи, которые мы заслужили',
        'Глубокие мысли мелким шрифтом', 'Зачем-то написанное', 'Не трогать, это искусство',
        'Пушкин, выйди', 'Опять эти стихи', 'Стихи. Много.', 'Контролируемая поэзия',
        'Поэты и их последствия', 'Последнее прибежище рифмы', 'Место массового вдохновения',
        'Здесь опять Пушкин', 'Пушкин бы одобрил', 'Пушкин не одобрил',
        'Великие творения неизвестно кого', 'Музей великих заблуждений', 'Парад метафор',
        'Цитаты, которых никто не просил', 'Миллион рифм — и все зря',
        'Высокое искусство низкого давления', 'Слова закончились, остались стихи',
        'Рифмопровод', 'Рифмохранилище', 'Метафорный склад', 'Склад эмоционального лома',
        'Литературный холодильник', 'Поэтический пылесос', 'Пункт приёма метафор',
        'Поэзия времён хранения', 'Утилизация прозы', 'Реактор возвышенных состояний',
        'Инкубатор бессмертия', 'Поэтическая полка', 'Кладовка поэзии', 'Заповедник рифм',
        'Резервуар прекрасного', 'Хранилище вдохновения', 'Склад душевных терзаний',
        'Шкафчик возвышенного', 'Уголок страдающих авторов', 'Комната поэтических мучений',
        'Накопитель стихов', 'Депо прекрасного', 'Страдания на рифме', 'Рифмоприёмник',
        'Поэтический склад № 1', 'Гараж для гениев', 'Музей несбывшихся метафор',
        'Министерство рифм', 'Комбинат по производству прекрасного',
        'Отдел по производству стихов', 'Управление по делам рифм',
        'Департамент возвышенных мыслей', 'Министерство поэтических дел',
        'Реестр рифмованных граждан', 'Архив особо ценных метафор',
        'Отдел учёта вдохновения', 'Картотека душевных переживаний',
        'Единый реестр стихотворений', 'Комиссия по особо важным рифмам',
        'Государственное хранилище рифм', 'Бюро по учёту прекрасного',
        'Главное управление метафор', 'Центральный архив поэзии',
        'Департамент стихотворных происшествий', 'Отдел рифмованного имущества',
        'Комитет по возвышенным вопросам', 'Управление по борьбе с белым стихом',
        'Инвентаризация вдохновения', 'Картотека великих мыслей',
        'Хранилище литературных ценностей', 'Фонд особо выдающихся рифм',
        'Научно-исследовательский склад поэзии', 'Центр хранения душевных состояний',
        'Кладбище невинных глаголов', 'Мусороперерабатывающий завод чувств',
        'Архив напрасно потраченных чернил', 'Заповедник непризнанных гениев',
        'Кунсткамера душевных порывов', 'Приют несъедобных рифм',
        'Департамент упущенного смысла', 'Завод по розливу экзистенциальной тоски',
        'Институт недосказанной ерунды', 'Склад просроченных метафор',
        'Центр утилизации рифмы «кровь-любовь»', 'Сборник рифмованных извинений',
        'Выставка достижений графомании', 'Палата № 6 имени Есенина',
        'Поэзия средней паршивости', 'Бюро бессмысленных откровений',
        'Комитет по завышенной самооценке', 'Супермаркет сопливых метафор',
        'Цех по сборке душевной драмы', 'Музей пыльной драмы',
        'Жертвы школьной программы', 'Обитель сомнительных талантов',
        'Бюро выдачи липового вдохновения', 'Лаборатория потешных страданий',
        'Реестр напрасных надежд', 'Отдел списания шедевров',
        'Заповедник глагольных рифм', 'Фонд спасения тонущего смысла',
        'Спецхранилище сомнительной лирики', 'Фабрика картонных слёз',
        'Стихи. Опять.', 'Текст в столбик', 'Ну, рифмы', 'Строчки с переносом',
        'Опять про любовь, наверное', 'Буквы по центру', 'Поэзия. В ассортименте.',
        'Снова эти ваши рифмы', 'Графомания. Свежее.', 'Рифмы. Оптом.',
        'Стихотворения (к сожалению)', 'Лирика. Зачем-то.', 'Стихи. Снова.',
        'Очередной шедевр. Честно.', 'Кто-то это написал', 'Рифма есть. Смысла нет.',
        'Так получилось', 'Слова. Много слов.', 'Поэзия. Пачка.',
        'Пачка рифмованной бумаги', 'Зачем-то стихи', 'Опять наболело',
        'Написалось и лежит', 'Рифмованные строчки. Разные.', 'Кусок лирики',
        'Просто рифмы', 'Стихи. Разборчиво.', 'Ещё немного бреда',
        'Набор слов с рифмой', 'Шедевры (нет)'
    ];

    /**
     * Список случайных подзаголовков приложения.
     * Используется только в applyRandomPoeticTitle().
     */
    static poeticSubtitles = [
        'Центр контроля за ямбом', 'Архив особо ценных метафор', 'Отдел учёта вдохновения',
        'Министерство поэтических дел', 'Картотека душевных переживаний',
        'Рифмы на ответственном хранении', 'Комиссия по особо важным рифмам',
        'Реестр рифмованных граждан', 'Отдел по производству стихов',
        'Не трогать, это искусство', 'Здесь рождается бессмертие',
        'Бессмертие временно недоступно', 'Место массового вдохновения',
        'Последнее прибежище метафор', 'Центр по борьбе с ямбом',
        'Слова закончились, остались стихи', 'Ответственность за прочитанное не предусмотрена',
        'Территория возвышенных переживаний', 'Место, где рифмуют', 'Контроль качества метафор',
        'Учёт душевных терзаний', 'Пункт приёма рифм', 'Рифмы принимаются круглосуточно',
        'Выдача вдохновения по талонам', 'Отдел особо возвышенных случаев',
        'Хранилище эмоционального имущества', 'Глубина мысли не гарантируется',
        'Содержание может вызывать вдохновение', 'Все совпадения с поэзией случайны',
        'Возможны следы высокого искусства', 'Не является медицинской помощью',
        'Принимать по одному стихотворению', 'Перед употреблением ознакомиться с рифмой',
        'Не смешивать с прозой', 'Хранить вдали от критиков', 'Беречь от литературоведов',
        'Не подвергать редактуре', 'Исправлению не подлежит', 'Автор за последствия не отвечает',
        'Смысл может отсутствовать', 'Метафоры могут быть неожиданными',
        'Рифма обнаружена', 'Ямб под наблюдением', 'Хорей временно недоступен',
        'Размер установлен условно', 'Страдание соответствует норме', 'Уровень пафоса повышен',
        'Пафос под контролем', 'Возвышенность в пределах нормы', 'Эмоциональный фон нестабилен',
        'Здесь опять эти стихи', 'Пушкин бы одобрил', 'Пушкин не одобрил', 'Пушкин, выйди',
        'Гений временно занят', 'Гениальность подтверждается документально',
        'Шедевр находится на хранении', 'Местное значение подтверждено',
        'Склад работает без выходных', 'Вход свободный, выход через рифму',
        'Рифмованное имущество учтено', 'Метафоры пересчитаны', 'Все стихи пронумерованы',
        'Вдохновение инвентаризировано', 'Душевные муки зарегистрированы',
        'Авторские страдания поставлены на учёт', 'Литературный лом принят',
        'Проза временно не принимается', 'Белый стих находится под наблюдением',
        'Свободная рифма разрешена', 'Стихотворные работы ведутся',
        'Производство прекрасного не остановлено', 'Ведётся накопление бессмертия',
        'Глубокие мысли — мелким шрифтом', 'Неизвестно зачем, но красиво',
        'Смысл будет найден позднее', 'Продолжение следует', 'Всё уже было сказано',
        'Но мы попробуем ещё раз', 'Осторожно: высокое напряжение пафоса',
        'Перед прочтением отключите логику', 'Одобрено вашей бывшей',
        'Смысловая нагрузка не предусмотрена базовой комплектацией',
        'Протестировано на котах (коты в шоке)',
        'Ни один настоящий поэт при создании не пострадал',
        'Сделано на коленке в три часа ночи',
        'Осторожно, повышенная концентрация глагольных рифм',
        'Не рекомендуется лицам со здравым смыслом',
        'В случае душевного тонуса закрыть немедленно',
        'Гарантия литературной ценности аннулирована', 'Смысл утонул во втором куплете',
        'Пафос зашкаливает, пристегните ремни', 'Разработано без участия здравого смысла',
        'Основано на реальных соплях', 'Содержит повышенный уровень экзистенциального кринжа',
        'За последствия для вашего вкуса автор ответственности не несёт',
        'Все совпадения с поэзией — чистая случайность',
        'Не пытайтесь повторить это в трезвом уме',
        'Рекомендовано для поднятия самооценки других авторов',
        'Принимать строго по одной строчке, запивая водой',
        'Хранить в сухом месте, подальше от критиков',
        'Автор сам не понял, но получилось красиво', 'Литературоведам вход строго воспрещён',
        'Возможны побочные эффекты в виде нервного смешка',
        'Содержание соответствию реальности не подлежит',
        'Написано ради трёх лайков и одного комментария',
        'Бессмертие откладывается на неопределённый срок',
        'Вход по пропускам, выход по рифме',
        'Качество метафор гарантировано только автором'
    ];
}


/* ==========================================================================
   Старт приложения
   ========================================================================== */

$(document).ready(() => {
    window.app = new PoemApp();
    window.app.init();
});