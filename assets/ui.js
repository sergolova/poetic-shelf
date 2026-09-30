/**
 * ==========================================================================
 * assets/ui.js
 * Класс PoemUI — управляет всем интерфейсом приложения.
 * Отвечает за рендеринг списков, карточек, модальных окон,
 * навигацию по сайдбару и вспомогательные форматирующие функции.
 * ==========================================================================
 */

class PoemUI {

    /* ==========================================================================
       1. Конструктор / Constructor
       ========================================================================== */

    constructor() {
        this.$authorsList = $('#authorsList');
        this.$authorsCount = $('#authorsCount');
        this.$mainContent = $('#mainContent');

        this.authorModal = new bootstrap.Modal(document.getElementById('authorModal'));
        this.postModal = new bootstrap.Modal(document.getElementById('postModal'));

        // Автофокус на textarea при открытии модалки произведения
        document.getElementById('postModal').addEventListener('shown.bs.modal', () => {
            const isHtml = $('#useHtmlToggle').prop('checked');
            $(isHtml ? '#postContentHtml' : '#postContent').focus();
        });
    }


    /* ==========================================================================
       2. Навигация по Сайдбару / Sidebar Navigation
       (Перенесено из utilities.js — это DOM-операции над элементами сайдбара,
        принадлежащие уровню View)
       ========================================================================== */

    /**
     * Плавно прокручивает сайдбар к карточке автора.
     * @param {string} authorId
     */
    scrollToAuthor(authorId) {
        if (!authorId) return;
        const $container = $('#authorsList');
        const $target = $container.find(`.author-card[data-id="${authorId}"]`);
        if (!$target.length) return;

        $container.find('.author-card').removeClass('active');
        $target.addClass('active');
        $target[0].scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }

    /**
     * Плавно прокручивает сайдбар к конкретному произведению автора.
     * @param {string} authorId
     * @param {string} postId
     */
    scrollToPost(authorId, postId) {
        if (!authorId || !postId) return;
        const $container = $('#authorsList');
        const $authorLink = $container.find(`.author-card[data-id="${authorId}"]`);
        if (!$authorLink.length) return;

        $container.find('.author-card').removeClass('active');
        $authorLink.addClass('active');
        $container.find('.author-post-item').removeClass('active');

        const $postLink = $authorLink
            .siblings('.author-posts-list')
            .find(`.author-post-item[data-post-id="${postId}"]`);

        if ($postLink.length) {
            $postLink.addClass('active');
            $postLink[0].scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }
    }


    /* ==========================================================================
       3. Поиск и Подсветка / Search & Highlighting
       ========================================================================== */

    /**
     * Подсвечивает совпадения поискового запроса в HTML-тексте.
     * @param {string} htmlContent
     * @param {string} query
     * @returns {string}
     */
    highlightText(htmlContent, query) {
        const fuzzyReg = this._buildFuzzySearchRegExp(query);
        if (!fuzzyReg) return htmlContent;

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
        const container = doc.body.firstChild;
        const walk = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        const toReplace = [];

        let node;
        while ((node = walk.nextNode())) {
            if (fuzzyReg.test(node.nodeValue)) toReplace.push(node);
        }

        toReplace.forEach(textNode => {
            const span = doc.createElement('span');
            span.innerHTML = textNode.nodeValue.replace(
                fuzzyReg,
                '<mark class="bg-warning text-dark p-0">$1</mark>'
            );
            textNode.parentNode.replaceChild(span, textNode);
        });

        return container.innerHTML;
    }

    /**
     * Строит RegExp для нечёткого поиска (е/ё, и/й, ударения).
     * @private
     */
    _buildFuzzySearchRegExp(query) {
        if (!query) return null;
        const normalized = query.trim().normalize('NFD');
        let pattern = '';

        for (const char of normalized) {
            if (/[\u0300-\u036f]/.test(char)) continue;
            const lower = char.toLowerCase();
            if (lower === 'е' || lower === 'ё') {
                pattern += '[еёЕЁ][\\u0300-\\u036f]*';
            } else if (lower === 'и' || lower === 'й') {
                pattern += '[ийИЙ][\\u0300-\\u036f]*';
            } else if (/[a-zа-яё]/i.test(char)) {
                pattern += `${this._escapeRegExp(char)}[\\u0300-\\u036f]*`;
            } else {
                pattern += this._escapeRegExp(char);
            }
        }

        return new RegExp(`(${pattern})`, 'gi');
    }

    /** @private */
    _escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }


    /* ==========================================================================
       4. Рендеринг Сайдбара / Sidebar Rendering
       ========================================================================== */

    /**
     * Сортирует произведения по умолчанию (год → название).
     * @param {Array} posts
     */
    _sortPostsDefault(posts) {
        posts.sort((a, b) => {
            const ay = a.year || 0;
            const by = b.year || 0;
            if (ay !== by) return ay - by;
            return (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase(), 'ru');
        });
    }

    /**
     * Отрисовывает список авторов в левом сайдбаре.
     * @param {Array}  authors
     * @param {string} selectedId
     * @param {string} selectedPostId
     * @param {string} searchQuery
     */
    renderAuthorsList(authors, selectedId, selectedPostId = null, searchQuery = '') {
        this.$authorsList.empty();
        this.$authorsCount.text(authors.length);

        const totalPosts = authors.reduce((sum, a) => sum + (a.posts?.length || 0), 0);
        $('#postsCount').text(totalPosts);

        const q = searchQuery.toLowerCase().trim();
        const $sidebar = $('.authors-sidebar, .search-input-wrapper');
        q ? $sidebar.addClass('query-selection') : $sidebar.removeClass('query-selection');

        if (authors.length === 0) {
            this.$authorsList.html('<div class="p-3 text-muted small">Авторы не найдены&nbsp;&nbsp;&nbsp;<a class="view-all" href="#">Сбросить поиск</a></div>');
            return;
        }

        authors.forEach(author => {
            const isActive = author.id === selectedId;
            const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);
            const isMatchedAuthor = q && isAuthorMatch(author, q);

            let authorPosts = author.posts || [];
            if (q && authorPosts.length > 0) {
                authorPosts = authorPosts.filter(p => isPostMatch(p, q));
            }
            this._sortPostsDefault(authorPosts);

            const postsCount = (isMatchedAuthor && authorPosts.length === 0)
                ? author.posts.length
                : authorPosts.length;

            let postsListHtml = '';
            const showPosts = q ? authorPosts.length > 0 : (isActive && authorPosts.length > 0);

            if (showPosts) {
                const itemsHtml = authorPosts.map(p => {
                    const isPostActive = p.id === selectedPostId;
                    const bookmarkIcon = this.renderBookmarkIcon(p.id, app.store.getPostBookmark(p.id));
                    return `<span class="author-post-item d-flex align-items-center justify-content-between py-2 px-3 ${isPostActive ? 'active' : ''}" data-post-id="${p.id}">
            <span class="author-post-title-wrapper">
                <span class="author-post-title text-truncate">${escapeHtml(p.title)}</span>
                ${bookmarkIcon}
            </span>
            ${p.year ? `<span class="author-post-year text-muted flex-shrink-0 ms-2">${p.year}</span>` : ''}
        </span>`;
                }).join('');
                postsListHtml = `<div class="author-posts-list" style="display:none;">${itemsHtml}</div>`;
            }

            const hideYears = !author.birthYear && !author.deathYear;
            let authorName = author.lastName + ' ' + author.firstName;
            authorName = this.highlightText(authorName, q);

            this.$authorsList.append(`
        <div class="author-card-wrapper">
          <span class="list-group-item list-group-item-action author-card ${isActive ? 'active' : ''} d-flex align-items-center gap-3 py-3 border-bottom" data-id="${author.id}">
            <div class="author-avatar-wrapper">
              <img src="${avatar}" class="author-avatar-img avatar-style" alt="${author.lastName}">
            </div>
            <div class="author-info flex-grow-1 overflow-hidden">
              <h6 class="author-name mb-0 text-truncate">${authorName}</h6>
              <span class="author-years text-muted" ${hideYears ? 'style="display:none"' : ''}>${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'}</span>
            </div>
            <span class="posts-count-badge">${postsCount}</span>
          </span>
          ${postsListHtml}
        </div>`);
        });
    }


    /* ==========================================================================
       5. Рендеринг Главной области / Main Content Rendering
       ========================================================================== */

    /**
     * Отрисовывает профиль автора (Hero) и его произведения.
     * @param {Object|null} author
     * @param {string} searchQuery
     * @param {string|null} selectedPostId
     */
    renderAuthorMain(author, searchQuery = '', selectedPostId = null) {
        if (!author) {
            this.$mainContent.html(`
        <div class="text-center text-muted my-5 py-5">
          <span class="display-1">📚</span>
          <h4 class="mt-3">Выберите автора из списка слева или добавьте нового</h4>
        </div>`);
            return;
        }

        const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);
        const q = searchQuery.toLowerCase().trim();
        let posts = author.posts || [];
        const allPostsCount = author.posts?.length || 0;

        if (q) {
            posts = posts.filter(p => isPostMatch(p, q));
        }

        const displayPosts = selectedPostId
            ? posts.filter(p => p.id === selectedPostId)
            : posts;

        this._sortPostsDefault(displayPosts);

        const emptyHtml = displayPosts.length  === 0;
        const postsHtml = !emptyHtml
            ? displayPosts.map(p => this.createPoemCardHtml(p, author, q)).join('')
            : `<div class="alert alert-light text-center border py-4 text-muted">
          ${searchQuery ? 'В произведениях этого автора совпадений не найдено. <a class="view-all" href="#">Смотреть все</a>' : 'У этого автора пока нет сохранённых стихов'}
         </div>`;

        const hideYears = !author.birthYear && !author.deathYear;
        const currentYear = new Date().getFullYear();
        const numYears = author.birthYear ? ((author.deathYear ?? currentYear) - author.birthYear) : null;
        const ageString = numYears !== null ? ` (${numYears} ${this.getAgeWord(numYears)})` : '';
        let authorName = `${author.lastName || ''} ${author.firstName || ''} ${author.surName || ''}`.trim();
        authorName = this.highlightText(authorName, q);

        const moreCount = allPostsCount - 1;
        const morePosts = (!emptyHtml && allPostsCount > 1 && selectedPostId !== null)  ? `<div class="mb-2"><a class="view-all" href="#">Ещё ${moreCount} >></a></div>` : '';

        this.$mainContent.html(`
      <div class="author-profile-hero border-0">
        <div class="card-body pb-4 pt-4 d-flex align-items-center justify-content-between flex-wrap gap-4">
          <div class="d-flex align-items-center gap-4">
            <img src="${avatar}" class="hero-avatar-img avatar-style" alt="${author.lastName}">
            <div>
              <div class="hero-author-wrapper">
                <h2 class="hero-author-name mb-1">
                  <a class="author-wiki-link" href="${this.getWikiLink(authorName)}">${authorName}</a>
                </h2>
                <div>
                  <button class="btn btn-link text-muted p-0 ms-2 edit-post-btn svg-button" id="editAuthorBtn" title="Редактировать">✏️</button>
                  <button class="btn btn-link text-muted p-0 ms-2 edit-post-btn svg-button" id="addPostBtn" title="Добавить стих">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="hero-author-meta d-flex align-items-center gap-2 text-muted">
                <span ${hideYears ? 'style="display:none"' : ''}>📅 ${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'} ${ageString}&nbsp;&nbsp;•</span>
                📖
                <a class="view-all" href="#">${author.posts?.length || 0} произведений</a>
                <span>${q ? `(найдено: ${posts.length})` : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="posts-feed">
         ${postsHtml} 
         ${morePosts}
      </div>`);
    }

    /**
     * Создаёт HTML карточки произведения.
     * @param {Object} post
     * @param {Object} author
     * @param {string} query
     * @returns {string}
     */
    createPoemCardHtml(post, author, query = '') {
        // Распознавание перевода (оригинал + перевод)
        let detectText = post.content || '';
        if (!detectText && post.contentHtml) {
            const tmp = document.createElement('div');
            tmp.innerHTML = post.contentHtml;
            detectText = tmp.textContent || '';
        }
        const translation = detectTranslationPattern(detectText);
        const isParallel = translation.isTranslation && localStorage.getItem('columns') === 'parallel';

        // Форматирует одну строку с учётом перевода
        const formatLine = (line, idx, dataIndex = null) => {
            if (!line.trim()) return '';
            const processed = query ? this.highlightText(line, query) : line;
            const extraClass = translation.isTranslation && translation.lineTypes[idx] === 'translate'
                ? ' poem-line--translation' : ' poem-line--original';
            return `<span class="poem-line${extraClass}" data-line-index="${dataIndex !== null ? dataIndex : idx}">${processed}</span>`;
        };

        // Обычный режим: все строки подряд
        const formatLines = (text) => {
            if (!text) return '';
            return text.split('\n').map((line, idx) => formatLine(line, idx)).join('\n');
        };

        // Параллельный режим: оригинал слева, перевод справа
        const buildParallelColumns = (text) => {
            if (!text) return { left: '', right: '' };
            const lines = text.split('\n');
            const leftCol = [], rightCol = [];

            lines.forEach((line, idx) => {
                const type = translation.lineTypes[idx];

                if (type === 'translate') {
                    const span = formatLine(line, idx, rightCol.length);
                    rightCol.push(span);
                } else if (type === 'original') {
                    const span = formatLine(line, idx, leftCol.length);
                    leftCol.push(span);
                } else {
                    rightCol.push('');
                    leftCol.push('');
                }
            });

            return {
                left: `<pre class="poem-content">${leftCol.join('\n')}</pre>`,
                right: `<pre class="poem-content">${rightCol.join('\n')}</pre>`
            };
        };

        const rawContent = post.contentHtml ? post.contentHtml : escapeHtml(post.content);
        let bodyHtml;
        if (isParallel) {
            const cols = buildParallelColumns(rawContent);
            bodyHtml = `
                <div class="poem-parallel-container">
                    <div class="poem-text-container poem-parallel-col">${cols.left}</div>
                    <div class="poem-text-container poem-parallel-col">${cols.right}</div>
                </div>`;
        } else {
            bodyHtml = `<div class="poem-text-container mt-4"><pre class="poem-content">${formatLines(rawContent)}</pre></div>`;
        }
        const titleHtml = query ? this.highlightText(escapeHtml(post.title), query) : escapeHtml(post.title);
        const noteHtml = (post.note && query) ? this.highlightText(escapeHtml(post.note), query) : escapeHtml(post.note);
        const isYoutube = (url) => /(youtube\.com|youtu\.be)/i.test(url);
        const postMatch = query && isPostMatch(post, query);
        const writtenYears = (author?.birthYear && post.year) ? post.year - author.birthYear : '';
        const yearsWord = writtenYears ? this.getAgeWord(writtenYears) : '';
        const bookmarkBtn = this.renderBookmarkButton(post.id, app.store.getPostBookmark(post.id));

        const linksHtml = (post.links?.length > 0)
            ? `<div class="poem-links d-flex align-items-center gap-2 flex-wrap pt-2 border-top mt-3">
         <small class="text-muted fw-bold"></small>
         ${post.links.map(l => {
                const icon = isYoutube(l.url) ? '▶️' : '🔗';
                const ytId = this.getYouTubeId(l.url);
                const thumb = ytId ? `<span class="link-yt-tooltip"><img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="thumbnail"></span>` : '';
                return `<span class="link-tooltip-container position-relative d-inline-block">
                 <a href="${l.url}" target="_blank" rel="noopener noreferrer" class="poem-link-badge">${icon} ${escapeHtml(l.title || l.url)} ↗</a>
                 ${thumb}
               </span>`;
            }).join('')}
       </div>` : '';

        return `
      <article class="${postMatch ? 'query-selection' : ''} paper-bg-light poem-card card border-0 shadow-sm mb-4" data-author-id="${author.id}" data-post-id="${post.id}">
        <div class="card-body p-4 pt-0">
          <div class="d-flex align-items-center justify-content-between pb-0 border-bottom" style="height: 4em">
            <div class="post-header-wrapper">
              <h3 class="poem-title mb-0">${titleHtml}</h3>
              <div class="post-bookmark-wrapper">${bookmarkBtn}</div>
            </div>
            <div class="d-flex align-items-center gap-2">
              ${post.year ? `<span class="poem-year-tag">${post.year} г ${writtenYears ? `, ${writtenYears} ${yearsWord}` : ''}</span>` : ''}
              <button class="btn btn-link text-muted p-0 ms-2 edit-post-btn svg-button" data-post-id="${post.id}" title="Редактировать">✏️</button>
            </div>
          </div>
          ${bodyHtml}
          ${post.note ? `<div class="poem-note-box mt-4"><span class="note-icon">💡</span> <pre class="poem-note-content">${noteHtml}</pre></div>` : ''}
          ${linksHtml}
        </div>
      </article>`;
    }


    /* ==========================================================================
       6. Кнопки и Иконки Закладок / Bookmark Controls
       ========================================================================== */

    /**
     * Создаёт HTML кнопки закладки для карточки произведения.
     * @param {string} postId
     * @param {boolean} state
     * @returns {string}
     */
    renderBookmarkButton(postId, state) {
        const active = Boolean(state);
        return `
      <button class="btn btn-link text-muted p-0 ms-2 bookmark-btn svg-button ${active ? 'active' : ''}" title="${active ? 'Убрать закладку' : 'Поставить закладку'}" data-post-id="${postId}">
        <svg class="bookmark-icon bookmark-empty ${active ? 'd-none' : ''}" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <svg class="bookmark-icon bookmark-filled ${!active ? 'd-none' : ''}" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>`;
    }

    /**
     * Создаёт HTML иконки закладки для элемента в сайдбаре.
     * @param {string} postId
     * @param {boolean} state
     * @returns {string}
     */
    renderBookmarkIcon(postId, state) {
        if (!state) return '';
        return `<svg class="bookmark-icon bookmark-filled item-bookmark-filled" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>`;
    }


    /* ==========================================================================
       7. Модальные окна / Modals
       ========================================================================== */

    /**
     * Открывает модалку создания/редактирования автора.
     * @param {Object|null} author
     */
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

    /** Закрывает модалку автора. */
    closeAuthorModal() {
        this.authorModal.hide();
    }

    /**
     * Открывает модалку создания/редактирования произведения.
     * @param {Object|null} post
     * @param {string|null} currentAuthorId
     * @param {Array} authors
     */
    openPostModal(post = null, currentAuthorId = null, authors = []) {
        $('#postForm')[0].reset();
        $('#postId').val('');
        $('#postAuthorId').val('');
        $('#postAuthorSearch').val('');
        $('#linksListContainer').empty();
        $('#authorSearchDropdown').addClass('d-none').empty();

        if (post) {
            $('#postModalLabel').text('Редактировать произведение');
            $('#postId').val(post.id);
            $('#postTitle').val(post.title);
            $('#postYear').val(post.year || '');
            $('#postNote').val(post.note || '');

            const postAuthor = authors.find(a => a.id === post.authorId);
            if (postAuthor) {
                $('#postAuthorId').val(postAuthor.id);
                $('#postAuthorSearch').val(`${postAuthor.lastName} ${postAuthor.firstName}`);
            }

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

            (post.links || []).forEach(l => this.addLinkRow(l.title, l.url));
            $('#deletePostBtn').removeClass('d-none');
        } else {
            $('#postModalLabel').text('Добавить произведение');
            $('#useHtmlToggle').prop('checked', false);
            $('#plainTextContainer').removeClass('d-none');
            $('#htmlTextContainer').addClass('d-none');
            $('#deletePostBtn').addClass('d-none');

            if (currentAuthorId) {
                const a = authors.find(a => a.id === currentAuthorId);
                if (a) {
                    $('#postAuthorId').val(a.id);
                    $('#postAuthorSearch').val(`${a.lastName} ${a.firstName}`);
                }
            }
        }

        this.postModal.show();
    }

    /** Закрывает модалку произведения. */
    closePostModal() {
        this.postModal.hide();
    }

    /**
     * Отрисовывает автокомплит авторов в модалке произведения.
     * @param {Array} authors
     * @param {string} query
     */
    renderAuthorSearchDropdown(authors, query) {
        const $dropdown = $('#authorSearchDropdown');
        $dropdown.empty();

        if (!query?.trim()) {
            $dropdown.addClass('d-none');
            return;
        }

        const filtered = authors.filter(a => isAuthorMatch(a, query.toLowerCase().trim()));

        if (filtered.length === 0) {
            $dropdown.html('<div class="p-2 text-muted small text-center">Ничего не найдено</div>');
        } else {
            filtered.forEach(author => {
                const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);
                $dropdown.append(`
                    <div class="author-search-item" data-author-id="${author.id}">
                        <img src="${avatar}" alt="">
                        <div class="author-search-item-info">
                            <div class="author-search-item-name">${escapeHtml(author.lastName)} ${escapeHtml(author.firstName)}</div>
                            <div class="author-search-item-years">${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'}</div>
                        </div>
                    </div>`);
            });
        }

        $dropdown.removeClass('d-none');
    }

    /**
     * Добавляет строку ввода ссылки в форму произведения.
     * @param {string} title
     * @param {string} url
     * @param {boolean} focusUrl
     */
    addLinkRow(title = '', url = '', focusUrl = false) {
        $('#linksListContainer').append(`
      <div class="link-row d-flex gap-2 align-items-center">
        <input type="text" class="form-control form-control-sm link-title-input" placeholder="Название (опционально)" value="${escapeHtml(title)}">
        <input type="url"  class="form-control form-control-sm link-url-input"   placeholder="https://..." value="${escapeHtml(url)}">
        <button type="button" class="btn btn-outline-danger btn-sm remove-link-btn">✕</button>
      </div>`);

        if (focusUrl) {
            $('#linksListContainer .link-row:last .link-url-input').focus();
        }
    }


    /* ==========================================================================
       8. Выпадающее меню Закладок / Bookmarks Dropdown
       ========================================================================== */

    /**
     * Генерирует HTML выпадающего меню со списком стихов.
     * @param {Array}  posts
     * @param {string} title
     * @param {string} customClass
     * @returns {string}
     */
    renderPostsDropdown(posts, title = '', customClass = '') {
        if (!posts?.length) return '';

        const items = posts.map(post => {
            const author = app.store.getAuthorById(post.authorId);
            return `<li>
              <div class="dropdown-item timeline-post-link" data-post-id="${post.id}">
                <div class="author-time-item-left">
                  <span class="author-time-item">${author ? escapeHtml(author.lastName) + ':' : ''}</span>
                  <span class="text-truncate">${escapeHtml(post.title)}</span>
                </div>
              </div>
            </li>`;
        }).join('');

        return `<div class="timeline-dropdown-menu shadow-sm ${customClass}">
            ${title ? `<div class="timeline-dropdown-header">${escapeHtml(String(title))}</div>` : ''}
            <ul class="list-unstyled mb-0">${items}</ul>
        </div>`;
    }

    /**
     * Генерирует HTML выпадающего меню закладок.
     * @returns {string}
     */
    renderBookmarksDropdown() {
        const ids = Object.keys(app.store.postBookmarks || {});

        if (ids.length === 0) {
            return `<div class="timeline-dropdown-menu shadow-sm show">
                <div class="timeline-dropdown-header">Закладки</div>
                <div class="p-3 text-muted text-center style-sm">Нет закладок</div>
            </div>`;
        }

        const bookmarkedPosts = [];
        app.store.data.authors.forEach(author => {
            (author.posts || []).forEach(post => {
                if (app.store.postBookmarks[post.id]) {
                    bookmarkedPosts.push({...post, authorId: author.id});
                }
            });
        });

        sortPosts(bookmarkedPosts)

        return this.renderPostsDropdown(bookmarkedPosts, 'Закладки', 'show');
    }

    /**
     * Переключает видимость меню закладок.
     * @param {HTMLElement} container
     */
    toggleBookmarksMenu(container) {
        const dropdownContainer = container.querySelector('.bookmarks-dropdown-container');
        if (dropdownContainer.innerHTML.trim() !== '') {
            dropdownContainer.innerHTML = '';
        } else {
            dropdownContainer.innerHTML = this.renderBookmarksDropdown();
        }
    }


    /* ==========================================================================
       9. Хелперы форматирования / Format Helpers
       ========================================================================== */

    /**
     * Создаёт SVG-аватар с инициалами автора.
     * @param {string} name
     * @returns {string} data-URI
     */
    getInitialsAvatar(name) {
        const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
        return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23d8c8b8'/><text x='50%' y='55%' font-size='35' text-anchor='middle' dominant-baseline='middle' fill='%235c4a3e'>${initials || '?'}</text></svg>`;
    }

    /**
     * Возвращает ссылку на поиск автора в Википедии.
     * @param {string} authorName
     * @returns {string}
     */
    getWikiLink(authorName) {
        return authorName
            ? `https://ru.wikipedia.org/w/index.php?search=${encodeURIComponent(authorName.trim())}`
            : '#';
    }

    /**
     * Склоняет слово «год/года/лет» по числу.
     * @param {number} age
     * @returns {string}
     */
    getAgeWord(age) {
        if (age === null || age === undefined || isNaN(age)) return '';
        const abs = Math.abs(Number(age));
        const mod = abs % 100;
        const last = abs % 10;
        if (mod >= 11 && mod <= 14) return 'лет';
        if (last === 1) return 'год';
        if (last >= 2 && last <= 4) return 'года';
        return 'лет';
    }

    /**
     * Извлекает ID видео YouTube из ссылки.
     * @param {string} url
     * @returns {string|null}
     */
    getYouTubeId(url) {
        if (!url) return null;
        const match = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
        return (match && match[2].length === 11) ? match[2] : null;
    }
}


/* ==========================================================================
   Хелпер: распознавание перевода (оригинал + русский перевод)
   ========================================================================== */

/* Пороги распознавания перевода. Каждый закрывает свою ложную срабатывающую
   ситуацию; менять их по одному нельзя — они работают только вместе. */
const TRANSLATION_MIN_LINE_LETTERS = 5;   // короче — 'skip', см. ниже
const TRANSLATION_DOMINANCE        = 0.5;  // доля букв доминирующего алфавита
const TRANSLATION_MIN_PAIRS        = 2;   // минимум полных пар original->translate
const TRANSLATION_MIN_COVERAGE     = 0.25;// доля непустых строк, охваченных парами
const TRANSLATION_THRESHOLD        = 0.5; // порог confidence

/**
 * Анализирует текст и определяет, является ли он переводом
 * (оригинал + русский перевод построчно).
 *
 * Алгоритм:
 *   1. Классифицирует каждую строку как 'original' (латиница),
 *      'translate' (кириллица), 'mixed', 'skip' или 'empty'.
 *   2. Для 2-3 непустых строк проверяет пару и требование чистоты алфавита.
 *   3. Для остальных текстов считает долю строк 'original', за которыми
 *      сразу идёт 'translate', и долю строк, охваченных такими парами.
 *   4. Вычисляет уверенность (confidence) из этих двух долей.
 *
 * Решения, важные для понимания (каждое закрывает найденный на реальной
 * библиотеке ложный случай):
 *
 *   - MIN_LINE_LETTERS: строка короче 5 букв получает тип 'skip' и не
 *     участвует ни в одном счётчике, и не разрывает соседство строк.
 *     Без этого римские цифры в переносках станс («XIII», «XIV») проходили
 *     как 'original': у «XIII» все 4 буквы латинские, т.е. доля 100%,
 *     и порог доминирования их не отсекал. Это ломало «Ответ Онегина
 *     на письмо Татьяны» — followRatio доходил до 1.0.
 *
 *   - DOMINANCE = 0.5 (а не 0.65): если букв одного алфавита строго
 *     больше, строка считается принадлежащей ему. Порог 0.65 отправлял
 *     строку Блока «Чем quantum satis Бранда воли,» (13 кириллических
 *     против 12 латинских) в 'mixed', то есть двуязычной. При 0.5 она
 *     однозначно 'translate' — это русская строка с латинской вставкой.
 *
 *   - Гейты MIN_PAIRS и MIN_COVERAGE проверяются ДО вычисления confidence
 *     и обнуляют его. Перевод требует минимум две полные пары, покрывающие
 *     не менее четверти непустых строк. Это отсекает одиночную
 *     латинскую строку внутри русского стихотворения — «In vino veritas!»
 *     в «Незнакомке» давала пару, но покрывала 4% текста.
 *
 *   - Спецслучай 2-3 строк не смотрит на порядок (раньше распознавался
 *     только original->translate, но не translate->original) и требует
 *     ЧИСТОГО алфавита в каждой строке: у 'original' не должно быть ни
 *     одной кириллической буквы, у 'translate' — ни одной латинской.
 *     Иначе «Кто там? кричат. / «In vino veritas!» кричат.» сочлось бы
 *     переводом: строка с цитатой набирает 13 латинских против 6
 *     кириллических и выглядит 'original', но кириллица в ней есть.
 *
 * @param {string} text - Исходный текст произведения.
 * @returns {{ isTranslation: boolean, lineTypes: string[], confidence: number }}
 *   - isTranslation:  true, если уверенность >= TRANSLATION_THRESHOLD
 *   - lineTypes:      массив типов для каждой строки (совпадает с split('\n'))
 *   - confidence:     число от 0 до 1
 */
function detectTranslationPattern(text) {
    const result = { isTranslation: false, lineTypes: [], confidence: 0 };
    if (!text) return result;

    const lines = text.split('\n');
    result.lineTypes = new Array(lines.length).fill('empty');

    const nonEmpty = [];
    const CYR_RE = /[а-яА-ЯёЁіІїЇєЄґҐ]/g;
    const LAT_RE = /[a-zA-Z]/g;

    /** Количество кириллических и латинских букв в строке. */
    const countLetters = (line) => {
        const trimmed = line.trim();
        return {
            cyrillic: (trimmed.match(CYR_RE) || []).length,
            latin:    (trimmed.match(LAT_RE) || []).length,
            total:    (trimmed.replace(/[^a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ]/g, '')).length
        };
    };

    // 1. Классификация строк (с поддержкой кириллицы UA/RU)
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) {
            result.lineTypes[i] = 'empty';
            return;
        }

        const { cyrillic, latin, total } = countLetters(line);

        // Слишком короткая строка: римские цифры, отдельные слова-вставки.
        // Тип 'skip' — она не считается ни оригиналом, ни переводом, но и
        // не разрывает соседство, в отличие от 'mixed'.
        if (total < TRANSLATION_MIN_LINE_LETTERS) {
            result.lineTypes[i] = 'skip';
            return;
        }

        nonEmpty.push(i);

        if (cyrillic > latin) {
            const ratio = cyrillic / total;
            result.lineTypes[i] = ratio >= TRANSLATION_DOMINANCE ? 'translate' : 'mixed';
        } else if (latin > cyrillic) {
            const ratio = latin / total;
            result.lineTypes[i] = ratio >= TRANSLATION_DOMINANCE ? 'original' : 'mixed';
        } else {
            result.lineTypes[i] = 'mixed';
        }
    });

    if (nonEmpty.length < 2) return result;

    // 2. Короткий текст из 2-3 непустых строк: переводом считается ровно
    //    одна пара из строк на разных алфавитах, в любом порядке, причём
    //    каждая строка должна быть ЧИСТОЙ (см. комментарий выше).
    if (nonEmpty.length <= 3) {
        const first  = nonEmpty[0];
        const second = nonEmpty[1];
        const firstType  = result.lineTypes[first];
        const secondType = result.lineTypes[second];

        if (firstType === secondType) return result;

        const isCleanPair = [
            { index: first,  type: firstType },
            { index: second, type: secondType }
        ].every(({ index, type }) => {
            const { cyrillic, latin } = countLetters(lines[index]);
            return type === 'original' ? cyrillic === 0 : latin === 0;
        });

        if (isCleanPair) {
            result.confidence = 1.0;
            result.isTranslation = true;
        }
        return result;
    }

    // 3. Анализ последовательности для длинных текстов (>= 4 строк)
    let originalFollowedByTranslate = 0;
    let originalCount = 0;

    for (let j = 0; j < nonEmpty.length - 1; j++) {
        const curIdx = nonEmpty[j];
        if (result.lineTypes[curIdx] === 'original') {
            originalCount++;
            const nextIdx = nonEmpty[j + 1];
            if (result.lineTypes[nextIdx] === 'translate') {
                originalFollowedByTranslate++;
            }
        }
    }

    let pairCount = 0;
    for (let j = 0; j < nonEmpty.length - 1; j++) {
        const cur  = result.lineTypes[nonEmpty[j]];
        const next = result.lineTypes[nonEmpty[j + 1]];
        if (cur === 'original' && next === 'translate') {
            pairCount++;
            j++;
        }
    }

    const followRatio      = originalCount > 0 ? originalFollowedByTranslate / originalCount : 0;
    const alternatingRatio = nonEmpty.length > 0 ? (pairCount * 2) / nonEmpty.length : 0;

    // Абсолютные требования к структуре. Одиночная латинская строка
    // (цитата, римская цифра) даёт пару, но почти не покрывает текст.
    if (pairCount < TRANSLATION_MIN_PAIRS || alternatingRatio < TRANSLATION_MIN_COVERAGE) {
        return result;
    }

    // 4. Уверенность: равные веса, т.к. структура уже проверена гейтами
    result.confidence = followRatio * 0.5 + alternatingRatio * 0.5;
    result.isTranslation = result.confidence >= TRANSLATION_THRESHOLD;

    return result;
}