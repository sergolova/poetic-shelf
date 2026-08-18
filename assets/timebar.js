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
    render(allPosts, activeAuthorId, authors) {
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

        // Точки + выпадающие меню
        const dotsHtml = years.map(year => {
            const {posts, authorIds} = postsByYear[year];
            const leftPercent = ((year - startYear) / totalRange) * 100;
            const isActive = activeAuthorId && authorIds.has(activeAuthorId);
            const menuItemsHtml = posts.map(post => {

                const author = this.store.getAuthorById(post.authorId);
                return `
        <li>
          <span class="dropdown-item timeline-post-link text-truncate" data-post-id="${post.id}">
            <span class="author-time-item">${author.lastName}: </span>
            <span>${this.escapeHtml(post.title)}</span>
          </span>
        </li>
      `
            }).join('');

            return `
        <div class="timeline-dot-wrapper${isActive ? ' active' : ''}" style="left: ${leftPercent}%;">
          <div class="timeline-dot">
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

        // Подписи годов — отдельно от wrapper'ов, чтобы layoutLabels
        // мог позиционировать их в координатах контейнера
        const labelsHtml = years.map(year => {
            const leftPercent = ((year - startYear) / totalRange) * 100;
            return `<div class="timeline-year-label" style="left: ${leftPercent}%;">${year}</div>`;
        }).join('');

        this.container.innerHTML = `
      <div class="timeline-bar-wrapper w-100">
        <div class="container-fluid position-relative px-4">
          <div class="timeline-line"></div>
          <div class="timeline-dots-container">
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