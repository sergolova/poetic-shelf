class PoemStore {
    constructor(storageKey = 'stih_app_data') {
        this.storageKey = storageKey;
        this.data = { authors: [] };
        this.selectedAuthorId = null;
        this.selectedPostId = null;
        this.authorSortMode = 'none'; // none, az, recent
        this.lastViewed = {}; // { authorId: timestamp }
    }

    async init() {
        const local = localStorage.getItem(this.storageKey);
        if (local) {
            try {
                const parsed = JSON.parse(local);
                this.data = parsed.data || parsed;
                this.lastViewed = parsed.lastViewed || {};
                this.authorSortMode = parsed.authorSortMode || 'none';
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
        localStorage.setItem(this.storageKey, JSON.stringify({
            data: this.data,
            lastViewed: this.lastViewed,
            authorSortMode: this.authorSortMode
        }));
    }

    getAuthors(searchQuery = '') {
        let authors = searchQuery && searchQuery.trim()
            ? this.data.authors.filter(author => {
                const q = searchQuery.toLowerCase().trim();
                const fullName = `${author.lastName} ${author.firstName} ${author.surName || ''}`.toLowerCase();
                if (fullName.includes(q)) return true;
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
            })
            : [...this.data.authors];

        // Сортировка
        switch (this.authorSortMode) {
            case 'az':
                authors.sort((a, b) => {
                    const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
                    const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
                    return nameA.localeCompare(nameB, 'ru');
                });
                break;
            case 'recent':
                authors.sort((a, b) => {
                    const timeA = this.lastViewed[a.id] || 0;
                    const timeB = this.lastViewed[b.id] || 0;
                    return timeB - timeA;
                });
                break;
        }

        return authors;
    }

    markAsViewed(authorId) {
        this.lastViewed[authorId] = Date.now();
        this.save();
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
        // Нормализуем все текстовые данные перед экспортом
        const normalizedData = JSON.parse(JSON.stringify(this.data));
        
        const normalizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = normalizeUnicode(obj[key]);
                } else if (typeof obj[key] === 'object') {
                    normalizeObject(obj[key]);
                }
            }
        };
        
        normalizeObject(normalizedData);
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(normalizedData, null, 2));
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
