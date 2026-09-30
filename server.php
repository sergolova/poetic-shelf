#!/usr/bin/env php
<?php
/**
 * MCP Server для проекта "Поэтическая Полка"
 * Запуск: php server.php /путь/к/папке/проекта
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

// Получаем папку проекта из аргументов или используем текущую
$projectDir = rtrim($argv[1] ?? __DIR__, '/\\');

if (!is_dir($projectDir)) {
    fwrite(STDERR, "Ошибка: Директория проекта '$projectDir' не найдена.\n");
    exit(1);
}

/**
 * Записывает сообщение в лог-файл операций.
 * @param string $dir Каталог проекта.
 * @param string $message Текст сообщения.
 */
function logMessage(string $dir, string $message): void {
    $logFile = $dir . '/mcp_server.log';
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($logFile, "[$timestamp] $message\n", FILE_APPEND);
}

/**
 * Описывает аргументы вызова инструмента для лога БЕЗ их содержимого.
 *
 * Лог не гимгинается и попадает в репозиторий вместе с бэкапами, поэтому
 * текст произведений и переводов в него не пишется: для отладки достаточно
 * знать, какие поля пришли и какого они размера. Раньше здесь был
 * json_encode($args), который выкладывал в открытый файл весь текст.
 *
 * @param array $args Аргументы инструмента.
 * @return string Компактное описание вида: {title: 42 симв., content: 1200 симв.}
 */
function describeArgs(array $args): string {
    if (empty($args)) return '[]';
    $parts = [];
    foreach ($args as $key => $value) {
        if (is_string($value)) {
            $parts[] = $key . ': ' . mb_strlen($value) . ' симв.';
        } elseif (is_scalar($value)) {
            $parts[] = $key . ': ' . var_export($value, true);
        } elseif (is_array($value)) {
            $parts[] = $key . ': ' . count($value) . ' эл.';
        } else {
            $parts[] = $key . ': (' . gettype($value) . ')';
        }
    }
    return '{' . implode(', ', $parts) . '}';
}

function getLatestBackupFile(string $dir): ?string {
    $files = glob($dir . '/stih_backup_*.json');
    if (empty($files)) return null;
    usort($files, function($a, $b) {
        return filemtime($a) <=> filemtime($b);
    });
    return end($files);
}

function loadData(string $dir): array {
    $file = getLatestBackupFile($dir);
    if (!$file) {
        logMessage($dir, "loadData: Бэкап-файлы не найдены. Будет создана пустая структура.");
        return [
            'meta' => [
                'appName' => 'Поэтическая Полка',
                'version' => '1.0',
                'createdAt' => date('c'),
                'modifiedAt' => date('c'),
                'modifiedBy' => 'agent',
                'authorsCount' => 0,
                'postsCount' => 0
            ],
            'authors' => []
        ];
    }
    logMessage($dir, "loadData: Загружены данные из файла: " . basename($file));
    return json_decode(file_get_contents($file), true) ?: [];
}

function saveData(string $dir, array $data): bool {
    // Обновляем мета-информацию перед сохранением
    if (!isset($data['meta']) || !is_array($data['meta'])) {
        $data['meta'] = [
            'appName' => 'Поэтическая Полка',
            'version' => '1.0'
        ];
    }
    if (!isset($data['meta']['createdAt'])) {
        $data['meta']['createdAt'] = date('c');
    }
    $data['meta']['modifiedAt'] = date('c');
    $data['meta']['modifiedBy'] = 'agent';
    $data['meta']['authorsCount'] = count($data['authors'] ?? []);

    $postsCount = 0;
    foreach ($data['authors'] ?? [] as $author) {
        $postsCount += count($author['posts'] ?? []);
    }
    $data['meta']['postsCount'] = $postsCount;

    // Формируем имя файла с текущей датой
    $dateStr = date('Y-m-d');
    $fileName = $dir . "/stih_backup_{$dateStr}.json";

    $success = file_put_contents($fileName, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
    if ($success) {
        logMessage($dir, "saveData: Успешно сохранены данные в файл: " . basename($fileName) . " (Авторов: {$data['meta']['authorsCount']}, Произведений: $postsCount)");
    } else {
        logMessage($dir, "saveData: ОШИБКА сохранения в файл: " . basename($fileName));
    }
    return $success;
}

function sendResponse($id, array $result): void {
    fwrite(STDOUT, json_encode(['jsonrpc' => '2.0', 'id' => $id, 'result' => $result]) . "\n");
}

function sendToolResult($id, $data): void {
    sendResponse($id, [
        'content' => [
            [
                'type' => 'text',
                'text' => is_string($data) ? $data : json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
            ]
        ]
    ]);
}

function sendError($id, int $code, string $message): void {
    fwrite(STDOUT, json_encode(['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]]) . "\n");
}

// Главный цикл обработки JSON-RPC
while (($line = fgets(STDIN)) !== false) {
    $line = trim($line);
    if (empty($line)) continue;

    $request = json_decode($line, true);
    if (!$request || !isset($request['method'])) continue;

    $id = $request['id'] ?? null;
    $method = $request['method'];

    if ($method === 'initialize') {
        logMessage($projectDir, "JSON-RPC: Получен запрос initialize");
        sendResponse($id, [
            'protocolVersion' => '2024-11-05',
            'capabilities' => ['tools' => (object)[]],
            'serverInfo' => ['name' => 'stih-mcp-server', 'version' => '1.0.0']
        ]);
    }
    elseif ($method === 'tools/list') {
        logMessage($projectDir, "JSON-RPC: Получен запрос tools/list");
        sendResponse($id, [
            'tools' => [
                [
                    'name' => 'get_library_stats',
                    'description' => 'Возвращает статистику библиотеки (meta) и путь к текущему файлу JSON.',
                    'inputSchema' => ['type' => 'object', 'properties' => (object)[]]
                ],
                [
                    'name' => 'list_authors',
                    'description' => 'Возвращает список всех авторов.',
                    'inputSchema' => ['type' => 'object', 'properties' => (object)[]]
                ],
                [
                    'name' => 'search_poems',
                    'description' => 'Ищет произведения по тексту или заголовку.',
                    'inputSchema' => [
                        'type' => 'object',
                        'properties' => [
                            'query' => ['type' => 'string', 'description' => 'Фраза для поиска']
                        ],
                        'required' => ['query']
                    ]
                ],
                [
                    'name' => 'get_poem',
                    'description' => 'Возвращает полное произведение по ID.',
                    'inputSchema' => [
                        'type' => 'object',
                        'properties' => [
                            'post_id' => ['type' => 'string', 'description' => 'ID произведения']
                        ],
                        'required' => ['post_id']
                    ]
                ],
                [
                    'name' => 'add_author',
                    'description' => 'Добавляет нового автора в библиотеку.',
                    'inputSchema' => [
                        'type' => 'object',
                        'properties' => [
                            'lastName' => ['type' => 'string'],
                            'firstName' => ['type' => 'string'],
                            'surName' => ['type' => 'string'],
                            'birthYear' => ['type' => 'integer'],
                            'deathYear' => ['type' => 'integer']
                        ],
                        'required' => ['lastName']
                    ]
                ],
                [
                    'name' => 'add_poem',
                    'description' => 'Добавляет произведение существующему автору.',
                    'inputSchema' => [
                        'type' => 'object',
                        'properties' => [
                            'author_query' => ['type' => 'string', 'description' => 'Фамилия автора или его ID'],
                            'title' => ['type' => 'string'],
                            'content' => ['type' => 'string'],
                            'year' => ['type' => 'integer'],
                            'note' => ['type' => 'string']
                        ],
                        'required' => ['author_query', 'title', 'content']
                    ]
                ],
                [
                    'name' => 'update_poem',
                    'description' => 'Обновляет существующее произведение.',
                    'inputSchema' => [
                        'type' => 'object',
                        'properties' => [
                            'post_id' => ['type' => 'string'],
                            'title' => ['type' => 'string'],
                            'content' => ['type' => 'string']
                        ],
                        'required' => ['post_id', 'title', 'content']
                    ]
                ]
            ]
        ]);
    }
    elseif ($method === 'tools/call') {
        $toolName = $request['params']['name'] ?? '';
        $args = $request['params']['arguments'] ?? [];
        logMessage($projectDir, "JSON-RPC: Вызов инструмента '$toolName' | Аргументы: " . describeArgs($args));
        $db = loadData($projectDir);

        switch ($toolName) {
            case 'get_library_stats':
                $file = getLatestBackupFile($projectDir);
                sendToolResult($id, [
                    'current_file' => $file ?: 'Файлы не найдены (будет создан новый)',
                    'meta' => $db['meta'] ?? []
                ]);
                break;

            case 'list_authors':
                $result = [];
                foreach ($db['authors'] ?? [] as $author) {
                    $result[] = [
                        'id' => $author['id'] ?? '',
                        'name' => trim(($author['lastName'] ?? '') . ' ' . ($author['firstName'] ?? '')),
                        'posts_count' => count($author['posts'] ?? [])
                    ];
                }
                sendToolResult($id, $result);
                break;

            case 'search_poems':
                $query = mb_strtolower($args['query'] ?? '');
                $matches = [];
                foreach ($db['authors'] ?? [] as $author) {
                    foreach ($author['posts'] ?? [] as $post) {
                        $title = mb_strtolower($post['title'] ?? '');
                        $content = mb_strtolower($post['content'] ?? '');
                        if (mb_strpos($title, $query) !== false || mb_strpos($content, $query) !== false) {
                            $matches[] = [
                                'post_id' => $post['id'],
                                'author' => trim(($author['lastName'] ?? '') . ' ' . ($author['firstName'] ?? '')),
                                'title' => $post['title'],
                                'snippet' => mb_substr($post['content'] ?? '', 0, 100) . '...'
                            ];
                        }
                    }
                }
                sendToolResult($id, $matches);
                break;

            case 'get_poem':
                $found = null;
                foreach ($db['authors'] ?? [] as $author) {
                    foreach ($author['posts'] ?? [] as $post) {
                        if ($post['id'] === $args['post_id']) {
                            $found = $post;
                            $found['author_name'] = trim(($author['lastName'] ?? '') . ' ' . ($author['firstName'] ?? ''));
                            break 2;
                        }
                    }
                }
                if ($found) {
                    sendToolResult($id, $found);
                } else {
                    logMessage($projectDir, "get_poem: Ошибка - произведение с ID '{$args['post_id']}' не найдено.");
                    sendError($id, 404, "Произведение не найдено");
                }
                break;

            case 'add_author':
                $newAuthor = [
                    'id' => 'author_' . time(),
                    'lastName' => $args['lastName'],
                    'firstName' => $args['firstName'] ?? '',
                    'surName' => $args['surName'] ?? '',
                    'birthYear' => $args['birthYear'] ?? null,
                    'deathYear' => $args['deathYear'] ?? null,
                    'photo' => '',
                    'posts' => []
                ];
                $db['authors'][] = $newAuthor;
                if (saveData($projectDir, $db)) {
                    logMessage($projectDir, "add_author: Добавлен новый автор '{$args['lastName']} {$args['firstName']}' (ID: {$newAuthor['id']})");
                    sendToolResult($id, ["status" => "success", "author_id" => $newAuthor['id']]);
                } else {
                    logMessage($projectDir, "add_author: Ошибка сохранения при добавлении автора '{$args['lastName']}'");
                    sendError($id, 500, "Ошибка сохранения");
                }
                break;

            case 'add_poem':
                $targetIndex = null;
                $query = mb_strtolower($args['author_query']);
                foreach ($db['authors'] ?? [] as $index => $author) {
                    if (($author['id'] ?? '') === $args['author_query'] || mb_strpos(mb_strtolower($author['lastName'] ?? ''), $query) !== false) {
                        $targetIndex = $index;
                        break;
                    }
                }

                if ($targetIndex === null) {
                    logMessage($projectDir, "add_poem: Ошибка - автор с запросом '{$args['author_query']}' не найден.");
                    sendError($id, 404, "Автор не найден");
                    break;
                }

                $newPost = [
                    'id' => 'post_' . time(),
                    'title' => $args['title'],
                    'content' => $args['content'],
                    'year' => $args['year'] ?? null,
                    'note' => $args['note'] ?? '',
                    'links' => []
                ];
                $db['authors'][$targetIndex]['posts'][] = $newPost;

                if (saveData($projectDir, $db)) {
                    $authorName = trim(($db['authors'][$targetIndex]['lastName'] ?? '') . ' ' . ($db['authors'][$targetIndex]['firstName'] ?? ''));
                    logMessage($projectDir, "add_poem: Добавлено произведение '{$args['title']}' автору '$authorName' (ID произведения: {$newPost['id']})");
                    sendToolResult($id, ["status" => "success", "post_id" => $newPost['id']]);
                } else {
                    logMessage($projectDir, "add_poem: Ошибка сохранения при добавлении произведения '{$args['title']}'");
                    sendError($id, 500, "Ошибка сохранения");
                }
                break;

            case 'update_poem':
                $updated = false;
                $authorName = '';
                foreach ($db['authors'] ?? [] as &$author) {
                    foreach ($author['posts'] ?? [] as &$post) {
                        if ($post['id'] === $args['post_id']) {
                            $post['title'] = $args['title'];
                            $post['content'] = $args['content'];
                            $updated = true;
                            $authorName = trim(($author['lastName'] ?? '') . ' ' . ($author['firstName'] ?? ''));
                            break 2;
                        }
                    }
                }
                if ($updated && saveData($projectDir, $db)) {
                    logMessage($projectDir, "update_poem: Обновлено произведение '{$args['title']}' автора '$authorName' (ID: {$args['post_id']})");
                    sendToolResult($id, ["status" => "success"]);
                } else {
                    logMessage($projectDir, "update_poem: Ошибка - произведение с ID '{$args['post_id']}' не найдено или ошибка сохранения.");
                    sendError($id, 404, "Произведение не найдено или ошибка сохранения");
                }
                break;

            default:
                logMessage($projectDir, "tools/call: Неизвестный инструмент '$toolName'");
                sendError($id, -32601, "Инструмент не найден");
        }
    }
    else {
        logMessage($projectDir, "JSON-RPC: Неизвестный метод '$method'");
    }
}