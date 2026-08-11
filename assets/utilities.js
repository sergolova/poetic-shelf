/**
 * Утилита: Сжатие изображения через Canvas в Base64 (JPEG)
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
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * Утилита: Загрузка изображения по URL и конвертация в сжатый Base64
 */
function imageUrlToBase64(url, maxWidth = 300, maxHeight = 300, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            try {
                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            } catch (err) {
                reject(new Error('CORS запрещает сжатие этой картинки на клиенте'));
            }
        };

        img.onerror = () => reject(new Error('Не удалось загрузить изображение по указанному URL'));
    });
}

/**
 * Утилита: Очистка текста от мусорных хвостов сайтов и линков из буфера
 */
function cleanPastedText(text) {
    if (!text) return '';
    return text
        // 1. Удаляем приставки источников ("Источник: https://...", "Подробнее: http...", "Взято с: ...")
        .replace(/(?:Источник|Подробнее|Взято с|Read more)?\s*:?\s*https?:\/\/\S+/gi, '')
        // 2. Убираем лишние пустые строки на концах, оставшиеся после вырезания
        .trim();
}

/**
 * Утилита: Парсинг строки ФИО и годов жизни
 */
function parseAuthorText(rawText) {
    const result = {
        parts: [],
        birthYear: null,
        deathYear: null
    };

    if (!rawText || !rawText.trim()) return result;

    // Чистим ссылки и копирайты
    let text = cleanPastedText(rawText);

    // Удаляем знаки ударения (Unicode combining characters)
    text = text.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC');

    // Сначала находим годы (пока текст не обрезан)
    const allYears = text.match(/\b(\d{4})\b/g);
    
    if (allYears && allYears.length >= 2) {
        result.birthYear = parseInt(allYears[0], 10);
        result.deathYear = parseInt(allYears[1], 10);
    } else if (allYears && allYears.length === 1) {
        result.birthYear = parseInt(allYears[0], 10);
    }

    // Удаляем скобки с содержимым
    text = text.replace(/\([^)]*\)/g, '').trim();
    text = text.replace(/\[[^\]]*\]/g, '').trim();

    // Удаляем всё начиная с первого года (если он был вне скобок)
    text = text.replace(/\b\d{4}\b.*$/, '').trim();

    // Удаляем остатки: числа, запятые, двоеточия, точки с запятой
    text = text.replace(/\b\d+\b/g, '').trim();
    text = text.replace(/[(),:;]/g, '').trim();

    // Разбиваем на части, фильтруем пустые и берём максимум 3 слова
    result.parts = text.split(/\s+/).filter(Boolean).slice(0, 3);

    return result;
}

function scrollToAuthorInSidebar(authorId) {
    if (!authorId) return;

    const $container = $('#authorsList');
    const $targetLink = $container.find(`.author-card[data-id="${authorId}"]`);

    if (!$targetLink.length) return;

    $container.find('.author-card').removeClass('active');
    $targetLink.addClass('active');

    $targetLink[0].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
    });
}
/**
 * Распределяет части имени по полям в зависимости от порядка
 */
function distributeNameParts(parts, order) {
    const result = { lastName: '', firstName: '', surName: '' };
    
    if (!parts || parts.length === 0) return result;
    
    switch (order) {
        case 'FIO': // Фамилия Имя Отчество
            result.lastName = parts[0] || '';
            result.firstName = parts[1] || '';
            result.surName = parts[2] || '';
            break;
        case 'IFO': // Имя Фамилия Отчество
            result.firstName = parts[0] || '';
            result.lastName = parts[1] || '';
            result.surName = parts[2] || '';
            break;
        case 'IOF': // Имя Отчество Фамилия
            result.firstName = parts[0] || '';
            result.surName = parts[1] || '';
            result.lastName = parts[2] || '';
            break;
    }
    
    return result;
}

/**
 * Утилита: Нормализация Unicode (NFC) для приведения составных символов к единым
 * Например: "й" (и + кратка) → "й" (единый символ), "ё" (е + диереза) → "ё"
 */
function normalizeUnicode(text) {
    if (!text) return '';
    return text.normalize('NFC');
}

/**
 * Утилита: Очистка числового значения от мусора
 */
function cleanNumericValue(value) {
    if (!value) return '';
    // Оставляем только цифры
    const cleaned = String(value).replace(/[^\d]/g, '');
    return cleaned;
}

/**
 * 1. STORE: Хранилище данных и CRUD
 */

function extractFirstLine(textOrHtml, isHtml = false) {
    if (!textOrHtml) return 'Без названия';

    let text = textOrHtml;

    if (isHtml) {
        // Временный элемент для очистки HTML-тегов и считывания чистого текста
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = textOrHtml;
        text = tempDiv.textContent || tempDiv.innerText || '';
    }

    // Разбиваем по переносам строк и берем первую непустую
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length > 0) {
        // Обрезаем знаки препинания в конце, если это заголовок
        return lines[0].replace(/[.,;:!?—–\-]+$/, '').trim();
    }

    return 'Без названия';
}
