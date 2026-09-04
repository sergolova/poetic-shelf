/**
 * ==========================================================================
 * assets/utilities.js
 * Только кросс-модульные утилиты без привязки к конкретному классу.
 * Содержит: низкоуровневую работу с изображениями, чистые строковые
 * функции, конвертацию раскладки клавиатуры.
 * ==========================================================================
 */

/* ==========================================================================
   1. Работа с изображениями / Image Utilities
   ========================================================================== */

/**
 * Сжимает изображение из File объекта через Canvas в формат JPEG (Base64).
 * @param {File} file - Файл изображения.
 * @param {number} maxWidth - Максимальная ширина.
 * @param {number} maxHeight - Максимальная высота.
 * @param {number} quality - Качество сжатия (0.0 – 1.0).
 * @returns {Promise<string>} Base64-строка изображения.
 */
function compressImage(file, maxWidth = 300, maxHeight = 300, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
                } else {
                    if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
                }

                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

/**
 * Загружает изображение по внешнему URL и конвертирует в сжатую строку Base64.
 * @param {string} url - Ссылка на изображение.
 * @param {number} maxWidth - Максимальная ширина.
 * @param {number} maxHeight - Максимальная высота.
 * @param {number} quality - Качество сжатия.
 * @returns {Promise<string>} Base64-строка изображения.
 */
function imageUrlToBase64(url, maxWidth = 300, maxHeight = 300, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            if (width > height) {
                if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
            } else {
                if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
            }

            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            try {
                resolve(canvas.toDataURL('image/jpeg', quality));
            } catch (err) {
                reject(new Error('CORS запрещает сжатие этой картинки на клиенте'));
            }
        };
        img.onerror = () => reject(new Error('Не удалось загрузить изображение по указанному URL'));
    });
}


/* ==========================================================================
   2. Безопасность и Экранирование / Security & HTML Escaping
   ========================================================================== */

/**
 * Экранирует спецсимволы HTML/XML для предотвращения XSS и корректного рендеринга.
 * Используется во всех модулях (ui.js, store.js, timebar.js).
 * @param {string} str - Входная строка.
 * @returns {string} Экранированная строка.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
}


/* ==========================================================================
   3. Строковые утилиты / String Utilities
   ========================================================================== */

/**
 * Нормализует Unicode в форму NFC — нужно перед сравнением строк
 * с составными символами (например, ударениями).
 * @param {string} text - Исходный текст.
 * @returns {string} Нормализованный текст.
 */
function normalizeUnicode(text) {
    if (!text) return '';
    return text.normalize('NFC');
}

/**
 * Очищает скопированный текст от мусорных URL-хвостов сайтов
 * («Источник: https://...», «Подробнее: http...» и т.п.).
 * @param {string} text - Исходный текст из буфера обмена.
 * @returns {string} Очищенный текст.
 */
function cleanPastedText(text) {
    if (!text) return '';
    return text
        .replace(/(?:Источник|Подробнее|Взято с|Read more)?\s*:?\s*https?:\/\/\S+/gi, '')
        .trim();
}

/**
 * Конвертирует строку, набранную в ошибочной английской раскладке, в русскую.
 * Срабатывает только если в строке есть английские буквы и нет русских.
 * Используется в PoemApp.refresh() для поля поиска.
 * @param {string} str - Исходная строка.
 * @returns {string} Сконвертированная строка.
 */
function convertEngToRus(str) {
    if (!str) return '';

    const map = {
        'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','[':'х',']':'ъ',
        'a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д',';':'ж',"'":'э',
        'z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',',':'б','.':'ю','`':'ё',
        'Q':'Й','W':'Ц','E':'У','R':'К','T':'Е','Y':'Н','U':'Г','I':'Ш','O':'Щ','P':'З','{':'Х','}':'Ъ',
        'A':'Ф','S':'Ы','D':'В','F':'А','G':'П','H':'Р','J':'О','K':'Л','L':'Д',':':'Ж','"':'Э',
        'Z':'Я','X':'Ч','C':'С','V':'М','B':'И','N':'Т','M':'Ь','<':'Б','>':'Ю','~':'Ё',
        '&':'?','?':','
    };

    const hasEng = /[a-zA-Z]/.test(str);
    const hasRus = /[а-яА-ЯёЁ]/.test(str);

    if (hasEng && !hasRus) {
        return str.split('').map(char => map[char] || char).join('');
    }

    return str;
}

function sortAZ(a, b) {
    return `${a.lastName} ${a.firstName} ${a.surName || ''}`.toLowerCase().localeCompare(`${b.lastName} ${b.firstName} ${a.surName || ''}`.toLowerCase(), 'ru');
}

function sortPosts(posts) {
    posts.sort((a, b) => {
            if (a.authorId === b.authorId) {
                return (a.title || '').localeCompare(b.title || '', 'ru');
            }
            return sortAZ(app.store.getAuthorById(a.authorId), app.store.getAuthorById(b.authorId))
        }
    );
}