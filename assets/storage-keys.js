/**
 * ==========================================================================
 * assets/storage-keys.js
 * Ключи localStorage и значения настроек в одном месте.
 *
 * Раньше ключи писались строкой прямо в коде ('appTheme', 'columns',
 * 'unsavedChangesCount', …), и опечатка в любом из 33 обращений тихо
 * ломала настройку без единой ошибки. Здесь имена и допустимые значения
 * объявлены явно, а index.html подключает этот файл ПЕРВЫМ — раньше
 * jquery и остальных скриптов.
 *
 * ВАЖНО: файл не ES-модуль, а обычный <script> с глобальными константами
 * (как остальной проект). Не добавлять export/import — их здесь не
 * поддерживает сборка (сборщика в проекте нет).
 * ==========================================================================
 */

/** Ключи, под которыми приложение пишет в localStorage. */
const STORAGE_KEYS = {
    /** Основные данные библиотеки (авторы + произведения). */
    DATA: 'poetic_shelf_data',

    /** Тема оформления: значения THEME.DARK / THEME.LIGHT. */
    THEME: 'appTheme',

    /** Размер шрифта: значения FONT_SIZE.* */
    FONT_SIZE: 'fontSize',

    /** Число колонок. Значение COLUMNS.PARALLEL включает режим
     *  «оригинал | перевод» для произведений, распознанных как перевод
     *  (см. detectTranslationPattern в ui.js). */
    COLUMNS: 'columns',

    /** Режим сортировки авторов: SORT_AUTHORS.* */
    AUTHOR_SORT: 'authorSortMode',

    /** Метки времени последнего просмотра: { authorId: timestamp }. */
    LAST_VIEWED: 'lastViewed',

    /** Закладки произведений: { postId: true }. */
    POST_BOOKMARKS: 'postBookmarks',

    /** Выбранный автор (id). */
    SELECTED_AUTHOR: 'selectedAuthorId',

    /** Выбранное произведение (id). */
    SELECTED_POST: 'selectedPostId',

    /** Ширина сайдбара со списком авторов, в пикселях. */
    SIDEBAR_WIDTH: 'authorsSidebarWidth',

    /** Счётчик несохранённых изменений (для бейджа в шапке). */
    UNSAVED_COUNT: 'unsavedChangesCount',

    /** Метка времени последнего изменения данных. */
    LAST_CHANGE: 'lastChangeTimestamp',

    /** Метка времени последнего экспорта (сбрасывает счётчик). */
    LAST_EXPORT: 'lastExportTimestamp',

    /** ID авторов, отобранных для экспорта в EPUB: string[]. */
    EPUB_AUTHORS: 'epubSelectedAuthors',

    /** Индекс последнего показанного поэтического заголовка. */
    TITLE_INDEX: 'poeticTitleIndex',

    /** Индекс последнего показанного поэтического подзаголовка. */
    SUBTITLE_INDEX: 'poeticSubtitleIndex'
};

/** Допустимые значения THEME. */
const THEME = {
    DARK: 'dark',
    LIGHT: 'light',
    AUTO: 'auto'
};

/** Допустимые значения FONT_SIZE. */
const FONT_SIZE = {
    SMALL: 'small',
    NORMAL: 'normal',
    LARGE: 'large'
};

/** Допустимые значения COLUMNS: 1..4 либо PARALLEL. */
const COLUMNS = {
    ONE: '1',
    TWO: '2',
    THREE: '3',
    FOUR: '4',
    /** Две колонки «оригинал | перевод» вместо числовых колонок. */
    PARALLEL: 'parallel'
};

/** Допустимые значения AUTHOR_SORT (выбираются в панели настроек). */
const SORT_AUTHORS = {
    NONE: 'none',
    ALPHABET: 'az',
    BIRTHDAY: 'birthday',
    POSTS_COUNT: 'len',
    RECENT: 'recent'
};

/** Значение по умолчанию для ключа, когда он ещё не записан. */
const STORAGE_DEFAULTS = {
    THEME: THEME.LIGHT,
    FONT_SIZE: FONT_SIZE.NORMAL,
    COLUMNS: COLUMNS.ONE,
    AUTHOR_SORT: SORT_AUTHORS.NONE
};
