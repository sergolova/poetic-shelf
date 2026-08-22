class TimelineBar {
    constructor(containerId, store, options = {}) {
        this.container = document.getElementById(containerId);
        this.onPostClick = options.onPostClick || null;
        this.store = store;
    }

    /**
     * Рендерит тайм-бар под хедером
     * @param {Array} allPosts - Все стихотворения всех авторов (каждый с authorId)
     * @param {string|null} activeAuthorId - ID текущего выбранного автора
     */
    render(allPosts, activeAuthorId, authors, activePostId = null) {
        if (!this.container) return;

        // Отбираем только посты с валидным годом
        const validPosts = (allPosts || []).filter(p => p.year && !isNaN(p.year));

        if (validPosts.length === 0) {
            this.container.innerHTML = '';
            return;
        }

        // Группируем стихи по годам
        const postsByYear = validPosts.reduce((acc, post) => {
            if (!acc[post.year]) {
                acc[post.year] = {posts: [], authorIds: new Set()};
            }
            acc[post.year].posts.push(post);
            if (post.authorId) acc[post.year].authorIds.add(post.authorId);
            return acc;
        }, {});

        const years = Object.keys(postsByYear).map(Number).sort((a, b) => a - b);
        const minYear = Math.max(years[0], 1795);
        const maxYear = years[years.length - 1];

        // Если всего один год — делаем небольшой отступ в диапазоне для красивого отображения
        const startYear = minYear === maxYear ? minYear - 1 : minYear;
        const endYear = minYear === maxYear ? maxYear + 1 : maxYear;
        const totalRange = endYear - startYear;

        // --- РАСЧЁТ ПЛАШКИ ЖИЗНИ АВТОРА ---
        let lifeRangeHtml = '';
        if (activeAuthorId) {
            const activeAuthor = this.store ? this.store.getAuthorById(activeAuthorId) : null;

            if (activeAuthor && activeAuthor.birthYear) {
                const birth = Number(activeAuthor.birthYear);
                // Если автор ещё жив, подсвечиваем до текущего года или макс. года таймлайна
                const death = activeAuthor.deathYear ? Number(activeAuthor.deathYear) : new Date().getFullYear();

                // Ограничиваем рамками текущего таймлайна
                const clampedStart = Math.max(birth, startYear);
                const clampedEnd = Math.min(death, endYear);

                if (clampedStart <= endYear && clampedEnd >= startYear) {
                    const leftPercent = Math.max(0, ((clampedStart - startYear) / totalRange) * 100);
                    const rightPercent = Math.min(100, ((clampedEnd - startYear) / totalRange) * 100);
                    const widthPercent = rightPercent - leftPercent;

                    lifeRangeHtml = `
                      <div class="timeline-life-range" 
                           style="left: ${leftPercent}%; width: ${widthPercent}%;"
                           title="${activeAuthor.lastName}: ${birth} — ${activeAuthor.deathYear || 'н.в.'}">
                      </div>
                    `;
                }
            }
        }

        let currentPostYear = null;

        // Точки + выпадающие меню
        const dotsHtml = years.map(year => {
            const {posts, authorIds} = postsByYear[year];
            const leftPercent = ((year - startYear) / totalRange) * 100;
            const isActive = activeAuthorId && authorIds.has(activeAuthorId);
            const menuItemsHtml = posts.map(post => {
                if (activePostId && String(post.id) === String(activePostId)) {
                    currentPostYear = year;
                }
                const author = this.store.getAuthorById(post.authorId);
                const isBookmarked = this.store.getPostBookmark(post.id);

                const bookmarkHtml = isBookmarked ? `
    <div class="author-time-item-bookmark">
      <svg class="bookmark-icon bookmark-filled" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e5a051" stroke="#e5a051" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
` : '';

                return `
<li>
  <div class="dropdown-item timeline-post-link" data-post-id="${post.id}">
    <div class="author-time-item-left">
      <span class="author-time-item">${author ? this.escapeHtml(author.lastName) + ':' : ''}</span>
      <span class="text-truncate">${this.escapeHtml(post.title)}</span>
    </div>
    ${bookmarkHtml}
  </div>
</li>
`;
            }).join('');

            const isCurrentPostYear = year === currentPostYear;

            return `
        <div class="timeline-dot-wrapper${isActive ? ' active' : ''}" style="left: ${leftPercent}%;">
          <div class="timeline-dot ${isCurrentPostYear ? 'is-current-post' : ''}">
            ${posts.length > 1 ? `<span class="timeline-dot-count">${posts.length}</span>` : ''}
          </div>
          <div class="timeline-dropdown-menu shadow-sm">
            <div class="timeline-dropdown-header">${year}</div>
            <ul class="list-unstyled mb-0">
              ${menuItemsHtml}
            </ul>
          </div>
        </div>
      `;
        }).join('');

        // Подписи годов
        const labelsHtml = years.map(year => {
            const leftPercent = ((year - startYear) / totalRange) * 100;
            return `<div class="timeline-year-label" style="left: ${leftPercent}%;">${year}</div>`;
        }).join('');

        this.container.innerHTML = `
      <div class="timeline-bar-wrapper w-100">
        <div class="container-fluid position-relative px-4">
          <div class="timeline-line"></div>
          <div class="timeline-dots-container">
            ${lifeRangeHtml}
            ${dotsHtml}
            ${labelsHtml}
          </div>
        </div>
      </div>
    `;

        this.bindEvents();
        this.layoutLabels();
    }

    /**
     * Скрывает подписи годов, которые накладываются друг на друга.
     * Показываются только те, что не перекрываются с предыдущей видимой.
     */
    layoutLabels() {
        const labels = this.container.querySelectorAll('.timeline-year-label');
        const container = this.container.querySelector('.timeline-dots-container');
        if (!container || labels.length < 2) return;

        const containerWidth = container.offsetWidth;
        let previousRight = 0;

        labels.forEach((label, i) => {
            const leftPercent = parseFloat(label.style.left);
            if (isNaN(leftPercent)) return;
            const dotPixelX = (leftPercent / 100) * containerWidth;

            // Сбрасываем transform, чтобы измерить натуральную ширину текста
            label.style.transform = 'none';
            label.style.whiteSpace = 'nowrap';
            label.style.top = '22px';
            label.style.display = ''; // показываем для измерения

            const labelWidth = label.offsetWidth;
            const labelLeft = dotPixelX - labelWidth / 2;
            const labelRight = labelLeft + labelWidth;

            // Если первая подпись — показываем
            // Если следующая наезжает на предыдущую (с отступом 2px) — прячем
            if (i === 0) {
                label.style.left = labelLeft + 'px';
                previousRight = labelRight;
            } else if (labelLeft >= previousRight + 2) {
                label.style.left = labelLeft + 'px';
                previousRight = labelRight;
            } else {
                label.style.display = 'none';
            }
        });
    }

    bindEvents() {
        const container = this.container;

        // Клики по ссылкам стихов
        container.querySelectorAll('.timeline-post-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const postId = link.getAttribute('data-post-id');
                if (this.onPostClick) {
                    this.onPostClick(postId);
                }
            });
        });

        // Клик по кружку: если в году один стих — сразу переходим
        container.querySelectorAll('.timeline-dot-wrapper').forEach(wrapper => {
            const links = wrapper.querySelectorAll('.timeline-post-link');
            if (links.length !== 1) return;

            wrapper.addEventListener('click', (e) => {
                // Не реагируем, если клик пришёлся на выпадающее меню
                if (e.target.closest('.timeline-dropdown-menu')) return;
                const postId = links[0].getAttribute('data-post-id');
                if (this.onPostClick) {
                    this.onPostClick(postId);
                }
            });
        });

        // Ховер с задержкой для выпадающих меню
        container.querySelectorAll('.timeline-dot-wrapper').forEach(wrapper => {
            const dropdown = wrapper.querySelector('.timeline-dropdown-menu');
            if (!dropdown) return;

            let showTimer = null;
            let hideTimer = null;

            const cancelTimers = () => {
                clearTimeout(showTimer);
                clearTimeout(hideTimer);
            };

            const showDropdown = () => {
                cancelTimers();
                showTimer = setTimeout(() => {
                    dropdown.style.display = 'block';
                }, 100);
            };

            const hideDropdown = () => {
                cancelTimers();
                hideTimer = setTimeout(() => {
                    dropdown.style.display = '';
                }, 300);
            };

            wrapper.addEventListener('mouseenter', showDropdown);
            wrapper.addEventListener('mouseleave', hideDropdown);
            dropdown.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            dropdown.addEventListener('mouseleave', hideDropdown);
        });
    }

    escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[m]);
    }
}