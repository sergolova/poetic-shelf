class PoemUI {
    constructor() {
        this.$authorsList = $('#authorsList');
        this.$authorsCount = $('#authorsCount');
        this.$mainContent = $('#mainContent');

        this.authorModal = new bootstrap.Modal(document.getElementById('authorModal'));
        this.postModal = new bootstrap.Modal(document.getElementById('postModal'));

        // Автофокус на textarea при открытии модалки произведения
        document.getElementById('postModal').addEventListener('shown.bs.modal', () => {
            const isHtml = $('#useHtmlToggle').prop('checked');
            const target = isHtml ? '#postContentHtml' : '#postContent';
            $(target).focus();
        });
    }

    renderAuthorsList(authors, selectedId, selectedPostId = null) {
        this.$authorsList.empty();
        this.$authorsCount.text(authors.length);

        // Подсчёт общего количества стихов
        const totalPosts = authors.reduce((sum, author) => sum + (author.posts ? author.posts.length : 0), 0);
        $('#postsCount').text(totalPosts);

        if (authors.length === 0) {
            this.$authorsList.html('<div class="p-3 text-muted small">Авторы не найдены</div>');
            return;
        }

        authors.forEach(author => {
            const isActive = author.id === selectedId;
            const avatar = author.photo || this.getInitialsAvatar(`${author.firstName} ${author.lastName}`);
            const postsCount = author.posts ? author.posts.length : 0;

            // Список произведений для выбранного автора
            let postsListHtml = '';
            if (isActive && author.posts && author.posts.length > 0) {
                const isShowAll = !selectedPostId;
                const itemsHtml = author.posts.map(p => {
                    const isPostActive = p.id === selectedPostId;
                    return `<a href="#" class="author-post-item d-flex align-items-center justify-content-between py-2 px-3 ${isPostActive ? 'active' : ''}" data-post-id="${p.id}">
                        <span class="author-post-title text-truncate">${this.escape(p.title)}</span>
                        ${p.year ? `<span class="author-post-year text-muted flex-shrink-0 ms-2">${p.year}</span>` : ''}
                    </a>`;
                }).join('');

                postsListHtml = `
                <div class="author-posts-list" style="display: none;">
                    ${itemsHtml}
                </div>`;
            }

            const html = `
        <div class="author-card-wrapper">
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
          ${postsListHtml}
        </div>
      `;
            this.$authorsList.append(html);
        });
    }

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

        // Если есть поисковый запрос — фильтруем стихи
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

        // Фильтрация постов по выбранному
        let displayPosts = posts;
        if (selectedPostId) {
            displayPosts = posts.filter(p => p.id === selectedPostId);
        }

        const postsHtml = displayPosts.length > 0
            ? displayPosts.map(p => this.createPoemCardHtml(p, q)).join('')
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
          ${post.note ? `<div class="poem-note-box p-3 rounded-3 mb-3"><span class="note-icon">💡</span> <pre class="poem-note-content">${this.escape(post.note)}</pre></div>` : ''}
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

    addLinkRow(title = '', url = '', focusUrl = false) {
        const rowHtml = `
      <div class="link-row d-flex gap-2 align-items-center">
        <input type="text" class="form-control form-control-sm link-title-input" placeholder="Название (напр. Википедия)" value="${this.escape(title)}">
        <input type="url" class="form-control form-control-sm link-url-input" placeholder="https://..." value="${this.escape(url)}">
        <button type="button" class="btn btn-outline-danger btn-sm remove-link-btn py-0 px-2">✕</button>
      </div>
    `;
        $('#linksListContainer').append(rowHtml);
        
        // Фокус на URL поле при добавлении новой ссылки
        if (focusUrl) {
            $('#linksListContainer .link-row:last .link-url-input').focus();
        }
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
