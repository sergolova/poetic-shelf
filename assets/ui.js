/**
 * ==========================================================================
 * assets/ui.js
 * Класс управления интерфейсом (PoemUI). Отвечает за отрисовку списков,
 * профилей авторов, карточек произведений, модальных окон и автокомплитов.
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

        // Автофокус на textarea при открытии модального окна произведения
        document.getElementById('postModal').addEventListener('shown.bs.modal', () => {
            const isHtml = $('#useHtmlToggle').prop('checked');
            const target = isHtml ? '#postContentHtml' : '#postContent';
            $(target).focus();
        });
    }


    /* ==========================================================================
       2. Поиск и Подсветка совпадений / Search Highlighting & RegExp
       ========================================================================== */

    /**
     * Подсвечивает совпадения поискового запроса в HTML тексте.
     */
    highlightText(htmlContent, query) {
        const fuzzyReg = this.buildFuzzySearchRegExp(query);
        if (!fuzzyReg) return htmlContent;

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
        const container = doc.body.firstChild;

        const walk = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const nodesToReplace = [];

        let node;
        while ((node = walk.nextNode())) {
            if (fuzzyReg.test(node.nodeValue)) {
                nodesToReplace.push(node);
            }
        }

        nodesToReplace.forEach(textNode => {
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
     * Создает регулярное выражение для нечёткого поиска (с поддержкой е/ё, и/й).
     */
    buildFuzzySearchRegExp(query) {
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
                pattern += `${this.escapeRegExp(char)}[\\u0300-\\u036f]*`;
            } else {
                pattern += this.escapeRegExp(char);
            }
        }

        return new RegExp(`(${pattern})`, 'gi');
    }

    /**
     * Экранирует спецсимволы регулярного выражения.
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }


    /* ==========================================================================
       3. Рендеринг списков (Сайдбар) / Sidebar Authors List
       ========================================================================== */

    /**
     * Сортирует стихотворения по годам (по умолчанию).
     */
    sortPostsDefault(posts) {
        posts.sort((a, b) => {
            const aY = a.year ? a.year : 0;
            const bY = b.year ? b.year : 0;

            if (aY === bY) {
                return a.title.toLowerCase().localeCompare(b.title.toLowerCase(), 'ru');
            }
            return aY - bY;
        });
    }

    /**
     * Отрисовывает список авторов в левом сайдбаре.
     */
    renderAuthorsList(authors, selectedId, selectedPostId = null, searchQuery = '') {
        this.$authorsList.empty();
        this.$authorsCount.text(authors.length);
        const $authorsSidebar = $('.authors-sidebar, .search-input-wrapper');

        // Подсчёт общего количества стихотворений
        const totalPosts = authors.reduce((sum, author) => sum + (author.posts ? author.posts.length : 0), 0);
        $('#postsCount').text(totalPosts);

        const q = searchQuery.toLowerCase().trim();

        if (q) {
            $authorsSidebar.addClass('query-selection');
        } else {
            $authorsSidebar.removeClass('query-selection');
        }

        if (authors.length === 0) {
            this.$authorsList.html('<div class="p-3 text-muted small">Авторы не найдены&nbsp;&nbsp;&nbsp;<a class="view-all" href="#">Сбросить поиск</a></div>');
            return;
        }

        authors.forEach(author => {
            const isActive = author.id === selectedId;
            const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);

            // Фильтрация постов по запросу
            let authorPosts = author.posts || [];
            if (q && authorPosts.length > 0) {
                authorPosts = authorPosts.filter(post => isPostMatch(post, q));
            }

            this.sortPostsDefault(authorPosts);

            const isMatchedAuthor = q && isAuthorMatch(author, q);
            const matchedAuthorClass = isMatchedAuthor ? 'bg-warning text-dark' : '';
            const postsCount = isMatchedAuthor && authorPosts.length === 0 ? author.posts.length : authorPosts.length;

            // Рендер вложенных стихотворений
            let postsListHtml = '';
            const showPostsList = q ? authorPosts.length > 0 : (isActive && authorPosts.length > 0);
            if (showPostsList) {
                const itemsHtml = authorPosts.map(p => {
                    const isPostActive = p.id === selectedPostId;
                    const bookmarkIcon = this.renderBookmarkIcon(p.id, app.store.getPostBookmark(p.id));

                    return `<span class="author-post-item d-flex align-items-center justify-content-between py-2 px-3 ${isPostActive ? 'active' : ''}" data-post-id="${p.id}">
                        <span class="author-post-title text-truncate">${escapeHtml(p.title)} ${bookmarkIcon}</span>
                        ${p.year ? `<span class="author-post-year text-muted flex-shrink-0 ms-2">${p.year}</span>` : ''}
                    </span>`;
                }).join('');

                postsListHtml = `
                <div class="author-posts-list" style="display: none;">
                    ${itemsHtml}
                </div>`;
            }

            const hideYears = !author.birthYear && !author.deathYear;

            const html = `
        <div class="author-card-wrapper">
          <span href="#" class="list-group-item list-group-item-action author-card ${isActive ? 'active' : ''} d-flex align-items-center gap-3 py-3 border-bottom" data-id="${author.id}">
            <div class="author-avatar-wrapper">
              <img src="${avatar}" class="author-avatar-img avatar-style" alt="${author.lastName}">
            </div>
            <div class="author-info flex-grow-1 overflow-hidden">
              <h6 class="author-name mb-0 text-truncate ${matchedAuthorClass}">${escapeHtml(author.lastName)} ${escapeHtml(author.firstName)}</h6>
              <span class="author-years text-muted" ${hideYears ? 'style="display: none"' : ''}>${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'}</span>
            </div>
            <span class="posts-count-badge">${postsCount}</span>
          </span>
          ${postsListHtml}
        </div>
      `;
            this.$authorsList.append(html);
        });
    }


    /* ==========================================================================
       4. Главная область: Профиль и Карточки / Author Profile & Poem Cards
       ========================================================================== */

    /**
     * Отрисовывает детальную информацию об авторе (Hero) и его стихи.
     */
    renderAuthorMain(author, searchQuery = '', selectedPostId = null) {
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

        // Фильтрация
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            posts = posts.filter(post => isPostMatch(post, q));
        }

        let displayPosts;
        if (q === '' && selectedPostId === null) {
            displayPosts = posts;
        } else {
            displayPosts = posts.filter(p => p.id === selectedPostId);
        }
        this.sortPostsDefault(displayPosts);

        const postsHtml = displayPosts.length > 0
            ? displayPosts.map(p => this.createPoemCardHtml(p, author, q)).join('')
            : `<div class="alert alert-light text-center border py-4 text-muted">
          ${searchQuery ? 'В произведениях этого автора совпадений не найдено. <a class="view-all" href="#">Смотреть все</a>' : 'У этого автора пока нет сохранённых стихов'}
         </div>`;

        const hideYears = !author.birthYear && !author.deathYear;
        const currentYear = new Date().getFullYear();
        let numYears = (author.birthYear) ? ((author.deathYear ?? currentYear) - author.birthYear) : null;
        const ageString = numYears !== null ? ` (${numYears} ${this.getAgeString(numYears)})` : '';

        const isMatchedAuthor = q && isAuthorMatch(author, q);
        const matchedAuthorClass = isMatchedAuthor ? 'bg-warning text-dark' : '';
        const authorName = `${author.lastName || ''} ${author.firstName || ''} ${author.surName || ''}`.trim();
        const initialWiki = this.getWikiLink(authorName);

        const html = `
      <div class="author-profile-hero border-0">
        <div class="card-body pb-4 pt-4 d-flex align-items-center justify-content-between flex-wrap gap-4">
          <div class="d-flex align-items-center gap-4">
            <img src="${avatar}" class="hero-avatar-img avatar-style" alt="${author.lastName}">
            <div>
              <div class="hero-author-wrapper">
                <h2 class="hero-author-name mb-1 ${matchedAuthorClass}"><a class="author-wiki-link" href="${initialWiki}">${escapeHtml(authorName)}</a></h2>
                <div>
                  <button class="btn btn-link text-muted p-0 ms-2 edit-post-btn svg-button" id="editAuthorBtn" title="Редактировать">✏️</button>
                  <button class="btn btn-link text-muted p-0 ms-2 edit-post-btn svg-button" id="addPostBtn" title="Добавить стих">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <circle cx="12" cy="12" r="10"></circle> <line x1="12" y1="8" x2="12" y2="16"></line> <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="hero-author-meta d-flex align-items-center gap-2 text-muted">
                <span ${hideYears ? 'style="display: none"' : ''}>📅 ${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'} гг.${ageString}</span>
                <span>•</span>📖
                <a class="view-all" href="#">${author.posts ? author.posts.length : 0} произведений</a> <span>${q ? `(найдено: ${posts.length})` : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="posts-feed">${postsHtml}</div>
    `;

        this.$mainContent.html(html);
    }

    /**
     * Создает HTML разметку карточки отдельного произведения.
     */
    createPoemCardHtml(post, author, query = '') {
        const formatPoemLines = (text) => {
            if (!text) return '';
            const lines = text.split('\n');

            return lines.map((line, index) => {
                if (!line.trim()) return '';
                const processedLine = query ? this.highlightText(line, query) : line;
                return `<span class="poem-line" data-line-index="${index}">${processedLine}</span>`;
            }).join('\n');
        };

        const rawContent = post.contentHtml ? post.contentHtml : escapeHtml(post.content);
        const formattedLines = formatPoemLines(rawContent);
        const bodyContent = `<pre class="poem-content">${formattedLines}</pre>`;

        const titleHtml = query ? this.highlightText(escapeHtml(post.title), query) : escapeHtml(post.title);
        const noteHtml = (post.note && query) ? this.highlightText(escapeHtml(post.note), query) : escapeHtml(post.note);

        const getLinkIcon = (url) => {
            const isYoutube = /(youtube\.com|youtu\.be)/i.test(url);
            return isYoutube ? '▶️' : '🔗';
        };

        const postMatch = query && isPostMatch(post, query);

        // Форматирование ссылок
        const linksHtml = (post.links && post.links.length > 0)
            ? `<div class="poem-links d-flex align-items-center gap-2 flex-wrap pt-2 border-top mt-3">
         <small class="text-muted fw-bold">Ссылки:</small>
         ${post.links.map(l => {
                const icon = getLinkIcon(l.url);
                const ytId = this.getYouTubeId(l.url);
                const tooltipHtml = ytId
                    ? `<span class="link-yt-tooltip">
                      <img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="thumbnail">
                    </span>`
                    : '';

                return `
               <span class="link-tooltip-container position-relative d-inline-block">
                 <a href="${l.url}" target="_blank" rel="noopener noreferrer" class="poem-link-badge">${icon} ${escapeHtml(l.title || l.url)} ↗</a>
                 ${tooltipHtml}
               </span>
             `;
            }).join('')}
       </div>`
            : '';

        const writtenYears = (author?.birthYear && post.year) ? post.year - author.birthYear : '';
        const bookmarkBtn = this.renderBookmarkButton(post.id, app.store.getPostBookmark(post.id));
        const yearsString = this.getAgeString(writtenYears);

        return `
      <article class="${postMatch ? 'query-selection' : ''} poem-card card border-0 shadow-sm mb-4" data-author-id="${author.id}" data-post-id="${post.id}">
        <div class="card-body p-4">
          <div class="d-flex align-items-center justify-content-between pb-2 border-bottom">
            <div class="post-header-wrapper">
              <h3 class="poem-title mb-0">${titleHtml}</h3>
              <div class="post-bookmark-wrapper">${bookmarkBtn}</div>
            </div>
            <div class="d-flex align-items-center gap-2">
              ${post.year ? `<span class="poem-year-tag">${post.year} г. ${writtenYears ? `(в ${writtenYears} ${yearsString})` : ''}</span>` : ''}
              <button class="btn btn-link text-muted p-0 ms-2 edit-post-btn svg-button" data-post-id="${post.id}" title="Редактировать">✏️</button>
            </div>
          </div>
          <div class="poem-text-container mt-4">${bodyContent}</div>
          ${post.note ? `<div class="poem-note-box mt-4"><span class="note-icon">💡</span> <pre class="poem-note-content">${noteHtml}</pre></div>` : ''}
          ${linksHtml}
        </div>
      </article>
    `;
    }

    /**
     * Создает HTML-кнопку закладки.
     */
    renderBookmarkButton(postId, state) {
        const isBookmarked = Boolean(state);
        const activeClass = isBookmarked ? 'active' : '';
        const title = isBookmarked ? 'Убрать закладку' : 'Поставить закладку';

        return `
      <button class="btn btn-link text-muted p-0 ms-2 bookmark-btn svg-button ${activeClass}" title="${title}" data-post-id="${postId}">
        <svg class="bookmark-icon bookmark-empty ${isBookmarked ? 'd-none' : ''}" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <svg class="bookmark-icon bookmark-filled ${!isBookmarked ? 'd-none' : ''}" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>`;
    }

    /**
     * Создает HTML-иконку закладки для списка.
     */
    renderBookmarkIcon(postId, state) {
        if (!state) return '';
        return `
      <svg class="bookmark-icon bookmark-filled" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>`;
    }


    /* ==========================================================================
       5. Модальные окна и Формы / Modals & Forms Controllers
       ========================================================================== */

    /**
     * Открывает модалку создания/редактирования автора.
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

    /**
     * Закрывает модалку автора.
     */
    closeAuthorModal() {
        this.authorModal.hide();
    }

    /**
     * Открывает модалку создания/редактирования стихотворения.
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

            if (currentAuthorId) {
                const currentAuthor = authors.find(a => a.id === currentAuthorId);
                if (currentAuthor) {
                    $('#postAuthorId').val(currentAuthor.id);
                    $('#postAuthorSearch').val(`${currentAuthor.lastName} ${currentAuthor.firstName}`);
                }
            }
        }

        this.postModal.show();
    }

    /**
     * Закрывает модалку стихотворения.
     */
    closePostModal() {
        this.postModal.hide();
    }

    /**
     * Отрисовывает выпадающий список авторов (автокомплит) в модалке стиха.
     */
    renderAuthorSearchDropdown(authors, query) {
        const $dropdown = $('#authorSearchDropdown');
        $dropdown.empty();

        if (!query || query.trim().length === 0) {
            $dropdown.addClass('d-none');
            return;
        }

        const filtered = authors.filter(author => isAuthorMatch(author, query.toLowerCase().trim()));

        if (filtered.length === 0) {
            $dropdown.html('<div class="p-2 text-muted small text-center">Ничего не найдено</div>');
        } else {
            filtered.forEach(author => {
                const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);
                const html = `
                    <div class="author-search-item" data-author-id="${author.id}">
                        <img src="${avatar}" alt="">
                        <div class="author-search-item-info">
                            <div class="author-search-item-name">${escapeHtml(author.lastName)} ${escapeHtml(author.firstName)}</div>
                            <div class="author-search-item-years">${author.birthYear || '?'} — ${author.deathYear || 'наст. вр.'}</div>
                        </div>
                    </div>
                `;
                $dropdown.append(html);
            });
        }

        $dropdown.removeClass('d-none');
    }

    /**
     * Добавляет строку ввода внешней ссылки в модалке стиха.
     */
    addLinkRow(title = '', url = '', focusUrl = false) {
        const rowHtml = `
      <div class="link-row d-flex gap-2 align-items-center">
        <input type="text" class="form-control form-control-sm link-title-input" placeholder="Название (опционально)" value="${escapeHtml(title)}">
        <input type="url" class="form-control form-control-sm link-url-input" placeholder="https://..." value="${escapeHtml(url)}">
        <button type="button" class="btn btn-outline-danger btn-sm remove-link-btn">✕</button>
      </div>
    `;
        $('#linksListContainer').append(rowHtml);

        if (focusUrl) {
            $('#linksListContainer .link-row:last .link-url-input').focus();
        }
    }


    /* ==========================================================================
       6. Выпадающие меню закладок / Dropdowns & Bookmarks Renderers
       ========================================================================== */

    /**
     * Отрисовывает универсальное выпадающее меню списка стихов.
     */
    renderPostsDropdown(posts, title = '', customClass = '') {
        if (!posts || !posts.length) return '';

        const menuItemsHtml = posts.map(post => {
            const author = app.store.getAuthorById(post.authorId);

            return `
            <li>
              <div class="dropdown-item timeline-post-link" data-post-id="${post.id}">
                <div class="author-time-item-left">
                  <span class="author-time-item">${author ? escapeHtml(author.lastName) + ':' : ''}</span>
                  <span class="text-truncate">${escapeHtml(post.title)}</span>
                </div>
              </div>
            </li>
        `;
        }).join('');

        const headerHtml = title ? `<div class="timeline-dropdown-header">${escapeHtml(String(title))}</div>` : '';

        return `
        <div class="timeline-dropdown-menu shadow-sm ${customClass}">
            ${headerHtml}
            <ul class="list-unstyled mb-0">
                ${menuItemsHtml}
            </ul>
        </div>
    `;
    }

    /**
     * Отрисовывает выпадающее меню закладок в шапке.
     */
    renderBookmarksDropdown() {
        const bookmarkedIds = Object.keys(app.store.postBookmarks || {});

        if (bookmarkedIds.length === 0) {
            return `
            <div class="timeline-dropdown-menu shadow-sm show">
                <div class="timeline-dropdown-header">Закладки</div>
                <div class="p-3 text-muted text-center style-sm">Нет закладок</div>
            </div>
        `;
        }

        const bookmarkedPosts = [];
        app.store.data.authors.forEach(author => {
            if (author.posts) {
                author.posts.forEach(post => {
                    if (app.store.postBookmarks[post.id]) {
                        bookmarkedPosts.push({ ...post, authorId: author.id });
                    }
                });
            }
        });

        // Сортировка: новые закладки сверху
        bookmarkedPosts.sort((a, b) => {
            const timeA = app.store.postBookmarks[a.id] || 0;
            const timeB = app.store.postBookmarks[b.id] || 0;
            return timeB - timeA;
        });

        return this.renderPostsDropdown(bookmarkedPosts, 'Закладки', 'show');
    }

    /**
     * Переключает видимость выпадающего меню закладок.
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
       7. Хелперы и Форматирование / Helpers & Formatter
       ========================================================================== */

    /**
     * Создает SVG-заглушку аватара с инициалами автора.
     */
    getInitialsAvatar(name) {
        const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
        return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23d8c8b8'/><text x='50%' y='55%' font-size='35' text-anchor='middle' dominant-baseline='middle' fill='%235c4a3e'>${initials || '?'}</text></svg>`;
    }

    /**
     * Возвращает ссылку на поиск автора в Википедии.
     */
    getWikiLink(authorName) {
        return authorName ? `https://ru.wikipedia.org/w/index.php?search=${encodeURIComponent(authorName.trim())}` : '#';
    }

    /**
     * Возвращает правильную форму слова "год/года/лет" в зависимости от числа.
     */
    getAgeString(age) {
        if (age === null || age === undefined || isNaN(age)) return '';

        const absAge = Math.abs(Number(age));
        const lastTwo = absAge % 100;
        const lastOne = absAge % 10;
        let word;

        if (lastTwo >= 11 && lastTwo <= 14) {
            word = 'лет';
        } else if (lastOne === 1) {
            word = 'год';
        } else if (lastOne >= 2 && lastOne <= 4) {
            word = 'года';
        } else {
            word = 'лет';
        }

        return `${word}`;
    }

    /**
     * Извлекает 11-значный ID видео YouTube из ссылки.
     */
    getYouTubeId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }
}
