/**
 * ==========================================================================
 * assets/timebar.js
 * Компонент временной шкалы (TimelineBar).
 * Отрисовывает точки лет, плашку жизни автора, выпадающие меню произведений.
 * ==========================================================================
 */

class TimelineBar {

    /* ==========================================================================
       1. Конструктор / Constructor
       ========================================================================== */

    /**
     * @param {string} containerId - ID контейнера в DOM.
     * @param {PoemStore} store - Ссылка на хранилище данных.
     * @param {{ onPostClick?: function }} options
     */
    constructor(containerId, store, options = {}) {
        this.container   = document.getElementById(containerId);
        this.store       = store;
        this.onPostClick = options.onPostClick || null;
    }


    /* ==========================================================================
       2. Отрисовка шкалы / Rendering
       ========================================================================== */

    /**
     * Рендерит временную шкалу.
     * @param {Array} allPosts - Все произведения (с полем authorId).
     * @param {string|null} activeAuthorId - Выбранный автор.
     * @param {Array} authors - Список всех авторов.
     * @param {string|null} activePostId - Выбранное произведение.
     */
    render(allPosts, activeAuthorId, authors, activePostId = null) {
        if (!this.container) return;

        const validPosts = (allPosts || []).filter(p => p.year && !isNaN(p.year));
        if (validPosts.length === 0) { this.container.innerHTML = ''; return; }

        // Группируем произведения по годам
        const postsByYear = validPosts.reduce((acc, post) => {
            if (!acc[post.year]) acc[post.year] = { posts: [], authorIds: new Set() };
            acc[post.year].posts.push(post);
            if (post.authorId) acc[post.year].authorIds.add(post.authorId);
            return acc;
        }, {});

        const years   = Object.keys(postsByYear).map(Number).sort((a, b) => a - b);
        const minYear = Math.max(years[0], 1795);
        const maxYear = years[years.length - 1];
        const startYear  = minYear === maxYear ? minYear - 1 : minYear;
        const endYear    = minYear === maxYear ? maxYear + 1 : maxYear;
        const totalRange = endYear - startYear;

        // --- Плашка жизни автора ---
        let lifeRangeHtml = '';
        if (activeAuthorId) {
            const a = this.store.getAuthorById(activeAuthorId);
            if (a?.birthYear) {
                const birth  = Number(a.birthYear);
                const death  = a.deathYear ? Number(a.deathYear) : new Date().getFullYear();
                const cs     = Math.max(birth, startYear);
                const ce     = Math.min(death, endYear);
                if (cs <= endYear && ce >= startYear) {
                    const leftPct  = Math.max(0,   ((cs - startYear) / totalRange) * 100);
                    const rightPct = Math.min(100,  ((ce - startYear) / totalRange) * 100);
                    lifeRangeHtml  = `<div class="timeline-life-range" style="left:${leftPct}%;width:${rightPct - leftPct}%;" title="${a.lastName}: ${birth} — ${a.deathYear || 'н.в.'}"></div>`;
                }
            }
        }

        let currentPostYear = null;

        // --- Точки лет ---
        const dotsHtml = years.map(year => {
            const { posts, authorIds } = postsByYear[year];
            const leftPct  = ((year - startYear) / totalRange) * 100;
            const isActive = activeAuthorId && authorIds.has(activeAuthorId);

            sortPosts(posts);

            const menuItemsHtml = posts.map(post => {
                if (activePostId && String(post.id) === String(activePostId)) currentPostYear = year;
                const author       = this.store.getAuthorById(post.authorId);
                const isBookmarked = this.store.getPostBookmark(post.id);

                const bookmarkHtml = isBookmarked ? `
                    <div class="author-time-item-bookmark">
                      <svg class="bookmark-icon bookmark-filled" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e5a051" stroke="#e5a051" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </div>` : '';

                return `<li>
                  <div class="dropdown-item timeline-post-link" data-post-id="${post.id}">
                    <div class="author-time-item-left">
                      <span class="author-time-item">${author ? escapeHtml(author.lastName) + ':' : ''}</span>
                      <span class="text-truncate">${escapeHtml(post.title)}</span>
                    </div>
                    ${bookmarkHtml}
                  </div>
                </li>`;
            }).join('');

            return `<div class="timeline-dot-wrapper${isActive ? ' active' : ''}" style="left:${leftPct}%;">
              <div class="timeline-dot ${year === currentPostYear ? 'is-current-post' : ''}">
                ${posts.length > 1 ? `<span class="timeline-dot-count">${posts.length}</span>` : ''}
              </div>
              <div class="timeline-dropdown-menu shadow-sm">
                <div class="timeline-dropdown-header">${year}</div>
                <ul class="list-unstyled mb-0">${menuItemsHtml}</ul>
              </div>
            </div>`;
        }).join('');

        const labelsHtml = years.map(year =>
            `<div class="timeline-year-label" style="left:${((year - startYear) / totalRange) * 100}%;">${year}</div>`
        ).join('');

        this.container.innerHTML = `
          <div class="timeline-bar-wrapper w-100">
            <div class="container-fluid position-relative px-4">
              <div class="timeline-line"></div>
              <div class="timeline-dots-container">
                ${lifeRangeHtml}${dotsHtml}${labelsHtml}
              </div>
            </div>
          </div>`;

        this.bindEvents();
        this.layoutLabels();
    }


    /* ==========================================================================
       3. Размещение подписей лет / Year Label Layout
       ========================================================================== */

    /**
     * Скрывает перекрывающиеся подписи лет под шкалой.
     */
    layoutLabels() {
        const labels    = this.container.querySelectorAll('.timeline-year-label');
        const container = this.container.querySelector('.timeline-dots-container');
        if (!container || labels.length < 2) return;

        const containerWidth = container.offsetWidth;
        let previousRight    = 0;

        labels.forEach((label, i) => {
            const leftPct = parseFloat(label.style.left);
            if (isNaN(leftPct)) return;

            const dotX     = (leftPct / 100) * containerWidth;
            label.style.transform  = 'none';
            label.style.whiteSpace = 'nowrap';
            label.style.top        = '22px';
            label.style.display    = '';

            const labelW     = label.offsetWidth;
            const labelLeft  = dotX - labelW / 2;
            const labelRight = labelLeft + labelW;

            if (i === 0 || labelLeft >= previousRight + 2) {
                label.style.left = labelLeft + 'px';
                previousRight    = labelRight;
            } else {
                label.style.display = 'none';
            }
        });
    }


    /* ==========================================================================
       4. Обработка событий / Event Bindings
       ========================================================================== */

    /**
     * Привязывает клики и ховеры к точкам временной шкалы.
     */
    bindEvents() {
        const container = this.container;

        // Клик по конкретному произведению в выпадающем меню
        container.querySelectorAll('.timeline-post-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const postId = link.getAttribute('data-post-id');
                if (this.onPostClick) this.onPostClick(postId);
            });
        });

        // Если в году один пост — клик по точке сразу переходит к нему
        container.querySelectorAll('.timeline-dot-wrapper').forEach(wrapper => {
            const links = wrapper.querySelectorAll('.timeline-post-link');
            if (links.length !== 1) return;
            wrapper.addEventListener('click', (e) => {
                if (e.target.closest('.timeline-dropdown-menu')) return;
                const postId = links[0].getAttribute('data-post-id');
                if (this.onPostClick) this.onPostClick(postId);
            });
        });

        // Ховер с задержкой показывает/скрывает выпадающее меню
        container.querySelectorAll('.timeline-dot-wrapper').forEach(wrapper => {
            const dropdown = wrapper.querySelector('.timeline-dropdown-menu');
            if (!dropdown) return;

            let showTimer = null;
            let hideTimer = null;

            const cancel  = () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
            const show    = () => { cancel(); showTimer = setTimeout(() => { dropdown.style.display = 'block'; }, 100); };
            const hide    = () => { cancel(); hideTimer = setTimeout(() => { dropdown.style.display = ''; }, 300); };

            wrapper.addEventListener('mouseenter',  show);
            wrapper.addEventListener('mouseleave',  hide);
            dropdown.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            dropdown.addEventListener('mouseleave', hide);
        });
    }
}